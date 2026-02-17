import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ShiprocketService } from './shiprocket.service';
import { OrdersService } from '../orders/orders.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Public } from '@/common/decorators/public.decorator';

@Controller('shiprocket')
export class ShiprocketController {
  constructor(
    private readonly shiprocketService: ShiprocketService,
    private readonly ordersService: OrdersService,
  ) {}

  @Post('orders/:orderId/ship')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async createShipment(@Param('orderId') orderId: string): Promise<{ success: boolean; data?: unknown }> {
    const order = await this.ordersService.findById(orderId);
    const result = await this.shiprocketService.createShipment(order);

    return {
      success: !!result,
      data: result,
    };
  }

  @Post('shipments/:shipmentId/awb')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async generateAwb(
    @Param('shipmentId') shipmentId: string,
    @Body('courierId') courierId?: number,
  ): Promise<{ success: boolean; awb?: string }> {
    const awb = await this.shiprocketService.generateAwb(shipmentId, courierId);

    return {
      success: !!awb,
      awb: awb || undefined,
    };
  }

  @Public()
  @Post('webhook')
  async handleWebhook(@Body() payload: Record<string, unknown>): Promise<{ received: boolean }> {
    await this.shiprocketService.handleWebhook(payload as never);
    return { received: true };
  }

  @Post('shipments/:shipmentId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async cancelShipment(@Param('shipmentId') shipmentId: string): Promise<{ success: boolean }> {
    const success = await this.shiprocketService.cancelShipment(shipmentId);
    return { success };
  }
}
