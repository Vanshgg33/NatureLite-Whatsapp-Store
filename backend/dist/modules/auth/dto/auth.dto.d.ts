export declare class AdminLoginDto {
    email: string;
    password: string;
}
export declare class AdminRegisterDto {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: 'admin' | 'superadmin';
}
export declare class CustomerLoginDto {
    phone: string;
    otp: string;
}
export declare class SendOtpDto {
    phone: string;
}
export declare class RefreshTokenDto {
    refreshToken: string;
}
export declare class ChangePasswordDto {
    currentPassword: string;
    newPassword: string;
}
export interface AuthResponse {
    accessToken: string;
    refreshToken?: string;
    user: {
        id: string;
        email?: string;
        phone?: string;
        name?: string;
        role: string;
    };
}
