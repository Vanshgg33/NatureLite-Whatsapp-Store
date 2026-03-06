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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const auth_dto_1 = require("./dto/auth.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
let AuthController = class AuthController {
    constructor(authService, configService) {
        this.authService = authService;
        this.configService = configService;
    }
    setAuthCookie(res, token) {
        const isProduction = this.configService.get('app.nodeEnv') === 'production';
        res.cookie('access_token', token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });
    }
    clearAuthCookie(res) {
        res.clearCookie('access_token', {
            httpOnly: true,
            path: '/',
        });
    }
    async adminLogin(dto, res) {
        const result = await this.authService.adminLogin(dto);
        this.setAuthCookie(res, result.accessToken);
        return result;
    }
    async adminRegister(dto, res) {
        const result = await this.authService.adminRegister(dto);
        this.setAuthCookie(res, result.accessToken);
        return result;
    }
    async customerLogin(dto, res) {
        const result = await this.authService.customerLogin(dto);
        this.setAuthCookie(res, result.accessToken);
        return result;
    }
    async customerRegister(dto, res) {
        const result = await this.authService.customerRegister(dto);
        this.setAuthCookie(res, result.accessToken);
        return result;
    }
    async customerEmailLogin(dto, res) {
        const result = await this.authService.customerEmailLogin(dto);
        this.setAuthCookie(res, result.accessToken);
        return result;
    }
    async sendOtp(dto) {
        return this.authService.sendOtp(dto.phone);
    }
    async refreshToken(dto, res) {
        const result = await this.authService.refreshAccessToken(dto.refreshToken);
        this.setAuthCookie(res, result.accessToken);
        return result;
    }
    async logout(body, res) {
        if (body?.refreshToken) {
            await this.authService.revokeRefreshTokensForUser(body.refreshToken);
        }
        this.clearAuthCookie(res);
        return { message: 'Logged out successfully' };
    }
    async changePassword(userId, dto) {
        await this.authService.changePassword(userId, dto);
        return { message: 'Password changed successfully' };
    }
    async getProfile(user) {
        return this.authService.getProfile(user.sub, user.role);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('admin/login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.AdminLoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "adminLogin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('admin/register'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.AdminRegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "adminRegister", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('customer/login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.CustomerLoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "customerLogin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('customer/register'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.CustomerRegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "customerRegister", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('customer/email-login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.CustomerEmailLoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "customerEmailLogin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    (0, common_1.Post)('customer/send-otp'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.SendOtpDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "sendOtp", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshTokenDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refreshToken", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.LogoutDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    (0, common_1.Post)('change-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, auth_dto_1.ChangePasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('profile'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getProfile", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        config_1.ConfigService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map