import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  AddAddressDto,
  UpdateAddressDto,
  UserQueryDto,
} from './dto/user.dto';
import { User } from './schemas/user.schema';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PaginatedResult } from '@/common/types/pagination.types';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('admin', 'superadmin')
  async create(@Body() dto: CreateUserDto): Promise<User> {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles('admin', 'superadmin')
  async findAll(@Query() query: UserQueryDto): Promise<PaginatedResult<User>> {
    return this.usersService.findAll(query);
  }

  @Get('me')
  async getMyProfile(@CurrentUser('sub') userId: string): Promise<User> {
    return this.usersService.findById(userId);
  }

  @Get(':id')
  @Roles('admin', 'superadmin')
  async findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  @Put('me')
  async updateMyProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(userId, dto);
  }

  @Put(':id')
  @Roles('admin', 'superadmin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(id, dto);
  }

  @Post('me/addresses')
  async addMyAddress(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddAddressDto,
  ): Promise<User> {
    return this.usersService.addAddress(userId, dto);
  }

  @Put('me/addresses/:index')
  async updateMyAddress(
    @CurrentUser('sub') userId: string,
    @Param('index') index: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<User> {
    return this.usersService.updateAddress(userId, parseInt(index, 10), dto);
  }

  @Delete('me/addresses/:index')
  async removeMyAddress(
    @CurrentUser('sub') userId: string,
    @Param('index') index: string,
  ): Promise<User> {
    return this.usersService.removeAddress(userId, parseInt(index, 10));
  }

  @Post(':id/block')
  @Roles('admin', 'superadmin')
  async blockUser(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ): Promise<User> {
    return this.usersService.blockUser(id, reason);
  }

  @Post(':id/unblock')
  @Roles('admin', 'superadmin')
  async unblockUser(@Param('id') id: string): Promise<User> {
    return this.usersService.unblockUser(id);
  }

  @Delete(':id')
  @Roles('superadmin')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.delete(id);
    return { message: 'User deleted successfully' };
  }
}
