import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Req,
  Res,
  UseGuards,
  Logger,
  RawBodyRequest,
  OnModuleDestroy,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import {
  SendTextMessageDto,
  SendTemplateMessageDto,
  SendInteractiveButtonDto,
  SendInteractiveListDto,
  SendMediaMessageDto,
  WebhookPayload,
  FlatWebhookPayload,
} from './dto/whatsapp.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

/** Per-phone sliding-window rate limiter (in-memory, no external deps). */
class PhoneRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  constructor(
    private readonly maxMessages: number,
    private readonly windowMs: number,
  ) {}

  isAllowed(phone: string): boolean {
    const now = Date.now();
    let timestamps = this.buckets.get(phone);
    if (!timestamps) {
      timestamps = [];
      this.buckets.set(phone, timestamps);
    }
    // Evict expired entries.
    while (timestamps.length > 0 && timestamps[0] <= now - this.windowMs) {
      timestamps.shift();
    }
    if (timestamps.length >= this.maxMessages) {
      return false;
    }
    timestamps.push(now);
    return true;
  }

  /** Periodic cleanup of stale buckets to prevent memory leaks. */
  cleanup(): void {
    const now = Date.now();
    for (const [phone, timestamps] of this.buckets) {
      while (timestamps.length > 0 && timestamps[0] <= now - this.windowMs) {
        timestamps.shift();
      }
      if (timestamps.length === 0) {
        this.buckets.delete(phone);
      }
    }
  }
}

@Controller('whatsapp')
export class WhatsAppController implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppController.name);
  /** 10 messages per phone per 60 seconds. */
  private readonly rateLimiter = new PhoneRateLimiter(10, 60_000);
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly chatbotService: ChatbotService,
  ) {
    // Clean up stale rate-limit buckets every 5 minutes.
    this.cleanupInterval = setInterval(() => this.rateLimiter.cleanup(), 5 * 60_000);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  @Public()
  @Get('webhook')
  verifyWebhook(
    @Req() req: Request,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const rawQuery = req.originalUrl.split('?')[1] || '';
    const params = new URLSearchParams(rawQuery);

    const normalizedMode = mode || params.get('hub.mode') || params.get('hub_mode') || '';
    const normalizedToken =
      token || params.get('hub.verify_token') || params.get('hub_verify_token') || '';
    const normalizedChallenge =
      challenge || params.get('hub.challenge') || params.get('hub_challenge') || '';

    const result = this.whatsappService.verifyWebhook(
      normalizedMode,
      normalizedToken,
      normalizedChallenge,
    );

    if (result) {
      res.status(200).send(result);
    } else {
      res.status(403).send('Verification failed');
    }
  }

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: WebhookPayload | FlatWebhookPayload,
    @Res() res: Response,
  ): Promise<void> {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = req.rawBody?.toString() ?? '';

    // Webhook authenticity must be enforced (signature is required).
    if (!signature || !rawBody) {
      this.logger.warn('Missing webhook signature or raw body');
      res.status(401).send('Missing signature');
      return;
    }

    const isValid = this.whatsappService.verifySignature(rawBody, signature);

    if (!isValid) {
      this.logger.warn('Invalid webhook signature');
      res.status(401).send('Invalid signature');
      return;
    }

    res.status(200).send('OK');

    try {
      const messages = await this.whatsappService.processWebhook(body);

      for (const message of messages) {
        if (!this.rateLimiter.isAllowed(message.phone)) {
          this.logger.warn(`Rate limit exceeded for phone ***${message.phone.slice(-4)}, dropping message`);
          continue;
        }
        await this.chatbotService.handleMessage(message);
      }
    } catch (error) {
      this.logger.error('Error processing webhook', error);
    }
  }

  @Post('send/text')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendTextMessage(
    @Body() dto: SendTextMessageDto,
  ): Promise<{ messageId: string | null }> {
    const messageId = await this.whatsappService.sendTextMessage(dto);
    return { messageId };
  }

  @Post('send/template')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendTemplateMessage(
    @Body() dto: SendTemplateMessageDto,
  ): Promise<{ messageId: string | null }> {
    const messageId = await this.whatsappService.sendTemplateMessage(dto);
    return { messageId };
  }

  @Post('send/buttons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendInteractiveButtons(
    @Body() dto: SendInteractiveButtonDto,
  ): Promise<{ messageId: string | null }> {
    const messageId = await this.whatsappService.sendInteractiveButtons(dto);
    return { messageId };
  }

  @Post('send/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendInteractiveList(
    @Body() dto: SendInteractiveListDto,
  ): Promise<{ messageId: string | null }> {
    const messageId = await this.whatsappService.sendInteractiveList(dto);
    return { messageId };
  }

  @Post('send/media')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async sendMediaMessage(
    @Body() dto: SendMediaMessageDto,
  ): Promise<{ messageId: string | null }> {
    const messageId = await this.whatsappService.sendMediaMessage(dto);
    return { messageId };
  }

  @Get('messages/:phone')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async getMessageLogs(
    @Param('phone') phone: string,
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    return this.whatsappService.getMessageLogs(
      phone,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
