import { Controller, Post, Get, Body, Param, Headers, HttpCode, UseGuards, Req, RawBodyRequest, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentOrderDto, VerifyPaymentDto, InitiateRefundDto } from './dto/payment.dto';
import {
  WhatsAppCheckoutPrepareDto,
  WhatsAppCheckoutVerifyDto,
} from './dto/whatsapp-pay.dto';

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
  async verifyPayment(
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.verifyPayment(dto, user.sub);
  }

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: object,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? '';
    return this.paymentsService.handleWebhook({ body, rawBody: raw, signature });
  }

  /** Public: open Razorpay checkout from WhatsApp pay link (token proves user + order). */
  @Public()
  @Post('whatsapp-checkout')
  @HttpCode(200)
  async prepareWhatsAppCheckout(@Body() dto: WhatsAppCheckoutPrepareDto) {
    return this.paymentsService.prepareWhatsAppCheckout(dto.orderId, dto.token);
  }

  @Public()
  @Post('whatsapp-verify')
  @HttpCode(200)
  async verifyWhatsAppCheckout(@Body() dto: WhatsAppCheckoutVerifyDto) {
    await this.paymentsService.verifyWhatsAppCheckoutPayment(dto);
    return { ok: true };
  }

  /** Resolves a short pay-link code to {orderId, token}. Used by the /p/[code] frontend page. */
  @Public()
  @Get('p/:code')
  async resolveShortPayLink(@Param('code') code: string) {
    const result = await this.paymentsService.resolveShortPayLink(code);
    if (!result) throw new NotFoundException('Payment link not found or expired');
    return result;
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
