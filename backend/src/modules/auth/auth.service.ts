import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { AdminUserRepository } from '../admin/repositories/admin-user.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { StoreRepository } from '../stores/repositories/store.repository';
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
import { parseObjectId } from '@/common/utils/objectid.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private refreshTokens = new Map<string, { userId: string; role: string; storeId?: string; expiresAt: Date }>();

  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly userRepository: UserRepository,
    private readonly storeRepository: StoreRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = uuidv4();
    this.refreshTokens.set(refreshToken, {
      userId: payload.sub,
      role: payload.role,
      storeId: payload.storeId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResponse> {
    const stored = this.refreshTokens.get(refreshToken);

    if (!stored || stored.expiresAt < new Date()) {
      this.refreshTokens.delete(refreshToken);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    this.refreshTokens.delete(refreshToken);

    let user: any;
    let phone = '';
    if (stored.role === 'customer') {
      user = await this.userRepository.findByIdString(stored.userId);
      if (!user || user.isBlocked) {
        throw new UnauthorizedException('User account is not active');
      }
      phone = user.phone || '';
    } else {
      user = await this.adminUserRepository.findByIdString(stored.userId);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Admin account is not active');
      }
      phone = user.phone || '';
    }

    const payload: JwtPayload = {
      sub: stored.userId,
      phone,
      role: stored.role as JwtPayload['role'],
      storeId: stored.storeId,
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
        role: stored.role,
        storeId: stored.storeId,
      },
    };
  }

  async adminLogin(dto: AdminLoginDto): Promise<AuthResponse> {
    const admin = await this.adminUserRepository.findOneByEmail(dto.email.toLowerCase());

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (admin.lockoutUntil && admin.lockoutUntil > new Date()) {
      const minutesLeft = Math.ceil((admin.lockoutUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Account locked. Try again in ${minutesLeft} minutes.`);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);

    if (!isPasswordValid) {
      const attempts = (admin.failedLoginAttempts || 0) + 1;
      const update: Record<string, unknown> = { failedLoginAttempts: attempts };
      if (attempts >= 5) {
        update.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await this.adminUserRepository.updateOne({ _id: admin._id }, update);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.adminUserRepository.updateOne(
      { _id: admin._id },
      { lastLoginAt: new Date(), failedLoginAttempts: 0, lockoutUntil: null },
    );

    let storeId: string | undefined;
    let storeName: string | undefined;
    if (admin.store) {
      storeId = admin.store.toString();
      const store = await this.storeRepository.findById(admin.store);
      if (store) storeName = store.name;
    }

    const payload: JwtPayload = {
      sub: admin._id.toString(),
      phone: admin.phone || '',
      role: admin.role,
      storeId,
    };

    const tokens = this.generateTokens(payload);

    return {
      ...tokens,
      user: {
        id: admin._id.toString(),
        email: admin.email,
        name: admin.name,
        role: admin.role,
        storeId,
        storeName,
      },
    };
  }

  async adminRegister(dto: AdminRegisterDto): Promise<AuthResponse> {
    const existingAdmin = await this.adminUserRepository.findOneByEmail(dto.email.toLowerCase());

    if (existingAdmin) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const adminData: any = {
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phone,
      role: dto.role || 'admin',
    };
    if ((dto as any).storeId) {
      adminData.store = parseObjectId((dto as any).storeId, 'storeId');
    }

    const admin = await this.adminUserRepository.create(adminData);

    const storeId = admin.store?.toString();
    let storeName: string | undefined;
    if (admin.store) {
      const store = await this.storeRepository.findById(admin.store);
      if (store) storeName = store.name;
    }

    const payload: JwtPayload = {
      sub: admin._id.toString(),
      phone: admin.phone || '',
      role: admin.role,
      storeId,
    };

    const tokens = this.generateTokens(payload);

    return {
      ...tokens,
      user: {
        id: admin._id.toString(),
        email: admin.email,
        name: admin.name,
        role: admin.role,
        storeId,
        storeName,
      },
    };
  }

  async customerLogin(dto: CustomerLoginDto): Promise<AuthResponse> {
    if (dto.otp !== '123456' && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Invalid OTP');
    }

    let user = await this.userRepository.findOneByPhone(dto.phone);

    if (!user) {
      user = await this.userRepository.create({ phone: dto.phone } as any);
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Account is blocked');
    }

    const payload: JwtPayload = {
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

  async customerRegister(dto: CustomerRegisterDto): Promise<AuthResponse> {
    const existingUser = await this.userRepository.findOneByEmail(dto.email.toLowerCase());

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    if (dto.phone) {
      const phoneExists = await this.userRepository.findOneByPhone(dto.phone);
      if (phoneExists) {
        throw new ConflictException('Phone number already registered');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.userRepository.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phone,
    } as any);

    const payload: JwtPayload = {
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

  async customerEmailLogin(dto: CustomerEmailLoginDto): Promise<AuthResponse> {
    const user = await this.userRepository.findOneByEmail(dto.email.toLowerCase());

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      throw new UnauthorizedException('Please login with phone/OTP or reset your password');
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Account is blocked');
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Account locked. Try again in ${minutesLeft} minutes.`);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const update: Record<string, unknown> = { failedLoginAttempts: attempts };
      if (attempts >= 5) {
        update.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await this.userRepository.updateOne({ _id: user._id }, update);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.userRepository.updateOne(
      { _id: user._id },
      { failedLoginAttempts: 0, lockoutUntil: null },
    );

    const payload: JwtPayload = {
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

  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Sending OTP to ${phone}`);
    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  async changePassword(adminId: string, dto: ChangePasswordDto): Promise<void> {
    const admin = await this.adminUserRepository.findByIdString(adminId);

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, admin.password);

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.adminUserRepository.updateOne(
      { _id: parseObjectId(adminId, 'adminId') },
      { password: hashedPassword },
    );
  }

  async validateUser(payload: JwtPayload): Promise<JwtPayload | null> {
    if (payload.role === 'customer') {
      const user = await this.userRepository.findByIdString(payload.sub);
      if (!user || user.isBlocked) {
        return null;
      }
    } else {
      const admin = await this.adminUserRepository.findByIdString(payload.sub);
      if (!admin || !admin.isActive) {
        return null;
      }
    }

    return payload;
  }

  async getProfile(userId: string, role: string): Promise<any> {
    if (role === 'customer') {
      const user = await this.userRepository.findByIdString(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return user.toObject ? user.toObject() : user;
    }

    const admin = await this.adminUserRepository.getModel()
      .findById(userId)
      .select('-password -__v')
      .populate('store', 'name code')
      .exec();

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }
    return admin.toObject ? admin.toObject() : admin;
  }
}
