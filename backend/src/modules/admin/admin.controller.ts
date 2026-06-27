import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { AdminService } from './admin.service';
import { AdminUser } from './schemas/admin-user.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('delivery-staff')
  @Roles('admin', 'superadmin')
  async getDeliveryStaff(): Promise<AdminUser[]> {
    return this.adminService.findDeliveryStaff();
  }

  @Get()
  async findAll(): Promise<AdminUser[]> {
    return this.adminService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<AdminUser> {
    return this.adminService.findById(id);
  }

  @Post()
  async create(
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      role?: 'admin' | 'superadmin';
      departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';
    },
  ): Promise<AdminUser> {
    return this.adminService.create(body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      phone?: string;
      role?: 'admin' | 'superadmin';
      isActive?: boolean;
      permissions?: string[];
      departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';
    },
  ): Promise<AdminUser> {
    return this.adminService.update(id, body);
  }

  @Put(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<{ success: boolean }> {
    await this.adminService.resetPassword(id, dto.password);
    return { success: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.adminService.delete(id);
    return { success: true };
  }
}

