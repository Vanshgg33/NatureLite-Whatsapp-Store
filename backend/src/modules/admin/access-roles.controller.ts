import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { AccessRolesService } from './access-roles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { ADMIN_PAGES } from '../../common/permissions/admin-pages';

class AccessRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}

@Controller('admin/access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminAccessMeController {
  constructor(private readonly service: AccessRolesService) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.service.myAccess(user.sub);
  }
}

@Controller('admin/roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AccessRolesController {
  constructor(private readonly service: AccessRolesService) {}

  @Get('registry')
  registry() {
    return ADMIN_PAGES;
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: AccessRoleDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, { id: user.sub });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: AccessRoleDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, dto, { id: user.sub });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.remove(id, { id: user.sub });
    return { success: true };
  }
}
