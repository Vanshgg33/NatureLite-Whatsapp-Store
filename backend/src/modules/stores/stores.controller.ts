import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto, UpdateStoreDto, ResetStorePasswordDto } from './dto/store.dto';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';

@Controller('stores')
@UseGuards(RolesGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  @Roles('superadmin')
  async create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto);
  }

  @Get()
  @Roles('admin', 'superadmin')
  async findAll() {
    return this.storesService.findAll();
  }

  @Get(':id')
  @Roles('admin', 'superadmin')
  async findById(@Param('id') id: string) {
    return this.storesService.findById(id);
  }

  @Put(':id')
  @Roles('superadmin')
  async update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.storesService.update(id, dto);
  }

  @Put(':id/reset-password')
  @Roles('superadmin')
  async resetStorePassword(
    @Param('id') storeId: string,
    @Body() dto: ResetStorePasswordDto,
  ) {
    return this.storesService.resetStorePassword(storeId, dto.newPassword);
  }
}
