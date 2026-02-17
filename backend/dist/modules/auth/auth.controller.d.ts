import { AuthService } from './auth.service';
import { AdminLoginDto, AdminRegisterDto, CustomerLoginDto, ChangePasswordDto, AuthResponse } from './dto/auth.dto';
import { JwtPayload } from '@/common/decorators/current-user.decorator';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    adminLogin(dto: AdminLoginDto): Promise<AuthResponse>;
    adminRegister(dto: AdminRegisterDto): Promise<AuthResponse>;
    customerLogin(dto: CustomerLoginDto): Promise<AuthResponse>;
    changePassword(userId: string, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
    getProfile(user: JwtPayload): Promise<Record<string, unknown>>;
}
