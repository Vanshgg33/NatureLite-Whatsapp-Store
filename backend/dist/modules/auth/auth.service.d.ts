import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminUserRepository } from '../admin/repositories/admin-user.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { StoreRepository } from '../stores/repositories/store.repository';
import { AdminLoginDto, AdminRegisterDto, CustomerLoginDto, CustomerRegisterDto, CustomerEmailLoginDto, AuthResponse, ChangePasswordDto } from './dto/auth.dto';
import { JwtPayload } from '@/common/decorators/current-user.decorator';
export declare class AuthService {
    private readonly adminUserRepository;
    private readonly userRepository;
    private readonly storeRepository;
    private jwtService;
    private configService;
    private readonly logger;
    private refreshTokens;
    constructor(adminUserRepository: AdminUserRepository, userRepository: UserRepository, storeRepository: StoreRepository, jwtService: JwtService, configService: ConfigService);
    private generateTokens;
    refreshAccessToken(refreshToken: string): Promise<AuthResponse>;
    adminLogin(dto: AdminLoginDto): Promise<AuthResponse>;
    adminRegister(dto: AdminRegisterDto): Promise<AuthResponse>;
    customerLogin(dto: CustomerLoginDto): Promise<AuthResponse>;
    customerRegister(dto: CustomerRegisterDto): Promise<AuthResponse>;
    customerEmailLogin(dto: CustomerEmailLoginDto): Promise<AuthResponse>;
    sendOtp(phone: string): Promise<{
        success: boolean;
        message: string;
    }>;
    changePassword(adminId: string, dto: ChangePasswordDto): Promise<void>;
    validateUser(payload: JwtPayload): Promise<JwtPayload | null>;
    getProfile(userId: string, role: string): Promise<any>;
}
