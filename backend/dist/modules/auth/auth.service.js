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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = require("bcrypt");
const uuid_1 = require("uuid");
const admin_user_repository_1 = require("../admin/repositories/admin-user.repository");
const user_repository_1 = require("../users/repositories/user.repository");
const store_repository_1 = require("../stores/repositories/store.repository");
const refresh_token_repository_1 = require("./repositories/refresh-token.repository");
const objectid_util_1 = require("../../common/utils/objectid.util");
let AuthService = AuthService_1 = class AuthService {
    constructor(adminUserRepository, userRepository, storeRepository, refreshTokenRepository, jwtService, configService) {
        this.adminUserRepository = adminUserRepository;
        this.userRepository = userRepository;
        this.storeRepository = storeRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.jwtService = jwtService;
        this.configService = configService;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.otpStore = new Map();
        this.otpRateLimit = new Map();
    }
    generateTokens(payload) {
        const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
        const refreshToken = (0, uuid_1.v4)();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const data = {
            token: refreshToken,
            userId: (0, objectid_util_1.parseObjectId)(payload.sub, 'userId'),
            role: payload.role,
            expiresAt,
        };
        if (payload.storeId) {
            data.storeId = (0, objectid_util_1.parseObjectId)(payload.storeId, 'storeId');
        }
        this.refreshTokenRepository.create(data).catch((err) => {
            this.logger.warn(`Failed to persist refresh token: ${err.message}`);
        });
        return { accessToken, refreshToken };
    }
    async refreshAccessToken(refreshToken) {
        const tokenDoc = await this.refreshTokenRepository.findOne({ token: refreshToken });
        if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
            if (tokenDoc?._id) {
                await this.refreshTokenRepository.deleteOne({ _id: tokenDoc._id });
            }
            throw new common_1.UnauthorizedException('Invalid or expired refresh token');
        }
        await this.refreshTokenRepository.deleteOne({ _id: tokenDoc._id });
        let user;
        let phone = '';
        if (tokenDoc.role === 'customer') {
            user = await this.userRepository.findByIdString(tokenDoc.userId.toString());
            if (!user || user.isBlocked) {
                throw new common_1.UnauthorizedException('User account is not active');
            }
            phone = user.phone || '';
        }
        else {
            user = await this.adminUserRepository.findByIdString(tokenDoc.userId.toString());
            if (!user || !user.isActive) {
                throw new common_1.UnauthorizedException('Admin account is not active');
            }
            phone = user.phone || '';
        }
        const payload = {
            sub: tokenDoc.userId.toString(),
            phone,
            role: tokenDoc.role,
            storeId: tokenDoc.storeId ? tokenDoc.storeId.toString() : undefined,
            departmentType: tokenDoc.role !== 'customer' ? user.departmentType : undefined,
        };
        const tokens = this.generateTokens(payload);
        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user._id.toString(),
                email: user.email,
                phone: user.phone,
                name: user.name,
                role: tokenDoc.role,
                storeId: tokenDoc.storeId ? tokenDoc.storeId.toString() : undefined,
            },
        };
    }
    async adminLogin(dto) {
        const admin = await this.adminUserRepository.findOneByEmail(dto.email.toLowerCase());
        if (!admin) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!admin.isActive) {
            throw new common_1.UnauthorizedException('Account is deactivated');
        }
        if (admin.lockoutUntil && admin.lockoutUntil > new Date()) {
            const minutesLeft = Math.ceil((admin.lockoutUntil.getTime() - Date.now()) / 60000);
            throw new common_1.UnauthorizedException(`Account locked. Try again in ${minutesLeft} minutes.`);
        }
        const isPasswordValid = await bcrypt.compare(dto.password, admin.password);
        if (!isPasswordValid) {
            const attempts = (admin.failedLoginAttempts || 0) + 1;
            const update = { failedLoginAttempts: attempts };
            if (attempts >= 5) {
                update.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
            await this.adminUserRepository.updateOne({ _id: admin._id }, update);
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.adminUserRepository.updateOne({ _id: admin._id }, { lastLoginAt: new Date(), failedLoginAttempts: 0, lockoutUntil: null });
        let storeId;
        let storeName;
        if (admin.store) {
            storeId = admin.store.toString();
            const store = await this.storeRepository.findById(admin.store);
            if (store)
                storeName = store.name;
        }
        const payload = {
            sub: admin._id.toString(),
            phone: admin.phone || '',
            role: admin.role,
            storeId,
            departmentType: admin.departmentType,
        };
        const tokens = this.generateTokens(payload);
        return {
            ...tokens,
            user: {
                id: admin._id.toString(),
                email: admin.email,
                name: admin.name,
                role: admin.role,
                departmentType: admin.departmentType,
                storeId,
                storeName,
            },
        };
    }
    async adminRegister(dto) {
        const existingAdmin = await this.adminUserRepository.findOneByEmail(dto.email.toLowerCase());
        if (existingAdmin) {
            throw new common_1.ConflictException('Email already registered');
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const adminData = {
            name: dto.name,
            email: dto.email.toLowerCase(),
            password: hashedPassword,
            phone: dto.phone,
            role: 'admin',
        };
        if (dto.storeId) {
            adminData.store = (0, objectid_util_1.parseObjectId)(dto.storeId, 'storeId');
        }
        const admin = await this.adminUserRepository.create(adminData);
        const storeId = admin.store?.toString();
        let storeName;
        if (admin.store) {
            const store = await this.storeRepository.findById(admin.store);
            if (store)
                storeName = store.name;
        }
        const payload = {
            sub: admin._id.toString(),
            phone: admin.phone || '',
            role: admin.role,
            storeId,
            departmentType: admin.departmentType,
        };
        const tokens = this.generateTokens(payload);
        return {
            ...tokens,
            user: {
                id: admin._id.toString(),
                email: admin.email,
                name: admin.name,
                role: admin.role,
                departmentType: admin.departmentType,
                storeId,
                storeName,
            },
        };
    }
    async customerLogin(dto) {
        const stored = this.otpStore.get(dto.phone);
        const devBypass = dto.otp === '123456' && process.env.NODE_ENV !== 'production';
        if (!devBypass) {
            if (!stored) {
                throw new common_1.UnauthorizedException('Invalid or expired OTP. Please request a new one.');
            }
            if (Date.now() > stored.expiresAt) {
                this.otpStore.delete(dto.phone);
                throw new common_1.UnauthorizedException('OTP has expired. Please request a new one.');
            }
            if (stored.otp !== dto.otp) {
                throw new common_1.UnauthorizedException('Invalid OTP');
            }
            this.otpStore.delete(dto.phone);
        }
        let user = await this.userRepository.findOneByPhone(dto.phone);
        if (!user) {
            user = await this.userRepository.create({ phone: dto.phone });
        }
        if (user.isBlocked) {
            throw new common_1.UnauthorizedException('Account is blocked');
        }
        const payload = {
            sub: user._id.toString(),
            phone: user.phone || '',
            role: 'customer',
        };
        const tokens = this.generateTokens(payload);
        return {
            ...tokens,
            user: {
                id: user._id.toString(),
                phone: user.phone,
                name: user.name,
                role: 'customer',
            },
        };
    }
    async customerRegister(dto) {
        const existingUser = await this.userRepository.findOneByEmail(dto.email.toLowerCase());
        if (existingUser) {
            throw new common_1.ConflictException('Email already registered');
        }
        if (dto.phone) {
            const phoneExists = await this.userRepository.findOneByPhone(dto.phone);
            if (phoneExists) {
                throw new common_1.ConflictException('Phone number already registered');
            }
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.userRepository.create({
            name: dto.name,
            email: dto.email.toLowerCase(),
            password: hashedPassword,
            phone: dto.phone,
        });
        const payload = {
            sub: user._id.toString(),
            phone: user.phone || '',
            role: 'customer',
        };
        const tokens = this.generateTokens(payload);
        return {
            ...tokens,
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
        const user = await this.userRepository.findOneByEmail(dto.email.toLowerCase());
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.password) {
            throw new common_1.UnauthorizedException('Please login with phone/OTP or reset your password');
        }
        if (user.isBlocked) {
            throw new common_1.UnauthorizedException('Account is blocked');
        }
        if (user.lockoutUntil && user.lockoutUntil > new Date()) {
            const minutesLeft = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
            throw new common_1.UnauthorizedException(`Account locked. Try again in ${minutesLeft} minutes.`);
        }
        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            const attempts = (user.failedLoginAttempts || 0) + 1;
            const update = { failedLoginAttempts: attempts };
            if (attempts >= 5) {
                update.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
            await this.userRepository.updateOne({ _id: user._id }, update);
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.userRepository.updateOne({ _id: user._id }, { failedLoginAttempts: 0, lockoutUntil: null });
        const payload = {
            sub: user._id.toString(),
            phone: user.phone || '',
            role: 'customer',
        };
        const tokens = this.generateTokens(payload);
        return {
            ...tokens,
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
        const now = Date.now();
        const lastSent = this.otpRateLimit.get(phone);
        if (lastSent != null && now - lastSent < AuthService_1.OTP_RATE_LIMIT_MS) {
            const waitSec = Math.ceil((AuthService_1.OTP_RATE_LIMIT_MS - (now - lastSent)) / 1000);
            throw new common_1.BadRequestException(`Please wait ${waitSec} seconds before requesting another OTP.`);
        }
        const otp = process.env.NODE_ENV === 'production'
            ? String(Math.floor(100000 + Math.random() * 900000))
            : '123456';
        this.otpStore.set(phone, { otp, expiresAt: now + AuthService_1.OTP_TTL_MS });
        this.otpRateLimit.set(phone, now);
        this.logger.log(`Sending OTP to ${phone}`);
        return {
            success: true,
            message: 'OTP sent successfully',
        };
    }
    async changePassword(adminId, dto) {
        const admin = await this.adminUserRepository.findByIdString(adminId);
        if (!admin) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, admin.password);
        if (!isCurrentPasswordValid) {
            throw new common_1.UnauthorizedException('Current password is incorrect');
        }
        const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
        await this.adminUserRepository.updateOne({ _id: (0, objectid_util_1.parseObjectId)(adminId, 'adminId') }, { password: hashedPassword });
    }
    async validateUser(payload) {
        if (payload.role === 'customer') {
            const user = await this.userRepository.findByIdString(payload.sub);
            if (!user || user.isBlocked) {
                return null;
            }
        }
        else {
            const admin = await this.adminUserRepository.findByIdString(payload.sub);
            if (!admin || !admin.isActive) {
                return null;
            }
        }
        return payload;
    }
    async revokeRefreshTokensForUser(refreshToken) {
        const tokenDoc = await this.refreshTokenRepository.findOne({ token: refreshToken });
        if (tokenDoc) {
            await this.refreshTokenRepository.deleteManyByUserId(tokenDoc.userId);
        }
    }
    async getProfile(userId, role) {
        if (role === 'customer') {
            const user = await this.userRepository.findByIdString(userId);
            if (!user) {
                throw new common_1.UnauthorizedException('User not found');
            }
            return user.toObject ? user.toObject() : user;
        }
        const admin = await this.adminUserRepository.getModel()
            .findById(userId)
            .select('-password -__v')
            .populate('store', 'name code')
            .exec();
        if (!admin) {
            throw new common_1.UnauthorizedException('User not found');
        }
        return admin.toObject ? admin.toObject() : admin;
    }
};
exports.AuthService = AuthService;
AuthService.OTP_TTL_MS = 5 * 60 * 1000;
AuthService.OTP_RATE_LIMIT_MS = 60 * 1000;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [admin_user_repository_1.AdminUserRepository,
        user_repository_1.UserRepository,
        store_repository_1.StoreRepository,
        refresh_token_repository_1.RefreshTokenRepository,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map