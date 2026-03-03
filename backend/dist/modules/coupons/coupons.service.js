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
exports.CouponsService = void 0;
const common_1 = require("@nestjs/common");
const objectid_util_1 = require("../../common/utils/objectid.util");
const coupon_repository_1 = require("./repositories/coupon.repository");
let CouponsService = class CouponsService {
    constructor(couponRepository) {
        this.couponRepository = couponRepository;
    }
    async create(dto) {
        const existingCoupon = await this.couponRepository.findOneByCode(dto.code.toUpperCase());
        if (existingCoupon) {
            throw new common_1.BadRequestException('Coupon with this code already exists');
        }
        return this.couponRepository.create({
            ...dto,
            code: dto.code.toUpperCase(),
            allowedUsers: (0, objectid_util_1.parseObjectIdArray)(dto.allowedUsers, 'allowedUsers'),
            allowedCategories: (0, objectid_util_1.parseObjectIdArray)(dto.allowedCategories, 'allowedCategories'),
            allowedProducts: (0, objectid_util_1.parseObjectIdArray)(dto.allowedProducts, 'allowedProducts'),
        });
    }
    async findAll(query) {
        return this.couponRepository.findAllPaginated(query);
    }
    async findById(id) {
        const coupon = await this.couponRepository.findByIdString(id);
        if (!coupon) {
            throw new common_1.NotFoundException('Coupon not found');
        }
        return coupon;
    }
    async findByCode(code) {
        const coupon = await this.couponRepository.findOneByCode(code.toUpperCase());
        if (!coupon) {
            throw new common_1.NotFoundException('Coupon not found');
        }
        return coupon;
    }
    async validateCoupon(dto) {
        const coupon = await this.couponRepository.findOneByCode(dto.code.toUpperCase());
        if (!coupon) {
            return { valid: false, message: 'Coupon not found', discountAmount: 0 };
        }
        if (!coupon.isActive) {
            return { valid: false, message: 'Coupon is not active', discountAmount: 0 };
        }
        const now = new Date();
        if (now < coupon.validFrom) {
            return { valid: false, message: 'Coupon is not yet valid', discountAmount: 0 };
        }
        if (now > coupon.validUntil) {
            return { valid: false, message: 'Coupon has expired', discountAmount: 0 };
        }
        if (coupon.maxUsageCount && coupon.usedCount >= coupon.maxUsageCount) {
            return { valid: false, message: 'Coupon usage limit reached', discountAmount: 0 };
        }
        if (coupon.minOrderAmount && dto.orderAmount < coupon.minOrderAmount) {
            return {
                valid: false,
                message: `Minimum order amount is ₹${coupon.minOrderAmount}`,
                discountAmount: 0,
                minOrderAmount: coupon.minOrderAmount,
            };
        }
        if (coupon.allowedUsers && coupon.allowedUsers.length > 0) {
            const isAllowed = coupon.allowedUsers.some((id) => id.toString() === dto.userId);
            if (!isAllowed) {
                return { valid: false, message: 'Coupon is not valid for your account', discountAmount: 0 };
            }
        }
        let discountAmount;
        if (coupon.discountType === 'percentage') {
            discountAmount = (dto.orderAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
                discountAmount = coupon.maxDiscount;
            }
        }
        else {
            discountAmount = coupon.discountValue;
        }
        discountAmount = Math.min(discountAmount, dto.orderAmount);
        return {
            valid: true,
            message: 'Coupon applied successfully',
            discountAmount,
            coupon,
        };
    }
    async incrementUsageCount(couponCode) {
        const result = await this.couponRepository.incrementUsageCount(couponCode);
        if (result.modifiedCount === 0) {
            throw new common_1.BadRequestException('Coupon usage limit reached');
        }
    }
    async update(id, dto) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const updateData = { ...dto };
        if (dto.allowedUsers) {
            updateData.allowedUsers = (0, objectid_util_1.parseObjectIdArray)(dto.allowedUsers, 'allowedUsers');
        }
        if (dto.allowedCategories) {
            updateData.allowedCategories = (0, objectid_util_1.parseObjectIdArray)(dto.allowedCategories, 'allowedCategories');
        }
        if (dto.allowedProducts) {
            updateData.allowedProducts = (0, objectid_util_1.parseObjectIdArray)(dto.allowedProducts, 'allowedProducts');
        }
        const coupon = await this.couponRepository.findByIdAndUpdate(idObj, { $set: updateData });
        if (!coupon) {
            throw new common_1.NotFoundException('Coupon not found');
        }
        return coupon;
    }
    async delete(id) {
        const result = await this.couponRepository.deleteOne({
            _id: (0, objectid_util_1.parseObjectId)(id, 'id'),
        });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('Coupon not found');
        }
    }
    async getActiveCoupons() {
        return this.couponRepository.findActiveCoupons();
    }
};
exports.CouponsService = CouponsService;
exports.CouponsService = CouponsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [coupon_repository_1.CouponRepository])
], CouponsService);
//# sourceMappingURL=coupons.service.js.map