import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AdminLoginDto, AdminRegisterDto, CustomerLoginDto, CustomerRegisterDto, CustomerEmailLoginDto, SendOtpDto, ChangePasswordDto, RefreshTokenDto, LogoutDto, AuthResponse } from './dto/auth.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
export declare class AuthController {
    private readonly authService;
    private readonly configService;
    constructor(authService: AuthService, configService: ConfigService);
    private setAuthCookies;
    private clearAuthCookie;
    adminLogin(dto: AdminLoginDto, res: Response): Promise<AuthResponse>;
    adminRegister(dto: AdminRegisterDto, res: Response): Promise<AuthResponse>;
    customerLogin(dto: CustomerLoginDto, res: Response): Promise<AuthResponse>;
    customerRegister(dto: CustomerRegisterDto, res: Response): Promise<AuthResponse>;
    customerEmailLogin(dto: CustomerEmailLoginDto, res: Response): Promise<AuthResponse>;
    sendOtp(dto: SendOtpDto): Promise<{
        success: boolean;
        message: string;
    }>;
    refreshToken(dto: RefreshTokenDto, req: Request, res: Response): Promise<AuthResponse>;
    logout(body: LogoutDto, req: Request, res: Response): Promise<{
        message: string;
    }>;
    changePassword(userId: string, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
    getProfile(user: JwtPayload): Promise<Record<string, unknown>>;
}
