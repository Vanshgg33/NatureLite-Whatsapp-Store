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
exports.CouponsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const coupon_schema_1 = require("./schemas/coupon.schema");
const pagination_types_1 = require("../../common/types/pagination.types");
let CouponsService = class CouponsService {
    constructor(couponModel) {
        this.couponModel = couponModel;
    }
    async create(dto) {
        const existingCoupon = await this.couponModel.findOne({
            code: dto.code.toUpperCase(),
        });
        if (existingCoupon) {
            throw new common_1.BadRequestException('Coupon with this code already exists');
        }
        const coupon = new this.couponModel({
            ...dto,
            code: dto.code.toUpperCase(),
            allowedUsers: dto.allowedUsers?.map((id) => new mongoose_2.Types.ObjectId(id)),
            allowedCategories: dto.allowedCategories?.map((id) => new mongoose_2.Types.ObjectId(id)),
            allowedProducts: dto.allowedProducts?.map((id) => new mongoose_2.Types.ObjectId(id)),
        });
        return coupon.save();
    }
    async findAll(query) {
        const { page = 1, limit = 20, isActive, search } = query;
        const filter = {};
        if (isActive !== undefined) {
            filter.isActive = isActive;
        }
        if (search) {
            filter.$or = [
                { code: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }
        const skip = (page - 1) * limit;
        const [coupons, total] = await Promise.all([
            this.couponModel
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.couponModel.countDocuments(filter),
        ]);
        return (0, pagination_types_1.paginate)(coupons, total, { page, limit });
    }
    async findById(id) {
        const coupon = await this.couponModel.findById(id);
        if (!coupon) {
            throw new common_1.NotFoundException('Coupon not found');
        }
        return coupon;
    }
    async findByCode(code) {
        const coupon = await this.couponModel.findOne({ code: code.toUpperCase() });
        if (!coupon) {
            throw new common_1.NotFoundException('Coupon not found');
        }
        return coupon;
    }
    async validateCoupon(dto) {
        const coupon = await this.couponModel.findOne({
            code: dto.code.toUpperCase(),
        });
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
        const result = await this.couponModel.updateOne({
            code: couponCode.toUpperCase(),
            $or: [
                { maxUsageCount: { $exists: false } },
                { maxUsageCount: null },
                { $expr: { $lt: ['$usedCount', '$maxUsageCount'] } },
            ],
        }, { $inc: { usedCount: 1 } });
        if (result.modifiedCount === 0) {
            throw new common_1.BadRequestException('Coupon usage limit reached');
        }
    }
    async update(id, dto) {
        const updateData = { ...dto };
        if (dto.allowedUsers) {
            updateData.allowedUsers = dto.allowedUsers.map((id) => new mongoose_2.Types.ObjectId(id));
        }
        if (dto.allowedCategories) {
            updateData.allowedCategories = dto.allowedCategories.map((id) => new mongoose_2.Types.ObjectId(id));
        }
        if (dto.allowedProducts) {
            updateData.allowedProducts = dto.allowedProducts.map((id) => new mongoose_2.Types.ObjectId(id));
        }
        const coupon = await this.couponModel.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        if (!coupon) {
            throw new common_1.NotFoundException('Coupon not found');
        }
        return coupon;
    }
    async delete(id) {
        const result = await this.couponModel.deleteOne({
            _id: new mongoose_2.Types.ObjectId(id),
        });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('Coupon not found');
        }
    }
    async getActiveCoupons() {
        const now = new Date();
        return this.couponModel
            .find({
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gte: now },
            $or: [
                { maxUsageCount: { $exists: false } },
                { $expr: { $lt: ['$usedCount', '$maxUsageCount'] } },
            ],
        })
            .exec();
    }
};
exports.CouponsService = CouponsService;
exports.CouponsService = CouponsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(coupon_schema_1.Coupon.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], CouponsService);
//# sourceMappingURL=coupons.service.js.map