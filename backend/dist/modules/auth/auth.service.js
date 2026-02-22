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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const bcrypt = require("bcrypt");
const admin_user_schema_1 = require("../admin/schemas/admin-user.schema");
const user_schema_1 = require("../users/schemas/user.schema");
let AuthService = AuthService_1 = class AuthService {
    constructor(adminUserModel, userModel, jwtService) {
        this.adminUserModel = adminUserModel;
        this.userModel = userModel;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async adminLogin(dto) {
        const admin = await this.adminUserModel.findOne({ email: dto.email.toLowerCase() });
        if (!admin) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!admin.isActive) {
            throw new common_1.UnauthorizedException('Account is deactivated');
        }
        const isPasswordValid = await bcrypt.compare(dto.password, admin.password);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.adminUserModel.updateOne({ _id: admin._id }, { lastLoginAt: new Date() });
        const payload = {
            sub: admin._id.toString(),
            phone: admin.phone || '',
            role: admin.role,
        };
        const accessToken = this.jwtService.sign(payload);
        return {
            accessToken,
            user: {
                id: admin._id.toString(),
                email: admin.email,
                name: admin.name,
                role: admin.role,
            },
        };
    }
    async adminRegister(dto) {
        const existingAdmin = await this.adminUserModel.findOne({
            email: dto.email.toLowerCase(),
        });
        if (existingAdmin) {
            throw new common_1.ConflictException('Email already registered');
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const admin = new this.adminUserModel({
            name: dto.name,
            email: dto.email.toLowerCase(),
            password: hashedPassword,
            phone: dto.phone,
            role: dto.role || 'admin',
        });
        await admin.save();
        const payload = {
            sub: admin._id.toString(),
            phone: admin.phone || '',
            role: admin.role,
        };
        const accessToken = this.jwtService.sign(payload);
        return {
            accessToken,
            user: {
                id: admin._id.toString(),
                email: admin.email,
                name: admin.name,
                role: admin.role,
            },
        };
    }
    async customerLogin(dto) {
        if (dto.otp !== '123456' && process.env.NODE_ENV === 'production') {
            throw new common_1.UnauthorizedException('Invalid OTP');
        }
        let user = await this.userModel.findOne({ phone: dto.phone });
        if (!user) {
            user = new this.userModel({ phone: dto.phone });
            await user.save();
        }
        if (user.isBlocked) {
            throw new common_1.UnauthorizedException('Account is blocked');
        }
        const payload = {
            sub: user._id.toString(),
            phone: user.phone || '',
            role: 'customer',
        };
        const accessToken = this.jwtService.sign(payload);
        return {
            accessToken,
            user: {
                id: user._id.toString(),
                phone: user.phone,
                name: user.name,
                role: 'customer',
            },
        };
    }
    async customerRegister(dto) {
        const existingUser = await this.userModel.findOne({
            email: dto.email.toLowerCase(),
        });
        if (existingUser) {
            throw new common_1.ConflictException('Email already registered');
        }
        if (dto.phone) {
            const phoneExists = await this.userModel.findOne({ phone: dto.phone });
            if (phoneExists) {
                throw new common_1.ConflictException('Phone number already registered');
            }
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = new this.userModel({
            name: dto.name,
            email: dto.email.toLowerCase(),
            password: hashedPassword,
            phone: dto.phone,
        });
        await user.save();
        const payload = {
            sub: user._id.toString(),
            phone: user.phone || '',
            role: 'customer',
        };
        const accessToken = this.jwtService.sign(payload);
        return {
            accessToken,
            user: {
                id: user._id.toString(),
                email: user.email,
                phone: user.phone,
                name: user.name,
                role: 'customer',
            },
        };
    }
    async customerEmailLogin(dto) {
        const user = await this.userModel.findOne({
            email: dto.email.toLowerCase(),
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.password) {
            throw new common_1.UnauthorizedException('Please login with phone/OTP or reset your password');
        }
        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.isBlocked) {
            throw new common_1.UnauthorizedException('Account is blocked');
        }
        const payload = {
            sub: user._id.toString(),
            phone: user.phone || '',
            role: 'customer',
        };
        const accessToken = this.jwtService.sign(payload);
        return {
            accessToken,
            user: {
                id: user._id.toString(),
                email: user.email,
                phone: user.phone,
                name: user.name,
                role: 'customer',
            },
        };
    }
    async sendOtp(phone) {
        this.logger.log(`Sending OTP to ${phone}`);
        return {
            success: true,
            message: 'OTP sent successfully',
        };
    }
    async changePassword(adminId, dto) {
        const admin = await this.adminUserModel.findById(adminId);
        if (!admin) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, admin.password);
        if (!isCurrentPasswordValid) {
            throw new common_1.UnauthorizedException('Current password is incorrect');
        }
        const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
        await this.adminUserModel.updateOne({ _id: adminId }, { password: hashedPassword });
    }
    async validateUser(payload) {
        if (payload.role === 'customer') {
            const user = await this.userModel.findById(payload.sub);
            if (!user || user.isBlocked) {
                return null;
            }
        }
        else {
            const admin = await this.adminUserModel.findById(payload.sub);
            if (!admin || !admin.isActive) {
                return null;
            }
        }
        return payload;
    }
    async getProfile(userId, role) {
        if (role === 'customer') {
            const user = await this.userModel.findById(userId).select('-__v');
            if (!user) {
                throw new common_1.UnauthorizedException('User not found');
            }
            return user.toObject();
        }
        const admin = await this.adminUserModel.findById(userId).select('-password -__v');
        if (!admin) {
            throw new common_1.UnauthorizedException('User not found');
        }
        return admin.toObject();
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(admin_user_schema_1.AdminUser.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map