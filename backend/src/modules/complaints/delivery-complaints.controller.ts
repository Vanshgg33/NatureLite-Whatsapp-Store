import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { ComplaintsService } from './complaints.service';

/** Delivery staff have no CRM page access, so this endpoint is checked against order assignment instead of a page permission. */
@Controller('complaints')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class DeliveryComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post('delivery-issue')
  async deliveryIssue(
    @Body() body: { orderId: string; issue: 'damaged' | 'wrong_item' | 'missing_item' | 'refused'; note?: string; photoUrl?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    const c = await this.complaints.createFromDelivery(user, body);
    return { ticketNo: c.ticketNo };
  }
}
