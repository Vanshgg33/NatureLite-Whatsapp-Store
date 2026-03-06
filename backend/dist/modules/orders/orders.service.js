"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const order_repository_1 = require("./repositories/order.repository");
const cart_service_1 = require("../cart/cart.service");
const products_service_1 = require("../products/products.service");
const users_service_1 = require("../users/users.service");
const coupons_service_1 = require("../coupons/coupons.service");
const email_service_1 = require("../email/email.service");
const settings_service_1 = require("../settings/settings.service");
const stores_service_1 = require("../stores/stores.service");
const store_stock_service_1 = require("../store-stock/store-stock.service");
const store_sales_service_1 = require("../store-sales/store-sales.service");
const wallet_service_1 = require("../wallet/wallet.service");
const objectid_util_1 = require("../../common/utils/objectid.util");
let OrdersService = OrdersService_1 = class OrdersService {
    constructor(orderRepository, connection, cartService, productsService, usersService, couponsService, emailService, settingsService, storesService, storeStockService, storeSalesService, walletService) {
        this.orderRepository = orderRepository;
        this.connection = connection;
        this.cartService = cartService;
        this.productsService = productsService;
        this.usersService = usersService;
        this.couponsService = couponsService;
        this.emailService = emailService;
        this.settingsService = settingsService;
        this.storesService = storesService;
        this.storeStockService = storeStockService;
        this.storeSalesService = storeSalesService;
        this.walletService = walletService;
        this.logger = new common_1.Logger(OrdersService_1.name);
    }
    async create(userId, dto) {
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        const session = await this.connection.startSession();
        session.startTransaction();
        try {
            let orderItems = [];
            let subtotal = 0;
            if (dto.cartId) {
                const cart = await this.cartService.getCart(userId);
                if (cart.items.length === 0) {
                    throw new common_1.BadRequestException('Cart is empty');
                }
                for (const item of cart.items) {
                    const product = await this.productsService.findById(item.product.id);
                    const orderItem = {
                        product: new mongoose_2.Types.ObjectId(item.product.id),
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
            }
            else if (dto.items && dto.items.length > 0) {
                for (const item of dto.items) {
                    const productIdObj = (0, objectid_util_1.parseObjectId)(item.productId, 'items[].productId');
                    const product = await this.productsService.findById(item.productId);
                    let price = product.price;
                    if (item.variantSku) {
                        const variant = product.variants.find((v) => v.sku === item.variantSku);
                        if (variant) {
                            price = variant.price;
                        }
                    }
                    const orderItem = {
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
            }
            else {
                throw new common_1.BadRequestException('Either cartId or items must be provided');
            }
            const pincode = dto.shippingAddress?.pincode;
            const SERVICEABLE_PINCODE_PREFIXES = ['492', '490', '491', '495'];
            if (!pincode ||
                !SERVICEABLE_PINCODE_PREFIXES.some((prefix) => pincode.startsWith(prefix))) {
                throw new common_1.BadRequestException('We currently do not deliver to this pincode.');
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
            let freeShippingThreshold = 500;
            let defaultShippingCharge = 50;
            try {
                const checkoutSettings = await this.settingsService.get('checkout');
                if (checkoutSettings?.value) {
                    freeShippingThreshold = checkoutSettings.value.freeShippingThreshold || 500;
                    defaultShippingCharge = checkoutSettings.value.defaultShippingCharge || 50;
                }
            }
            catch {
            }
            const gstTotal = orderItems.reduce((sum, item) => sum + item.gstAmount, 0);
            const shippingCharge = subtotal >= freeShippingThreshold ? 0 : defaultShippingCharge;
            const totalBeforeWallet = subtotal - discount + shippingCharge;
            let walletUsedPaise = 0;
            let paymentGatewayAmountPaise = Math.round(totalBeforeWallet * 100);
            if (dto.walletAmount && dto.walletAmount > 0) {
                if (dto.paymentMethod !== 'prepaid') {
                    throw new common_1.BadRequestException('Wallet amount can only be used with prepaid payment method');
                }
                const requestedPaise = Math.round(dto.walletAmount * 100);
                const walletBalancePaise = await this.walletService.getBalance(userId);
                walletUsedPaise = Math.min(requestedPaise, walletBalancePaise, paymentGatewayAmountPaise);
                if (walletUsedPaise > 0) {
                    await this.walletService.debit(userId, walletUsedPaise, 'order_payment', { tentativeTotal: totalBeforeWallet }, session);
                    paymentGatewayAmountPaise -= walletUsedPaise;
                }
            }
            const total = totalBeforeWallet;
            const orderNumber = await this.generateOrderNumber();
            const savedOrder = await this.orderRepository.createWithSession({
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
                walletUsed: walletUsedPaise,
                paymentGatewayAmount: paymentGatewayAmountPaise,
                total,
                notes: dto.notes,
                timeline: [
                    {
                        status: 'pending',
                        message: 'Order placed successfully',
                        timestamp: new Date(),
                    },
                ],
            }, session);
            const mainStore = await this.storesService.findMainStore();
            const mainStoreId = mainStore._id.toString();
            for (const item of orderItems) {
                await this.storeStockService.decrementStock(mainStoreId, item.product.toString(), item.quantity, item.variantSku, session);
                await this.productsService.incrementTotalSold(item.product.toString(), item.quantity);
            }
            if (dto.cartId) {
                await this.cartService.clearCart(userId);
            }
            await this.usersService.updateOrderStats(userId, total);
            await session.commitTransaction();
            try {
                await this.storeSalesService.createFromOrder(savedOrder.toObject(), mainStoreId);
            }
            catch (saleError) {
                this.logger.warn(`Failed to auto-log website sale: ${saleError.message}`);
            }
            try {
                const user = await this.usersService.findById(userId);
                if (user?.email) {
                    this.emailService.sendOrderConfirmation(savedOrder.toObject(), user.email);
                }
            }
            catch (emailError) {
                this.logger.warn(`Failed to send order confirmation email: ${emailError.message}`);
            }
            return savedOrder;
        }
        catch (error) {
            await session.abortTransaction();
            throw error;
        }
        finally {
            session.endSession();
        }
    }
    async findAll(query) {
        return this.orderRepository.findAllPaginated(query);
    }
    async findById(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findByIdWithUserAndItems(idObj);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async findByOrderNumber(orderNumber) {
        const order = await this.orderRepository.findOneByOrderNumber(orderNumber);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async findUserOrders(userId, limit = 10) {
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        return this.orderRepository.findUserOrders(userObjId, limit);
    }
    async createGuestOrder(dto) {
        const user = await this.usersService.findOrCreateByPhone(dto.phone);
        const updates = {};
        if (dto.name && !user.name)
            updates.name = dto.name;
        if (dto.email && !user.email)
            updates.email = dto.email;
        if (Object.keys(updates).length > 0) {
            await this.usersService.update(user._id.toString(), updates);
        }
        const createDto = {
            items: dto.items,
            shippingAddress: dto.shippingAddress,
            paymentMethod: dto.paymentMethod,
            couponCode: dto.couponCode,
            notes: dto.notes,
            walletAmount: dto.walletAmount,
        };
        return this.create(user._id.toString(), createDto);
    }
    async updateStatus(id, dto, departmentType) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (departmentType) {
            if (departmentType === 'packing' && (dto.status !== 'shipped' || order.status !== 'processing')) {
                throw new common_1.BadRequestException('Packing can only mark orders as shipped from processing.');
            }
            if (departmentType === 'billing' && (dto.status !== 'out_for_delivery' || order.status !== 'shipped')) {
                throw new common_1.BadRequestException('Billing can only set status to out for delivery from shipped.');
            }
            if (departmentType === 'delivery') {
                throw new common_1.BadRequestException('Delivery staff must use the delivery workflow endpoint, not status update.');
            }
        }
        const allowedNext = OrdersService_1.VALID_TRANSITIONS[order.status] || [];
        if (!allowedNext.includes(dto.status)) {
            throw new common_1.BadRequestException(`Cannot transition from "${order.status}" to "${dto.status}". Allowed: ${allowedNext.join(', ') || 'none'}`);
        }
        const timelineEntry = {
            status: dto.status,
            message: dto.message || `Order status updated to ${dto.status}`,
            timestamp: new Date(),
            updatedBy: dto.updatedBy,
        };
        order.status = dto.status;
        order.timeline.push(timelineEntry);
        if (dto.status === 'shipped') {
            order.packedAt = new Date();
            if (dto.updatedBy)
                order.packedBy = dto.updatedBy;
        }
        else if (dto.status === 'out_for_delivery') {
            order.outForDeliveryAt = new Date();
            if (dto.updatedBy) {
                order.billedAt = new Date();
                order.billedBy = dto.updatedBy;
            }
        }
        else if (dto.status === 'delivered') {
            order.deliveredAt = new Date();
        }
        const savedOrder = await order.save();
        try {
            const user = await this.usersService.findById(order.user.toString());
            if (user?.email) {
                const orderObj = savedOrder.toObject();
                if (dto.status === 'shipped') {
                    this.emailService.sendShippingUpdate(orderObj, user.email);
                }
                else if (dto.status === 'delivered') {
                    this.emailService.sendDeliveryConfirmation(orderObj, user.email);
                }
            }
        }
        catch (emailError) {
            this.logger.warn(`Failed to send status update email: ${emailError.message}`);
        }
        return savedOrder;
    }
    async updatePaymentStatus(id, dto) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        order.paymentStatus = dto.paymentStatus;
        const timelineEntry = {
            status: order.status,
            message: `Payment status updated to ${dto.paymentStatus}`,
            timestamp: new Date(),
        };
        order.timeline.push(timelineEntry);
        return order.save();
    }
    async updateDeliveryWorkflow(id, dto, updatedBy, departmentType) {
        if (departmentType && departmentType !== 'delivery') {
            throw new common_1.BadRequestException('Only delivery staff can update delivery workflow.');
        }
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        const metadata = order.metadata || {};
        const existingWorkflow = (metadata.deliveryWorkflow || {});
        const workflow = {
            ...existingWorkflow,
            status: dto.status,
            paymentMethod: dto.paymentMethod,
            paymentProofUrl: dto.paymentProofUrl,
            note: dto.note,
            updatedBy,
            updatedAt: new Date(),
        };
        metadata.deliveryWorkflow = workflow;
        order.metadata = metadata;
        if (dto.status === 'delivery_done') {
            if (order.paymentStatus !== 'paid') {
                if (order.paymentMethod === 'cod') {
                    order.paymentStatus = 'paid';
                }
                else {
                    throw new common_1.BadRequestException('Cannot mark as delivered: payment is not yet paid. Complete payment or reconcile first.');
                }
            }
            order.status = 'delivered';
            order.deliveredAt = new Date();
        }
        const timelineEntry = {
            status: dto.status,
            message: dto.note ||
                `Delivery status updated to ${dto.status.replace(/_/g, ' ')}`.trim(),
            timestamp: new Date(),
            updatedBy,
            metadata: {
                paymentMethod: dto.paymentMethod,
                paymentProofUrl: dto.paymentProofUrl,
            },
        };
        order.timeline.push(timelineEntry);
        return order.save();
    }
    async cancelOrder(id, dto, cancelledBy) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
            throw new common_1.BadRequestException('Order cannot be cancelled');
        }
        order.status = 'cancelled';
        order.cancelledAt = new Date();
        order.cancelReason = dto.reason;
        const timelineEntry = {
            status: 'cancelled',
            message: `Order cancelled: ${dto.reason}`,
            timestamp: new Date(),
            updatedBy: cancelledBy,
        };
        order.timeline.push(timelineEntry);
        const savedOrder = await order.save();
        try {
            await this.storeSalesService.voidByLinkedOrder(id, 'order_cancelled');
        }
        catch (voidErr) {
            this.logger.warn(`Failed to void store sale for cancelled order: ${voidErr.message}`);
        }
        try {
            const user = await this.usersService.findById(order.user.toString());
            if (user?.email) {
                this.emailService.sendOrderCancelled(savedOrder.toObject(), user.email);
            }
        }
        catch (emailError) {
            this.logger.warn(`Failed to send cancellation email: ${emailError.message}`);
        }
        return savedOrder;
    }
    async addNote(id, dto) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        const existingNotes = order.adminNotes || '';
        order.adminNotes = existingNotes
            ? `${existingNotes}\n[${new Date().toISOString()}] ${dto.note}`
            : `[${new Date().toISOString()}] ${dto.note}`;
        return order.save();
    }
    async updateShipping(id, dto) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (dto.awbNumber)
            order.awbNumber = dto.awbNumber;
        if (dto.courierName)
            order.courierName = dto.courierName;
        if (dto.trackingUrl)
            order.trackingUrl = dto.trackingUrl;
        if (dto.expectedDeliveryDate) {
            order.expectedDeliveryDate = new Date(dto.expectedDeliveryDate);
        }
        return order.save();
    }
    async setPriorityTags(id, tags) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findByIdAndUpdate(idObj, {
            $set: { priorityTags: tags },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async requestReturn(userId, id, reason) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (order.user.toString() !== userId) {
            throw new common_1.BadRequestException('You do not have access to this order');
        }
        if (order.status !== 'delivered' || order.paymentStatus !== 'paid') {
            throw new common_1.BadRequestException('Return can only be requested for delivered and paid orders');
        }
        if (order.returnRequestStatus && order.returnRequestStatus !== 'rejected') {
            throw new common_1.BadRequestException('Return request already submitted for this order');
        }
        if (order.deliveredAt) {
            const deliveredAt = order.deliveredAt.getTime();
            const now = Date.now();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            if (now - deliveredAt > sevenDaysMs) {
                throw new common_1.BadRequestException('Return window has expired for this order');
            }
        }
        order.returnRequestedAt = new Date();
        order.returnRequestReason = reason;
        order.returnRequestStatus = 'requested';
        const timelineEntry = {
            status: order.status,
            message: `Customer requested return: ${reason}`,
            timestamp: new Date(),
        };
        order.timeline.push(timelineEntry);
        const savedOrder = await order.save();
        try {
            const user = await this.usersService.findById(order.user.toString());
            if (user?.email) {
                this.emailService.sendOrderCancelled?.(savedOrder.toObject(), user.email);
            }
        }
        catch (emailError) {
            this.logger.warn(`Failed to send return request email: ${emailError.message}`);
        }
        return savedOrder;
    }
    async approveReturn(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        if (order.returnRequestStatus !== 'requested') {
            throw new common_1.BadRequestException('Return request must be in requested state to approve');
        }
        order.returnRequestStatus = 'approved';
        order.timeline.push({
            status: order.status,
            message: 'Return approved by admin',
            timestamp: new Date(),
        });
        return order.save();
    }
    async rejectReturn(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        if (order.returnRequestStatus !== 'requested') {
            throw new common_1.BadRequestException('Return request must be in requested state to reject');
        }
        order.returnRequestStatus = 'rejected';
        order.timeline.push({
            status: order.status,
            message: 'Return request rejected by admin',
            timestamp: new Date(),
        });
        return order.save();
    }
    async completeReturn(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const order = await this.orderRepository.findById(idObj);
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        if (order.returnRequestStatus !== 'approved') {
            throw new common_1.BadRequestException('Return must be approved before marking complete');
        }
        order.returnRequestStatus = 'completed';
        order.status = 'returned';
        order.timeline.push({
            status: 'returned',
            message: 'Return completed',
            timestamp: new Date(),
        });
        return order.save();
    }
    async reorder(userId, dto) {
        (0, objectid_util_1.parseObjectId)(userId, 'userId');
        const orderIdObj = (0, objectid_util_1.parseObjectId)(dto.orderId, 'orderId');
        const originalOrder = await this.orderRepository.findById(orderIdObj);
        if (!originalOrder) {
            throw new common_1.NotFoundException('Original order not found');
        }
        const mainStore = await this.storesService.findMainStore();
        const mainStoreId = mainStore._id.toString();
        for (const item of originalOrder.items) {
            const storeStock = await this.storeStockService.getStockForStoreProduct(mainStoreId, item.product.toString());
            const available = item.variantSku
                ? (storeStock?.variantStocks?.find((v) => v.variantSku === item.variantSku)?.stock ?? 0)
                : (storeStock?.stock ?? 0);
            if (item.quantity > available) {
                throw new common_1.BadRequestException(`Insufficient stock for "${item.name}"${item.variantSku ? ` (${item.variantSku})` : ''}. Available: ${available}. Reduce quantity or remove from reorder.`);
            }
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
    async getOrderStats(startDate, endDate) {
        return this.orderRepository.getOrderStats(startDate, endDate);
    }
    async getOrdersByStatus() {
        return this.orderRepository.getOrdersByStatus();
    }
    async generateOrderNumber() {
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
};
exports.OrdersService = OrdersService;
OrdersService.VALID_TRANSITIONS = {
    pending: ['confirmed', 'cancelled', 'shipped'],
    confirmed: ['processing', 'cancelled', 'shipped'],
    processing: ['shipped', 'cancelled'],
    shipped: ['out_for_delivery', 'delivered', 'returned'],
    out_for_delivery: ['delivered', 'returned'],
    delivered: ['returned', 'refunded'],
    cancelled: [],
    returned: ['refunded'],
    refunded: [],
};
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, mongoose_1.InjectConnection)()),
    __metadata("design:paramtypes", [order_repository_1.OrderRepository,
        mongoose_2.Connection,
        cart_service_1.CartService,
        products_service_1.ProductsService,
        users_service_1.UsersService,
        coupons_service_1.CouponsService,
        email_service_1.EmailService,
        settings_service_1.SettingsService,
        stores_service_1.StoresService,
        store_stock_service_1.StoreStockService,
        store_sales_service_1.StoreSalesService,
        wallet_service_1.WalletService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map