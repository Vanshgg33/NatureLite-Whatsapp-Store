import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AdminLoginDto,
  AdminRegisterDto,
  CustomerLoginDto,
  ChangePasswordDto,
  AuthResponse,
} from './dto/auth.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser, JwtPayload } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { Public } from '@/common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() dto: AdminLoginDto): Promise<AuthResponse> {
    return this.authService.adminLogin(dto);
  }

  @Public()
  @Post('admin/register')
  async adminRegister(@Body() dto: AdminRegisterDto): Promise<AuthResponse> {
    return this.authService.adminRegister(dto);
  }

  @Public()
  @Post('customer/login')
  @HttpCode(HttpStatus.OK)
  async customerLogin(@Body() dto: CustomerLoginDto): Promise<AuthResponse> {
    return this.authService.customerLogin(dto);
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
