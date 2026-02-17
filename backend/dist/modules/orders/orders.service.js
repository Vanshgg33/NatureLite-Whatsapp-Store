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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const order_schema_1 = require("./schemas/order.schema");
const cart_service_1 = require("../cart/cart.service");
const products_service_1 = require("../products/products.service");
const users_service_1 = require("../users/users.service");
const coupons_service_1 = require("../coupons/coupons.service");
const pagination_types_1 = require("../../common/types/pagination.types");
let OrdersService = class OrdersService {
    constructor(orderModel, cartService, productsService, usersService, couponsService) {
        this.orderModel = orderModel;
        this.cartService = cartService;
        this.productsService = productsService;
        this.usersService = usersService;
        this.couponsService = couponsService;
    }
    async create(userId, dto) {
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
                const product = await this.productsService.findById(item.productId);
                let price = product.price;
                if (item.variantSku) {
                    const variant = product.variants.find((v) => v.sku === item.variantSku);
                    if (variant) {
                        price = variant.price;
                    }
                }
                const orderItem = {
                    product: new mongoose_2.Types.ObjectId(item.productId),
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
            user: new mongoose_2.Types.ObjectId(userId),
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
            await this.productsService.decrementStock(item.product.toString(), item.quantity, item.variantSku);
        }
        if (dto.cartId) {
            await this.cartService.clearCart(userId);
        }
        await this.usersService.updateOrderStats(userId, total);
        return savedOrder;
    }
    async findAll(query) {
        const { page = 1, limit = 20, userId, status, paymentStatus, search, startDate, endDate, sortBy = 'createdAt', sortOrder = 'desc', } = query;
        const filter = {};
        if (userId) {
            filter.user = new mongoose_2.Types.ObjectId(userId);
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
                filter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                filter.createdAt.$lte = new Date(endDate);
            }
        }
        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
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
        return (0, pagination_types_1.paginate)(orders, total, { page, limit });
    }
    async findById(id) {
        const order = await this.orderModel
            .findById(id)
            .populate('user', 'phone name email addresses')
            .populate('items.product', 'name slug images');
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async findByOrderNumber(orderNumber) {
        const order = await this.orderModel
            .findOne({ orderNumber })
            .populate('user', 'phone name email');
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async findUserOrders(userId, limit = 10) {
        return this.orderModel
            .find({ user: new mongoose_2.Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }
    async updateStatus(id, dto) {
        const order = await this.orderModel.findById(id);
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        const timelineEntry = {
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
    async updatePaymentStatus(id, dto) {
        const order = await this.orderModel.findById(id);
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
    async cancelOrder(id, dto, cancelledBy) {
        const order = await this.orderModel.findById(id);
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
        return order.save();
    }
    async addNote(id, dto) {
        const order = await this.orderModel.findById(id);
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
        const order = await this.orderModel.findById(id);
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
        const order = await this.orderModel.findByIdAndUpdate(id, { $set: { priorityTags: tags } }, { new: true });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async reorder(userId, dto) {
        const originalOrder = await this.orderModel.findById(dto.orderId);
        if (!originalOrder) {
            throw new common_1.NotFoundException('Original order not found');
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
        const matchStage = {};
        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) {
                matchStage.createdAt.$gte = startDate;
            }
            if (endDate) {
                matchStage.createdAt.$lte = endDate;
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
    async getOrdersByStatus() {
        const result = await this.orderModel.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);
        const statusCounts = {};
        result.forEach((item) => {
            statusCounts[item._id] = item.count;
        });
        return statusCounts;
    }
    async generateOrderNumber() {
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
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(order_schema_1.Order.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        cart_service_1.CartService,
        products_service_1.ProductsService,
        users_service_1.UsersService,
        coupons_service_1.CouponsService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map