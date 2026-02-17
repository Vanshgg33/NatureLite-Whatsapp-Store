import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderItem, TimelineEntry, OrderStatus } from './schemas/order.schema';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { CouponsService } from '../coupons/coupons.service';
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
import { PaginatedResult, paginate } from '@/common/types/pagination.types';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private cartService: CartService,
    private productsService: ProductsService,
    private usersService: UsersService,
    private couponsService: CouponsService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
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
        const product = await this.productsService.findById(item.productId);
        let price = product.price;

        if (item.variantSku) {
          const variant = product.variants.find((v) => v.sku === item.variantSku);
          if (variant) {
            price = variant.price;
          }
        }

        const orderItem: OrderItem = {
          product: new Types.ObjectId(item.productId),
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

    const gstTotal = orderItems.reduce((sum, item) => sum + item.gstAmount, 0);
    const shippingCharge = subtotal >= 500 ? 0 : 50;
    const total = subtotal - discount + shippingCharge;

    const orderNumber = await this.generateOrderNumber();

    const order = new this.orderModel({
      orderNumber,
      user: new Types.ObjectId(userId),
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
    });

    const savedOrder = await order.save();

    for (const item of orderItems) {
      await this.productsService.decrementStock(
        item.product.toString(),
        item.quantity,
        item.variantSku,
      );
    }

    if (dto.cartId) {
      await this.cartService.clearCart(userId);
    }

    await this.usersService.updateOrderStats(userId, total);

    return savedOrder;
  }

  async findAll(query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    const {
      page = 1,
      limit = 20,
      userId,
      status,
      paymentStatus,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const filter: Record<string, unknown> = {};

    if (userId) {
      filter.user = new Types.ObjectId(userId);
    }

    if (status) {
      filter.status = status;
    }

    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'shippingAddress.name': { $regex: search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: search, $options: 'i' } },
        { awbNumber: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        (filter.createdAt as Record<string, Date>).$gte = new Date(startDate);
      }
      if (endDate) {
        (filter.createdAt as Record<string, Date>).$lte = new Date(endDate);
      }
    }

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .populate('user', 'phone name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);

    return paginate(orders, total, { page, limit });
  }

  async findById(id: string): Promise<Order> {
    const order = await this.orderModel
      .findById(id)
      .populate('user', 'phone name email addresses')
      .populate('items.product', 'name slug images');

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order> {
    const order = await this.orderModel
      .findOne({ orderNumber })
      .populate('user', 'phone name email');

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async findUserOrders(userId: string, limit: number = 10): Promise<Order[]> {
    return this.orderModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    const order = await this.orderModel.findById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
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

    return order.save();
  }

  async updatePaymentStatus(id: string, dto: UpdatePaymentStatusDto): Promise<Order> {
    const order = await this.orderModel.findById(id);

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
    const order = await this.orderModel.findById(id);

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

    return order.save();
  }

  async addNote(id: string, dto: AddOrderNoteDto): Promise<Order> {
    const order = await this.orderModel.findById(id);

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
    const order = await this.orderModel.findById(id);

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
    const order = await this.orderModel.findByIdAndUpdate(
      id,
      { $set: { priorityTags: tags } },
      { new: true },
    );

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async reorder(userId: string, dto: ReorderDto): Promise<Order> {
    const originalOrder = await this.orderModel.findById(dto.orderId);

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
    const matchStage: Record<string, unknown> = {};

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        (matchStage.createdAt as Record<string, Date>).$gte = startDate;
      }
      if (endDate) {
        (matchStage.createdAt as Record<string, Date>).$lte = endDate;
      }
    }

    const stats = await this.orderModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          avgOrderValue: { $avg: '$total' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          pendingOrders: {
            $sum: {
              $cond: [
                { $in: ['$status', ['pending', 'confirmed', 'processing']] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    return stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      pendingOrders: 0,
    };
  }

  async getOrdersByStatus(): Promise<Record<OrderStatus, number>> {
    const result = await this.orderModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusCounts: Partial<Record<OrderStatus, number>> = {};
    result.forEach((item) => {
      statusCounts[item._id as OrderStatus] = item.count;
    });

    return statusCounts as Record<OrderStatus, number>;
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const lastOrder = await this.orderModel
      .findOne({ orderNumber: { $regex: `^ORD${dateStr}` } })
      .sort({ orderNumber: -1 });

    let sequence = 1;

    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.slice(-4), 10);
      sequence = lastSequence + 1;
    }

    return `ORD${dateStr}${sequence.toString().padStart(4, '0')}`;
  }
}
