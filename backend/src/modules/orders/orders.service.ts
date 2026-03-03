import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Types, Connection } from 'mongoose';
import { Order, OrderItem, TimelineEntry, OrderStatus } from './schemas/order.schema';
import { OrderRepository } from './repositories/order.repository';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { CouponsService } from '../coupons/coupons.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { StoresService } from '../stores/stores.service';
import { StoreStockService } from '../store-stock/store-stock.service';
import { StoreSalesService } from '../store-sales/store-sales.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
  CancelOrderDto,
  AddOrderNoteDto,
  UpdateShippingDto,
  OrderQueryDto,
  ReorderDto,
} from './dto/order.dto';
import { PaginatedResult } from '@/common/types/pagination.types';
import { parseObjectId } from '@/common/utils/objectid.util';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    @InjectConnection() private connection: Connection,
    private cartService: CartService,
    private productsService: ProductsService,
    private usersService: UsersService,
    private couponsService: CouponsService,
    private emailService: EmailService,
    private settingsService: SettingsService,
    private storesService: StoresService,
    private storeStockService: StoreStockService,
    private storeSalesService: StoreSalesService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    const userObjId = parseObjectId(userId, 'userId');
    // Use transaction for atomic order creation
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      let orderItems: OrderItem[] = [];
      let subtotal = 0;

      if (dto.cartId) {
        const cart = await this.cartService.getCart(userId);

        if (cart.items.length === 0) {
          throw new BadRequestException('Cart is empty');
        }

        for (const item of cart.items) {
          const product = await this.productsService.findById(item.product.id);

          const orderItem: OrderItem = {
            product: new Types.ObjectId(item.product.id),
            name: product.name,
            variantSku: item.variantSku,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
            image: product.images[0],
            gstAmount: (item.price * item.quantity * product.gstPercentage) / 100,
          };

          orderItems.push(orderItem);
          subtotal += orderItem.total;
        }
      } else if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          const productIdObj = parseObjectId(item.productId, 'items[].productId');
          const product = await this.productsService.findById(item.productId);
          let price = product.price;

          if (item.variantSku) {
            const variant = product.variants.find((v) => v.sku === item.variantSku);
            if (variant) {
              price = variant.price;
            }
          }

          const orderItem: OrderItem = {
            product: productIdObj,
            name: product.name,
            variantSku: item.variantSku,
            variantName: item.variantSku
              ? product.variants.find((v) => v.sku === item.variantSku)?.name
              : undefined,
            quantity: item.quantity,
            price,
            total: price * item.quantity,
            image: product.images[0],
            gstAmount: (price * item.quantity * product.gstPercentage) / 100,
          };

          orderItems.push(orderItem);
          subtotal += orderItem.total;
        }
      } else {
        throw new BadRequestException('Either cartId or items must be provided');
      }

      let discount = 0;
      if (dto.couponCode) {
        const validation = await this.couponsService.validateCoupon({
          code: dto.couponCode,
          orderAmount: subtotal,
          userId,
        });

        if (validation.valid) {
          discount = validation.discountAmount;
          await this.couponsService.incrementUsageCount(dto.couponCode);
        }
      }

      // Get shipping settings instead of hard-coded values
      let freeShippingThreshold = 500;
      let defaultShippingCharge = 50;
      try {
        const checkoutSettings = await this.settingsService.get('checkout');
        if (checkoutSettings?.value) {
          freeShippingThreshold = (checkoutSettings.value as any).freeShippingThreshold || 500;
          defaultShippingCharge = (checkoutSettings.value as any).defaultShippingCharge || 50;
        }
      } catch {
        // Use defaults if settings unavailable
      }

      const gstTotal = orderItems.reduce((sum, item) => sum + item.gstAmount, 0);
      const shippingCharge = subtotal >= freeShippingThreshold ? 0 : defaultShippingCharge;
      const total = subtotal - discount + shippingCharge;

      const orderNumber = await this.generateOrderNumber();

      const savedOrder = await this.orderRepository.createWithSession(
        {
          orderNumber,
          user: userObjId,
          items: orderItems,
          shippingAddress: dto.shippingAddress,
          paymentMethod: dto.paymentMethod,
          subtotal,
          discount,
          couponCode: dto.couponCode,
          shippingCharge,
          gstTotal,
          total,
          notes: dto.notes,
          timeline: [
            {
              status: 'pending',
              message: 'Order placed successfully',
              timestamp: new Date(),
            },
          ],
        },
        session,
      );

      // Decrement stock from main store (Raipur) for website orders
      const mainStore = await this.storesService.findMainStore();
      const mainStoreId = mainStore._id.toString();

      for (const item of orderItems) {
        await this.storeStockService.decrementStock(
          mainStoreId,
          item.product.toString(),
          item.quantity,
          item.variantSku,
        );
        // Keep global totalSold counter updated
        await this.productsService.incrementTotalSold(
          item.product.toString(),
          item.quantity,
        );
      }

      if (dto.cartId) {
        await this.cartService.clearCart(userId);
      }

      await this.usersService.updateOrderStats(userId, total);

      await session.commitTransaction();

      // Auto-log as website sale for the main store (non-blocking)
      try {
        await this.storeSalesService.createFromOrder(savedOrder.toObject(), mainStoreId);
      } catch (saleError) {
        this.logger.warn(`Failed to auto-log website sale: ${saleError.message}`);
      }

      // Send order confirmation email (non-blocking, after transaction)
      try {
        const user = await this.usersService.findById(userId);
        if (user?.email) {
          this.emailService.sendOrderConfirmation(savedOrder.toObject(), user.email);
        }
      } catch (emailError) {
        this.logger.warn(`Failed to send order confirmation email: ${emailError.message}`);
      }

      return savedOrder;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAll(query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    return this.orderRepository.findAllPaginated(query);
  }

  async findById(id: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findByIdWithUserAndItems(idObj);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order> {
    const order = await this.orderRepository.findOneByOrderNumber(orderNumber);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async findUserOrders(userId: string, limit: number = 10): Promise<Order[]> {
    const userObjId = parseObjectId(userId, 'userId');
    return this.orderRepository.findUserOrders(userObjId, limit);
  }

  private static readonly VALID_TRANSITIONS: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['out_for_delivery', 'delivered', 'returned'],
    out_for_delivery: ['delivered', 'returned'],
    delivered: ['returned', 'refunded'],
    cancelled: [],
    returned: ['refunded'],
    refunded: [],
  };

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowedNext = OrdersService.VALID_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from "${order.status}" to "${dto.status}". Allowed: ${allowedNext.join(', ') || 'none'}`,
      );
    }

    const timelineEntry: TimelineEntry = {
      status: dto.status,
      message: dto.message || `Order status updated to ${dto.status}`,
      timestamp: new Date(),
      updatedBy: dto.updatedBy,
    };

    order.status = dto.status;
    order.timeline.push(timelineEntry);

    if (dto.status === 'delivered') {
      order.deliveredAt = new Date();
    }

    const savedOrder = await order.save();

    // Send email notifications based on status change (non-blocking)
    try {
      const user = await this.usersService.findById(order.user.toString());
      if (user?.email) {
        const orderObj = savedOrder.toObject();
        if (dto.status === 'shipped') {
          this.emailService.sendShippingUpdate(orderObj, user.email);
        } else if (dto.status === 'delivered') {
          this.emailService.sendDeliveryConfirmation(orderObj, user.email);
        }
      }
    } catch (emailError) {
      this.logger.warn(`Failed to send status update email: ${emailError.message}`);
    }

    return savedOrder;
  }

  async updatePaymentStatus(id: string, dto: UpdatePaymentStatusDto): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.paymentStatus = dto.paymentStatus;

    const timelineEntry: TimelineEntry = {
      status: order.status,
      message: `Payment status updated to ${dto.paymentStatus}`,
      timestamp: new Date(),
    };

    order.timeline.push(timelineEntry);

    return order.save();
  }

  async cancelOrder(id: string, dto: CancelOrderDto, cancelledBy?: string): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
      throw new BadRequestException('Order cannot be cancelled');
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = dto.reason;

    const timelineEntry: TimelineEntry = {
      status: 'cancelled',
      message: `Order cancelled: ${dto.reason}`,
      timestamp: new Date(),
      updatedBy: cancelledBy,
    };

    order.timeline.push(timelineEntry);

    const savedOrder = await order.save();

    // Send cancellation email (non-blocking)
    try {
      const user = await this.usersService.findById(order.user.toString());
      if (user?.email) {
        this.emailService.sendOrderCancelled(savedOrder.toObject(), user.email);
      }
    } catch (emailError) {
      this.logger.warn(`Failed to send cancellation email: ${emailError.message}`);
    }

    return savedOrder;
  }

  async addNote(id: string, dto: AddOrderNoteDto): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const existingNotes = order.adminNotes || '';
    order.adminNotes = existingNotes
      ? `${existingNotes}\n[${new Date().toISOString()}] ${dto.note}`
      : `[${new Date().toISOString()}] ${dto.note}`;

    return order.save();
  }

  async updateShipping(id: string, dto: UpdateShippingDto): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findById(idObj);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (dto.awbNumber) order.awbNumber = dto.awbNumber;
    if (dto.courierName) order.courierName = dto.courierName;
    if (dto.trackingUrl) order.trackingUrl = dto.trackingUrl;
    if (dto.expectedDeliveryDate) {
      order.expectedDeliveryDate = new Date(dto.expectedDeliveryDate);
    }

    return order.save();
  }

  async setPriorityTags(id: string, tags: string[]): Promise<Order> {
    const idObj = parseObjectId(id, 'id');
    const order = await this.orderRepository.findByIdAndUpdate(idObj, {
      $set: { priorityTags: tags },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async reorder(userId: string, dto: ReorderDto): Promise<Order> {
    parseObjectId(userId, 'userId');
    const orderIdObj = parseObjectId(dto.orderId, 'orderId');
    const originalOrder = await this.orderRepository.findById(orderIdObj);

    if (!originalOrder) {
      throw new NotFoundException('Original order not found');
    }

    const items = originalOrder.items.map((item) => ({
      productId: item.product.toString(),
      variantSku: item.variantSku,
      quantity: item.quantity,
    }));

    return this.create(userId, {
      items,
      shippingAddress: dto.shippingAddress || {
        name: originalOrder.shippingAddress.name,
        phone: originalOrder.shippingAddress.phone,
        street: originalOrder.shippingAddress.street,
        city: originalOrder.shippingAddress.city,
        state: originalOrder.shippingAddress.state,
        pincode: originalOrder.shippingAddress.pincode,
        landmark: originalOrder.shippingAddress.landmark,
      },
      paymentMethod: originalOrder.paymentMethod,
    });
  }

  async getOrderStats(startDate?: Date, endDate?: Date): Promise<Record<string, unknown>> {
    return this.orderRepository.getOrderStats(startDate, endDate);
  }

  async getOrdersByStatus(): Promise<Record<OrderStatus, number>> {
    return this.orderRepository.getOrdersByStatus();
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const lastOrder = await this.orderRepository.findOneByOrderNumberPrefix(`ORD${dateStr}`);
    let sequence = 1;
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.slice(-4), 10);
      sequence = lastSequence + 1;
    }
    return `ORD${dateStr}${sequence.toString().padStart(4, '0')}`;
  }
}
