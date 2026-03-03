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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const user_repository_1 = require("./repositories/user.repository");
const objectid_util_1 = require("../../common/utils/objectid.util");
let UsersService = class UsersService {
    constructor(userRepository) {
        this.userRepository = userRepository;
    }
    async create(dto) {
        const existingUser = await this.userRepository.findOneByPhone(dto.phone);
        if (existingUser) {
            throw new common_1.BadRequestException('User with this phone already exists');
        }
        return this.userRepository.create(dto);
    }
    async findAll(query) {
        return this.userRepository.findAllPaginated(query);
    }
    async findById(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const user = await this.userRepository.findById(idObj);
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async findByPhone(phone) {
        return this.userRepository.findOneByPhone(phone);
    }
    async findOrCreateByPhone(phone) {
        let user = await this.userRepository.findOneByPhone(phone);
        if (!user) {
            user = await this.userRepository.create({ phone });
        }
        return user;
    }
    async update(id, dto) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const user = await this.userRepository.findByIdAndUpdate(idObj, { $set: dto });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async addAddress(userId, dto) {
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        const user = await this.userRepository.findById(userObjId);
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
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        const user = await this.userRepository.findById(userObjId);
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
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        const user = await this.userRepository.findById(userObjId);
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
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        const user = await this.userRepository.findByIdAndUpdate(userObjId, {
            isBlocked: true,
            blockedReason: reason,
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async unblockUser(userId) {
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        const user = await this.userRepository.findByIdAndUpdate(userObjId, {
            isBlocked: false,
            $unset: { blockedReason: 1 },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async updateOrderStats(userId, orderTotal) {
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        await this.userRepository.updateOne({ _id: userObjId }, {
            $inc: { totalOrders: 1, totalSpent: orderTotal },
            $set: { lastOrderAt: new Date() },
        });
    }
    async updateLastInteraction(userId) {
        const userObjId = (0, objectid_util_1.parseObjectId)(userId, 'userId');
        await this.userRepository.updateOne({ _id: userObjId }, { $set: { lastInteractionAt: new Date() } });
    }
    async delete(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const result = await this.userRepository.deleteOne({ _id: idObj });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('User not found');
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_repository_1.UserRepository])
], UsersService);
//# sourceMappingURL=users.service.js.map