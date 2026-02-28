import {
  Controller,
  Post,
  Body,
  Get,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import {
  AdminLoginDto,
  AdminRegisterDto,
  CustomerLoginDto,
  CustomerRegisterDto,
  CustomerEmailLoginDto,
  SendOtpDto,
  ChangePasswordDto,
  RefreshTokenDto,
  AuthResponse,
} from './dto/auth.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser, JwtPayload } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { Public } from '@/common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private setAuthCookie(res: Response, token: string): void {
    const isProduction = this.configService.get<string>('app.nodeEnv') === 'production';

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }

  private clearAuthCookie(res: Response): void {
    res.clearCookie('access_token', {
      httpOnly: true,
      path: '/',
    });
  }

  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.adminLogin(dto);
    this.setAuthCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post('admin/register')
  async adminRegister(
    @Body() dto: AdminRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.adminRegister(dto);
    this.setAuthCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post('customer/login')
  @HttpCode(HttpStatus.OK)
  async customerLogin(
    @Body() dto: CustomerLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.customerLogin(dto);
    this.setAuthCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post('customer/register')
  async customerRegister(
    @Body() dto: CustomerRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.customerRegister(dto);
    this.setAuthCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post('customer/email-login')
  @HttpCode(HttpStatus.OK)
  async customerEmailLogin(
    @Body() dto: CustomerEmailLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.customerEmailLogin(dto);
    this.setAuthCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post('customer/send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(
    @Body() dto: SendOtpDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.sendOtp(dto.phone);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.refreshAccessToken(dto.refreshToken);
    this.setAuthCookie(res, result.accessToken);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    this.clearAuthCookie(res);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(userId, dto);
    return { message: 'Password changed successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: JwtPayload): Promise<Record<string, unknown>> {
    return this.authService.getProfile(user.sub, user.role);
  }
}
