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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("./schemas/user.schema");
const pagination_types_1 = require("../../common/types/pagination.types");
let UsersService = class UsersService {
    constructor(userModel) {
        this.userModel = userModel;
    }
    async create(dto) {
        const existingUser = await this.userModel.findOne({ phone: dto.phone });
        if (existingUser) {
            throw new common_1.BadRequestException('User with this phone already exists');
        }
        const user = new this.userModel(dto);
        return user.save();
    }
    async findAll(query) {
        const { page = 1, limit = 20, search, isActive, isBlocked, sortBy = 'createdAt', sortOrder = 'desc' } = query;
        const filter = {};
        if (search) {
            filter.$or = [
                { phone: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ];
        }
        if (isActive !== undefined) {
            filter.isActive = isActive;
        }
        if (isBlocked !== undefined) {
            filter.isBlocked = isBlocked;
        }
        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
        const [users, total] = await Promise.all([
            this.userModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
            this.userModel.countDocuments(filter),
        ]);
        return (0, pagination_types_1.paginate)(users, total, { page, limit });
    }
    async findById(id) {
        const user = await this.userModel.findById(id);
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async findByPhone(phone) {
        return this.userModel.findOne({ phone });
    }
    async findOrCreateByPhone(phone) {
        let user = await this.userModel.findOne({ phone });
        if (!user) {
            user = new this.userModel({ phone });
            await user.save();
        }
        return user;
    }
    async update(id, dto) {
        const user = await this.userModel.findByIdAndUpdate(id, { $set: dto }, { new: true });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async addAddress(userId, dto) {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (dto.isDefault) {
            user.addresses.forEach((addr) => {
                addr.isDefault = false;
            });
        }
        user.addresses.push({
            ...dto,
            isDefault: dto.isDefault ?? false,
        });
        return user.save();
    }
    async updateAddress(userId, addressIndex, dto) {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (addressIndex < 0 || addressIndex >= user.addresses.length) {
            throw new common_1.BadRequestException('Invalid address index');
        }
        if (dto.isDefault) {
            user.addresses.forEach((addr) => {
                addr.isDefault = false;
            });
        }
        Object.assign(user.addresses[addressIndex], dto);
        return user.save();
    }
    async removeAddress(userId, addressIndex) {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (addressIndex < 0 || addressIndex >= user.addresses.length) {
            throw new common_1.BadRequestException('Invalid address index');
        }
        user.addresses.splice(addressIndex, 1);
        return user.save();
    }
    async blockUser(userId, reason) {
        const user = await this.userModel.findByIdAndUpdate(userId, { isBlocked: true, blockedReason: reason }, { new: true });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async unblockUser(userId) {
        const user = await this.userModel.findByIdAndUpdate(userId, { isBlocked: false, $unset: { blockedReason: 1 } }, { new: true });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async updateOrderStats(userId, orderTotal) {
        await this.userModel.updateOne({ _id: new mongoose_2.Types.ObjectId(userId) }, {
            $inc: { totalOrders: 1, totalSpent: orderTotal },
            $set: { lastOrderAt: new Date() },
        });
    }
    async updateLastInteraction(userId) {
        await this.userModel.updateOne({ _id: new mongoose_2.Types.ObjectId(userId) }, { $set: { lastInteractionAt: new Date() } });
    }
    async delete(id) {
        const result = await this.userModel.deleteOne({ _id: new mongoose_2.Types.ObjectId(id) });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('User not found');
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], UsersService);
//# sourceMappingURL=users.service.js.map