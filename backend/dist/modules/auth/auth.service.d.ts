import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { AdminUserDocument } from '../admin/schemas/admin-user.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { AdminLoginDto, AdminRegisterDto, CustomerLoginDto, CustomerRegisterDto, CustomerEmailLoginDto, AuthResponse, ChangePasswordDto } from './dto/auth.dto';
import { JwtPayload } from '@/common/decorators/current-user.decorator';
export declare class AuthService {
    private adminUserModel;
    private userModel;
    private jwtService;
    private readonly logger;
    constructor(adminUserModel: Model<AdminUserDocument>, userModel: Model<UserDocument>, jwtService: JwtService);
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
