import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { DeliveryCollectionsService } from './delivery-collections.service';
import { GetLedgerDto, SettleCollectionDto } from './dto/delivery-collections.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@Controller('delivery-collections')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class DeliveryCollectionsController {
  constructor(private readonly service: DeliveryCollectionsService) {}

  @Get('summary')
  getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getLedgerSummary(startDate, endDate);
  }

  @Get('ledger')
  getLedger(@Query() dto: GetLedgerDto) {
    return this.service.getLedger(dto);
  }

  @Get('breakdown')
  getBreakdown(
    @Query('deliveryUserId') deliveryUserId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getBreakdown(deliveryUserId, startDate, endDate);
  }

  @Get('pending')
  getPending(@Query('deliveryUserId') deliveryUserId: string) {
    return this.service.getPendingOrdersForUser(deliveryUserId);
  }

  @Post('settle')
  settle(@Body() dto: SettleCollectionDto, @CurrentUser() user: JwtPayload) {
    return this.service.settle(dto, user.sub);
  }
}
