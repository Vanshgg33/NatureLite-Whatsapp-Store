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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = require("bcrypt");
const admin_user_repository_1 = require("./repositories/admin-user.repository");
const objectid_util_1 = require("../../common/utils/objectid.util");
let AdminService = class AdminService {
    constructor(adminUserRepository) {
        this.adminUserRepository = adminUserRepository;
    }
    async findAll() {
        return this.adminUserRepository.findAllExcludePassword();
    }
    async findById(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const admin = await this.adminUserRepository.findByIdExcludePassword(idObj);
        if (!admin) {
            throw new common_1.NotFoundException('Admin not found');
        }
        return admin;
    }
    async create(data) {
        const existing = await this.adminUserRepository.findOneByEmail(data.email.toLowerCase());
        if (existing) {
            throw new common_1.BadRequestException('Email already exists');
        }
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const admin = await this.adminUserRepository.create({
            ...data,
            email: data.email.toLowerCase(),
            password: hashedPassword,
        });
        const result = admin.toObject();
        delete result.password;
        return result;
    }
    async update(id, data) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const admin = await this.adminUserRepository.findByIdAndUpdateExcludePassword(idObj, data);
        if (!admin) {
            throw new common_1.NotFoundException('Admin not found');
        }
        return admin;
    }
    async resetPassword(id, newPassword) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const result = await this.adminUserRepository.updateOne({ _id: idObj }, { $set: { password: hashedPassword } });
        if (result.modifiedCount === 0) {
            throw new common_1.NotFoundException('Admin not found');
        }
    }
    async deactivate(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const admin = await this.adminUserRepository.findByIdAndUpdateExcludePassword(idObj, {
            isActive: false,
        });
        if (!admin) {
            throw new common_1.NotFoundException('Admin not found');
        }
        return admin;
    }
    async delete(id) {
        const idObj = (0, objectid_util_1.parseObjectId)(id, 'id');
        const result = await this.adminUserRepository.deleteOne({ _id: idObj });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('Admin not found');
        }
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [admin_user_repository_1.AdminUserRepository])
], AdminService);
//# sourceMappingURL=admin.service.js.map