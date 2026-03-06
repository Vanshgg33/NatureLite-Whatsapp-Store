import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminUserRepository } from '../admin/repositories/admin-user.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { StoreRepository } from '../stores/repositories/store.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { AdminLoginDto, AdminRegisterDto, CustomerLoginDto, CustomerRegisterDto, CustomerEmailLoginDto, AuthResponse, ChangePasswordDto } from './dto/auth.dto';
import { JwtPayload } from '@/common/decorators/current-user.decorator';
export declare class AuthService {
    private readonly adminUserRepository;
    private readonly userRepository;
    private readonly storeRepository;
    private readonly refreshTokenRepository;
    private jwtService;
    private configService;
    private readonly logger;
    constructor(adminUserRepository: AdminUserRepository, userRepository: UserRepository, storeRepository: StoreRepository, refreshTokenRepository: RefreshTokenRepository, jwtService: JwtService, configService: ConfigService);
    private generateTokens;
    refreshAccessToken(refreshToken: string): Promise<AuthResponse>;
    adminLogin(dto: AdminLoginDto): Promise<AuthResponse>;
    adminRegister(dto: AdminRegisterDto): Promise<AuthResponse>;
    private readonly otpStore;
    private readonly otpRateLimit;
    private static readonly OTP_TTL_MS;
    private static readonly OTP_RATE_LIMIT_MS;
    customerLogin(dto: CustomerLoginDto): Promise<AuthResponse>;
    customerRegister(dto: CustomerRegisterDto): Promise<AuthResponse>;
    customerEmailLogin(dto: CustomerEmailLoginDto): Promise<AuthResponse>;
    sendOtp(phone: string): Promise<{
        success: boolean;
        message: string;
    }>;
    changePassword(adminId: string, dto: ChangePasswordDto): Promise<void>;
    validateUser(payload: JwtPayload): Promise<JwtPayload | null>;
    revokeRefreshTokensForUser(refreshToken: string): Promise<void>;
    getProfile(userId: string, role: string): Promise<any>;
}
