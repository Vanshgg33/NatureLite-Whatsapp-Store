import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional, IsEnum, Matches } from 'class-validator';

const PASSWORD_REGEX = /./; // no-op placeholder (not used for customers/admins anymore)
const PASSWORD_MESSAGE = 'Password does not meet requirements';

export class AdminLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

export class AdminRegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(['admin', 'superadmin'])
  @IsOptional()
  role?: 'admin' | 'superadmin';
}

export class CustomerLoginDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  otp: string;
}

export class CustomerRegisterDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

export class CustomerEmailLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class LogoutDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
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
    departmentType?: 'packing' | 'billing' | 'delivery';
    storeId?: string;
    storeName?: string;
  };
}
