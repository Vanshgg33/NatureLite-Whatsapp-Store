import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '@/common/decorators/current-user.decorator';
import { StoresService } from '../stores/stores.service';

@Controller('reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class RemindersController {
  constructor(
    private readonly remindersService: RemindersService,
    private readonly storesService: StoresService,
  ) {}

  @Get('due')
  async getDueReminders(@CurrentUser() user: JwtPayload) {
    let storeIds: string[] = [];
    if (user.storeId) {
      storeIds = [user.storeId];
    } else {
      const stores = await this.storesService.findAll();
      storeIds = stores.map((s) => s._id.toString());
    }
    return this.remindersService.getDueReminders(storeIds);
  }

  @Post(':id/dismiss')
  async dismiss(@Param('id') id: string) {
    return this.remindersService.dismiss(id);
  }
}
