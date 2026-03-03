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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartService = void 0;
const common_1 = require("@nestjs/common");
const cart_repository_1 = require("./repositories/cart.repository");
const products_service_1 = require("../products/products.service");
const coupons_service_1 = require("../coupons/coupons.service");
const objectid_util_1 = require("../../common/utils/objectid.util");
let CartService = class CartService {
    constructor(cartRepository, productsService, couponsService) {
        this.cartRepository = cartRepository;
        this.productsService = productsService;
        this.couponsService = couponsService;
    }
    async getCart(userId) {
        const cart = await this.findOrCreateCart(userId);
        return this.formatCartResponse(cart);
    }
    async addItem(userId, dto) {
        const productIdObj = (0, objectid_util_1.parseObjectId)(dto.productId, 'productId');
        const cart = await this.findOrCreateCart(userId);
        const product = await this.productsService.findById(dto.productId);
        if (!product.isActive) {
            throw new common_1.BadRequestException('Product is not available');
        }
        let price = product.price;
        let stock = product.stock;
        if (dto.variantSku) {
            const variant = product.variants.find((v) => v.sku === dto.variantSku);
            if (!variant) {
                throw new common_1.BadRequestException('Variant not found');
            }
            if (!variant.isActive) {
                throw new common_1.BadRequestException('Variant is not available');
            }
            price = variant.price;
            stock = variant.stock;
        }
        if (product.trackStock && stock < dto.quantity) {
            throw new common_1.BadRequestException('Not enough stock available');
        }
        const existingItemIndex = cart.items.findIndex((item) => item.product.toString() === productIdObj.toString() &&
            item.variantSku === dto.variantSku);
        if (existingItemIndex >= 0) {
            const newQuantity = cart.items[existingItemIndex].quantity + dto.quantity;
            if (product.trackStock && stock < newQuantity) {
                throw new common_1.BadRequestException('Not enough stock available');
            }
            cart.items[existingItemIndex].quantity = newQuantity;
        }
        else {
            const cartItem = {
                product: productIdObj,
                variantSku: dto.variantSku,
                quantity: dto.quantity,
                price,
                name: product.name,
                image: product.images[0],
                addedAt: new Date(),
            };
            cart.items.push(cartItem);
        }
        this.recalculateCart(cart);
        await cart.save();
        return this.formatCartResponse(cart);
    }
    async updateItemQuantity(userId, productId, dto, variantSku) {
        (0, objectid_util_1.parseObjectId)(productId, 'productId');
        const cart = await this.findOrCreateCart(userId);
        const itemIndex = cart.items.findIndex((item) => item.product.toString() === productId &&
            item.variantSku === variantSku);
        if (itemIndex < 0) {
            throw new common_1.NotFoundException('Item not found in cart');
        }
        const product = await this.productsService.findById(productId);
        let stock = product.stock;
        if (variantSku) {
            const variant = product.variants.find((v) => v.sku === variantSku);
            if (variant) {
                stock = variant.stock;
            }
        }
        if (product.trackStock && stock < dto.quantity) {
            throw new common_1.BadRequestException('Not enough stock available');
        }
        cart.items[itemIndex].quantity = dto.quantity;
        this.recalculateCart(cart);
        await cart.save();
        return this.formatCartResponse(cart);
    }
    async removeItem(userId, productId, variantSku) {
        (0, objectid_util_1.parseObjectId)(productId, 'productId');
        const cart = await this.findOrCreateCart(userId);
        const itemIndex = cart.items.findIndex((item) => item.product.toString() === productId &&
            item.variantSku === variantSku);
        if (itemIndex < 0) {
            throw new common_1.NotFoundException('Item not found in cart');
        }
        cart.items.splice(itemIndex, 1);
        this.recalculateCart(cart);
        await cart.save();
        return this.formatCartResponse(cart);
    }
    async clearCart(userId) {
        const cart = await this.findOrCreateCart(userId);
        cart.items = [];
        cart.couponCode = undefined;
        cart.discount = 0;
        this.recalculateCart(cart);
        await cart.save();
        return this.formatCartResponse(cart);
    }
    async applyCoupon(userId, couponCode) {
        const cart = await this.findOrCreateCart(userId);
        if (cart.items.length === 0) {
            throw new common_1.BadRequestException('Cart is empty');
        }
        const validation = await this.couponsService.validateCoupon({
            code: couponCode,
            orderAmount: cart.subtotal,
            userId,
        });
        if (!validation.valid) {
            throw new common_1.BadRequestException(validation.message);
        }
        cart.couponCode = couponCode;
        cart.discount = validation.discountAmount;
        this.recalculateCart(cart);
        await cart.save();
        return this.formatCartResponse(cart);
    }
    async removeCoupon(userId) {
        const cart = await this.findOrCreateCart(userId);
        cart.couponCode = undefined;
        cart.discount = 0;
        this.recalculateCart(cart);
        await cart.save();
        return this.formatCartResponse(cart);
    }
    async markAsAbandoned(cartId) {
        const cartObjId = (0, objectid_util_1.parseObjectId)(cartId, 'cartId');
        await this.cartRepository.updateOne({ _id: cartObjId }, { abandonedAt: new Date() });
    }
    async getAbandonedCarts(minutesOld, limit = 100) {
        const cutoffTime = new Date(Date.now() - minutesOld * 60 * 1000);
        return this.cartRepository.findAbandonedCarts(cutoffTime, limit);
    }
    async markAbandonedReminderSent(cartId) {
        const cartObjId = (0, objectid_util_1.parseObjectId)(cartId, 'cartId');
        await this.cartRepository.updateOne({ _id: cartObjId }, { abandonedReminderSent: true });
    }
    async findOrCreateCart(userId) {
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        let cart = await this.cartRepository.findOneByUser(userObjId);
        if (!cart) {
            cart = await this.cartRepository.create({
                user: userObjId,
                items: [],
                subtotal: 0,
                discount: 0,
                total: 0,
            });
        }
        return cart;
    }
    recalculateCart(cart) {
        cart.subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        cart.total = Math.max(0, cart.subtotal - cart.discount);
    }
    formatCartResponse(cart) {
        return {
            id: cart._id.toString(),
            items: cart.items.map((item) => ({
                product: {
                    id: item.product.toString(),
                    name: item.name,
                    slug: '',
                    image: item.image,
                },
                variantSku: item.variantSku,
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity,
            })),
            couponCode: cart.couponCode,
            subtotal: cart.subtotal,
            discount: cart.discount,
            total: cart.total,
            itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        };
    }
};
exports.CartService = CartService;
exports.CartService = CartService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cart_repository_1.CartRepository,
        products_service_1.ProductsService,
        coupons_service_1.CouponsService])
], CartService);
//# sourceMappingURL=cart.service.js.map