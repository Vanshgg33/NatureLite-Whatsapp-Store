import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminUserDocument } from '../admin/schemas/admin-user.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  AdminLoginDto,
  AdminRegisterDto,
  CustomerLoginDto,
  CustomerRegisterDto,
  CustomerEmailLoginDto,
  AuthResponse,
  ChangePasswordDto,
} from './dto/auth.dto';
import { JwtPayload } from '@/common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUserDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async adminLogin(dto: AdminLoginDto): Promise<AuthResponse> {
    const admin = await this.adminUserModel.findOne({ email: dto.email.toLowerCase() });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Check account lockout
    if (admin.lockoutUntil && admin.lockoutUntil > new Date()) {
      const minutesLeft = Math.ceil((admin.lockoutUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Account locked. Try again in ${minutesLeft} minutes.`);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);

    if (!isPasswordValid) {
      const attempts = (admin.failedLoginAttempts || 0) + 1;
      const update: Record<string, any> = { failedLoginAttempts: attempts };
      if (attempts >= 5) {
        update.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lockout
      }
      await this.adminUserModel.updateOne({ _id: admin._id }, update);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    await this.adminUserModel.updateOne(
      { _id: admin._id },
      { lastLoginAt: new Date(), failedLoginAttempts: 0, lockoutUntil: null },
    );

    const payload: JwtPayload = {
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

  async adminRegister(dto: AdminRegisterDto): Promise<AuthResponse> {
    const existingAdmin = await this.adminUserModel.findOne({
      email: dto.email.toLowerCase(),
    });

    if (existingAdmin) {
      throw new ConflictException('Email already registered');
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

    const payload: JwtPayload = {
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

  async customerLogin(dto: CustomerLoginDto): Promise<AuthResponse> {
    // In production, verify OTP with your OTP provider
    // For now, we'll accept any OTP for development
    if (dto.otp !== '123456' && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Invalid OTP');
    }

    let user = await this.userModel.findOne({ phone: dto.phone });

    if (!user) {
      user = new this.userModel({ phone: dto.phone });
      await user.save();
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Account is blocked');
    }

    const payload: JwtPayload = {
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

  async customerRegister(dto: CustomerRegisterDto): Promise<AuthResponse> {
    const existingUser = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    if (dto.phone) {
      const phoneExists = await this.userModel.findOne({ phone: dto.phone });
      if (phoneExists) {
        throw new ConflictException('Phone number already registered');
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

    const payload: JwtPayload = {
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

  async customerEmailLogin(dto: CustomerEmailLoginDto): Promise<AuthResponse> {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      throw new UnauthorizedException('Please login with phone/OTP or reset your password');
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Account is blocked');
    }

    // Check account lockout
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Account locked. Try again in ${minutesLeft} minutes.`);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const update: Record<string, any> = { failedLoginAttempts: attempts };
      if (attempts >= 5) {
        update.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await this.userModel.updateOne({ _id: user._id }, update);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    await this.userModel.updateOne(
      { _id: user._id },
      { failedLoginAttempts: 0, lockoutUntil: null },
    );

    const payload: JwtPayload = {
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

  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    // In production, integrate with your SMS provider (Twilio, MSG91, etc.)
    // For now, we'll just log and return success
    this.logger.log(`Sending OTP to ${phone}`);

    // In development, the OTP is always '123456'
    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  async changePassword(adminId: string, dto: ChangePasswordDto): Promise<void> {
    const admin = await this.adminUserModel.findById(adminId);

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, admin.password);

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.adminUserModel.updateOne(
      { _id: adminId },
      { password: hashedPassword },
    );
  }

  async validateUser(payload: JwtPayload): Promise<JwtPayload | null> {
    if (payload.role === 'customer') {
      const user = await this.userModel.findById(payload.sub);
      if (!user || user.isBlocked) {
        return null;
      }
    } else {
      const admin = await this.adminUserModel.findById(payload.sub);
      if (!admin || !admin.isActive) {
        return null;
      }
    }

    return payload;
  }

  async getProfile(userId: string, role: string): Promise<any> {
    if (role === 'customer') {
      const user = await this.userModel.findById(userId).select('-__v');
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return user.toObject();
    }

    const admin = await this.adminUserModel.findById(userId).select('-password -__v');
    if (!admin) {
      throw new UnauthorizedException('User not found');
    }
    return admin.toObject();
  }
}
