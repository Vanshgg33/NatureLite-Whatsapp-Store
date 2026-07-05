import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AdminUserRepository } from '../admin/repositories/admin-user.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { StoreRepository } from '../stores/repositories/store.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { RefreshToken } from './schemas/refresh-token.schema';
import {
  AdminLoginDto,
  AdminRegisterDto,
  CustomerLoginDto,
  CustomerRegisterDto,
  CustomerEmailLoginDto,
  AuthResponse,
  ChangePasswordDto,
} from './dto/auth.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { parseObjectId } from '../../common/utils/objectid.util';
import { RedisService } from '../redis/redis.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly userRepository: UserRepository,
    private readonly storeRepository: StoreRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async generateTokens(
    payload: JwtPayload,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwtService.sign(payload, { expiresIn: '4h' });
    const refreshToken = uuidv4();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const data: Partial<RefreshToken> = {
      token: this.hashToken(refreshToken),
      userId: parseObjectId(payload.sub, 'userId'),
      role: payload.role,
      expiresAt,
    };
    if (payload.storeId) {
      data.storeId = parseObjectId(payload.storeId, 'storeId');
    }
    // Must persist before returning: the client will immediately make authenticated
    // requests, and any transient 401 triggers a refresh round-trip. A fire-and-forget
    // insert loses that race on slow DB writes and the user gets bounced to login.
    await this.refreshTokenRepository.create(data);
    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResponse> {
    const tokenDoc = await this.refreshTokenRepository.findOne({ token: this.hashToken(refreshToken) });

    if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
      if (tokenDoc?._id) {
        await this.refreshTokenRepository.deleteOne({ _id: tokenDoc._id });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.refreshTokenRepository.deleteOne({ _id: tokenDoc._id });

    let user: any;
    let phone = '';
    if (tokenDoc.role === 'customer') {
      user = await this.userRepository.findByIdString(tokenDoc.userId.toString());
      if (!user || user.isBlocked) {
        throw new UnauthorizedException('User account is not active');
      }
      phone = user.phone || '';
    } else {
      user = await this.adminUserRepository.findByIdString(tokenDoc.userId.toString());
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Admin account is not active');
      }
      phone = user.phone || '';
    }

    const payload: JwtPayload = {
      sub: tokenDoc.userId.toString(),
      phone,
      role: tokenDoc.role as JwtPayload['role'],
      storeId: tokenDoc.storeId ? tokenDoc.storeId.toString() : undefined,
      departmentType: tokenDoc.role !== 'customer' ? (user as any).departmentType : undefined,
    };

    const tokens = await this.generateTokens(payload);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: tokenDoc.role,
        storeId: tokenDoc.storeId ? tokenDoc.storeId.toString() : undefined,
      },
    };
  }

  async adminLogin(dto: AdminLoginDto): Promise<AuthResponse> {
    const admin = await this.adminUserRepository.findOneByEmailForAuth(dto.email.toLowerCase());

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
      await this.adminUserRepository.updateOne({ _id: admin._id }, { $set: update });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.adminUserRepository.updateOne(
      { _id: admin._id },
      { $set: { lastLoginAt: new Date(), failedLoginAttempts: 0 }, $unset: { lockoutUntil: 1 } },
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
      departmentType: admin.departmentType,
    };

    const tokens = await this.generateTokens(payload);

    return {
      ...tokens,
      user: {
        id: admin._id.toString(),
        email: admin.email,
        name: admin.name,
        role: admin.role,
        departmentType: admin.departmentType,
        storeId,
        storeName,
      },
    };
  }

  async adminRegister(dto: AdminRegisterDto): Promise<AuthResponse> {
    // Guard: if ADMIN_INVITE_TOKEN env var is set, the caller must supply a matching token.
    // If the env var is not set, only allow registration when no admins exist yet (bootstrap).
    const configuredToken = process.env.ADMIN_INVITE_TOKEN;
    const adminCount = await this.adminUserRepository.countDocuments({});
    if (configuredToken) {
      if (dto.inviteToken !== configuredToken) {
        throw new UnauthorizedException('Invalid or missing invite token');
      }
    } else if (adminCount > 0) {
      // No invite token configured and admins already exist → registration is closed.
      throw new UnauthorizedException('Admin registration is closed. Set ADMIN_INVITE_TOKEN to enable.');
    }

    const existingAdmin = await this.adminUserRepository.findOneByEmail(dto.email.toLowerCase());

    if (existingAdmin) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // First admin to register becomes superadmin (store owner); subsequent registrations get admin role
    // adminCount was already fetched above for the invite-token guard — reuse it here.
    const adminData: any = {
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      phone: dto.phone,
      role: adminCount === 0 ? 'superadmin' : 'admin',
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
      departmentType: admin.departmentType,
    };

    const tokens = await this.generateTokens(payload);

    return {
      ...tokens,
      user: {
        id: admin._id.toString(),
        email: admin.email,
        name: admin.name,
        role: admin.role,
        departmentType: admin.departmentType,
        storeId,
        storeName,
      },
    };
  }

  async claimSuperadmin(userId: string): Promise<{ message: string }> {
    const superadminCount = await this.adminUserRepository.countDocuments({ role: 'superadmin' });
    if (superadminCount > 0) {
      throw new BadRequestException('A superadmin already exists. This endpoint is only available during initial setup.');
    }
    const idObj = parseObjectId(userId, 'userId');
    await this.adminUserRepository.updateOne({ _id: idObj }, { $set: { role: 'superadmin' } });
    return { message: 'Your account has been promoted to superadmin. Please log out and log back in.' };
  }

  async customerLogin(dto: CustomerLoginDto): Promise<AuthResponse> {
    const devBypass = dto.otp === '123456' && process.env.ENABLE_OTP_BYPASS === 'true';
    if (!devBypass) {
      const stored = await this.redisService.get(`otp:${dto.phone}`);
      if (!stored) {
        throw new UnauthorizedException('Invalid or expired OTP. Please request a new one.');
      }
      if (stored !== dto.otp) {
        throw new UnauthorizedException('Invalid OTP');
      }
      await this.redisService.del(`otp:${dto.phone}`);
    }

    // Chatbot users are stored as 91XXXXXXXXXX; OTP login sends 10-digit — check both
    let user = await this.userRepository.findOneByPhone(dto.phone)
      ?? await this.userRepository.findOneByPhone(`91${dto.phone}`);

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

    const tokens = await this.generateTokens(payload);

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

    const tokens = await this.generateTokens(payload);

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
    const user = await this.userRepository.findOneByEmailForAuth(dto.email.toLowerCase());

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

    const tokens = await this.generateTokens(payload);

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
    const rateLimitKey = `otp:rate:${phone}`;
    const rateEntry = await this.redisService.get(rateLimitKey);
    if (rateEntry) {
      const waitSec = Math.ceil((60_000 - (Date.now() - parseInt(rateEntry, 10))) / 1000);
      throw new BadRequestException(`Please wait ${waitSec} seconds before requesting another OTP.`);
    }

    const otp = process.env.ENABLE_OTP_BYPASS === 'true'
      ? '123456'
      : String(Math.floor(100000 + Math.random() * 900000));

    // OTP key expires in 5 min; rate-limit key expires in 60 s
    await this.redisService.set(`otp:${phone}`, otp, 300);
    await this.redisService.set(rateLimitKey, String(Date.now()), 60);

    this.logger.log(`Sending OTP to ${phone}`);

    const messageId = await this.whatsappService.sendTemplateMessage({
      phone: `91${phone}`,
      templateName: 'otp',
      bodyParams: [otp],
      languageCode: 'en',
    });

    if (!messageId) {
      throw new BadRequestException('Could not send OTP via WhatsApp. Please check your number and try again.');
    }

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  async changePassword(adminId: string, dto: ChangePasswordDto): Promise<void> {
    const admin = await this.adminUserRepository.findByIdWithPassword(adminId);

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
      // Always sync departmentType from DB so stale JWTs (issued before the field
      // was set, or after it changed) still get the correct per-user order filter.
      return { ...payload, departmentType: admin.departmentType };
    }

    return payload;
  }

  /**
   * Revoke all refresh tokens for the user identified by the given refresh token.
   * Call this on logout when the client sends its refresh token so sessions are fully terminated.
   */
  async revokeRefreshTokensForUser(refreshToken: string): Promise<void> {
    const tokenDoc = await this.refreshTokenRepository.findOne({ token: this.hashToken(refreshToken) });
    if (tokenDoc) {
      await this.refreshTokenRepository.deleteManyByUserId(tokenDoc.userId);
    }
  }

  async getProfile(userId: string, role: string): Promise<any> {
    if (role === 'customer') {
      const user = await this.userRepository.getModel()
        .findById(userId)
        .select('-password -failedLoginAttempts -lockoutUntil -blockedReason -isBlocked -notes -tags -__v')
        .exec();
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return user.toObject ? user.toObject() : user;
    }

    const admin = await this.adminUserRepository.getModel()
      .findById(userId)
      .select('-password -plainPassword -__v')
      .populate('store', 'name code')
      .exec();

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }
    return admin.toObject ? admin.toObject() : admin;
  }
}
