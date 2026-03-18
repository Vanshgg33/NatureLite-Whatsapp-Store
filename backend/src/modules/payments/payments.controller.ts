import { Controller, Post, Body, Param, Headers, UseGuards, Req } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentOrderDto, VerifyPaymentDto, InitiateRefundDto } from './dto/payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-order')
  async createOrder(
    @Body() dto: CreatePaymentOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.createOrder(dto.orderId, user.sub);
  }

  @Post('verify')
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(dto);
  }

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Body() body: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    return this.paymentsService.handleWebhook(body, signature);
  }

  @Post(':orderId/refund')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async initiateRefund(
    @Param('orderId') orderId: string,
    @Body() dto: InitiateRefundDto,
  ) {
    return this.paymentsService.initiateRefund(orderId, dto.amount, dto.reason);
  }
}
