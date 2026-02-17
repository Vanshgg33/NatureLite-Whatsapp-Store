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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const bcrypt = require("bcrypt");
const admin_user_schema_1 = require("./schemas/admin-user.schema");
let AdminService = class AdminService {
    constructor(adminUserModel) {
        this.adminUserModel = adminUserModel;
    }
    async findAll() {
        return this.adminUserModel.find().select('-password').exec();
    }
    async findById(id) {
        const admin = await this.adminUserModel.findById(id).select('-password');
        if (!admin) {
            throw new common_1.NotFoundException('Admin not found');
        }
        return admin;
    }
    async create(data) {
        const existing = await this.adminUserModel.findOne({
            email: data.email.toLowerCase(),
        });
        if (existing) {
            throw new common_1.BadRequestException('Email already exists');
        }
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const admin = new this.adminUserModel({
            ...data,
            email: data.email.toLowerCase(),
            password: hashedPassword,
        });
        await admin.save();
        const result = admin.toObject();
        delete result.password;
        return result;
    }
    async update(id, data) {
        const admin = await this.adminUserModel.findByIdAndUpdate(id, { $set: data }, { new: true }).select('-password');
        if (!admin) {
            throw new common_1.NotFoundException('Admin not found');
        }
        return admin;
    }
    async resetPassword(id, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const result = await this.adminUserModel.updateOne({ _id: new mongoose_2.Types.ObjectId(id) }, { $set: { password: hashedPassword } });
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException('Admin not found');
        }
    }
    async deactivate(id) {
        const admin = await this.adminUserModel.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).select('-password');
        if (!admin) {
            throw new common_1.NotFoundException('Admin not found');
        }
        return admin;
    }
    async delete(id) {
        const result = await this.adminUserModel.deleteOne({
            _id: new mongoose_2.Types.ObjectId(id),
        });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException('Admin not found');
        }
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(admin_user_schema_1.AdminUser.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AdminService);
//# sourceMappingURL=admin.service.js.map