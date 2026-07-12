import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  Req,
  Res,
  UseGuards,
  Logger,
  RawBodyRequest,
  OnModuleDestroy,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WhatsAppService, WhatsAppPermanentError } from './whatsapp.service';
import { WaFlowService } from './wa-flow.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { SettingsService } from '../settings/settings.service';
import {
  SendTextMessageDto,
  SendTemplateMessageDto,
  SendInteractiveButtonDto,
  SendInteractiveListDto,
  SendMediaMessageDto,
  UpdateContactNameDto,
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
    private readonly waFlowService: WaFlowService,
    private readonly chatbotService: ChatbotService,
    private readonly settingsService: SettingsService,
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
    const asFlat = body as FlatWebhookPayload;
    const asCloud = body as WebhookPayload;
    const inboundMessageCount =
      asFlat.messages?.length ??
      asCloud.entry?.flatMap((entry) => entry.changes || [])
        .flatMap((change) => change.value?.messages || []).length ??
      0;
    const statusUpdateCount =
      asFlat.statuses?.length ??
      asCloud.entry?.flatMap((entry) => entry.changes || [])
        .flatMap((change) => change.value?.statuses || []).length ??
      0;

    this.logger.log(`Webhook received with ${inboundMessageCount} inbound message(s), ${statusUpdateCount} status update(s)`);

    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = req.rawBody?.toString() ?? '';
    const shouldBypassSignatureValidation =
      this.whatsappService.shouldBypassSignatureValidation();

    if (shouldBypassSignatureValidation) {
      this.logger.warn(
        'Bypassing webhook signature validation for 360dialog sandbox in non-production mode',
      );
    } else {
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
    }

    res.status(200).send('OK');

    try {
      const messages = await this.whatsappService.processWebhook(body);

      const chatbotEnabled = await this.settingsService.getChatbotEnabled();
      if (!chatbotEnabled) {
        this.logger.log('Chatbot is disabled — skipping automated responses');
        return;
      }

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

  /**
   * WhatsApp Flows data-exchange endpoint — called by Meta's servers (not users).
   * No JWT auth: authenticated via RSA/AES encryption of the payload itself.
   */
  @Public()
  @Post('flow')
  @HttpCode(200)
  async handleFlowRequest(
    @Body() body: { encrypted_flow_data: string; encrypted_aes_key: string; initial_vector: string },
    @Res() res: Response,
  ): Promise<void> {
    try {
      const encrypted = await this.waFlowService.handleRequest(body);
      (res as unknown as import('express').Response)
        .set('Content-Type', 'text/plain')
        .status(200)
        .send(encrypted);
    } catch (err) {
      this.logger.error('Flow endpoint error', err);
      (res as unknown as import('express').Response).status(421).send();
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
  ): Promise<{ messageId: string | null; error?: string }> {
    try {
      const messageId = await this.whatsappService.sendTemplateMessage(dto);
      return { messageId };
    } catch (error) {
      if (error instanceof WhatsAppPermanentError) {
        throw new BadRequestException(error.userMessage);
      }
      throw error;
    }
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
  ): Promise<{ messageId: string | null; error?: string }> {
    try {
      const messageId = await this.whatsappService.sendMediaMessage(dto);
      return { messageId };
    } catch (error) {
      if (error instanceof WhatsAppPermanentError) {
        throw new BadRequestException(error.userMessage);
      }
      throw error;
    }
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

  @Get('templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async getTemplate(@Query('name') name: string): Promise<Record<string, any> | null> {
    if (!name?.trim()) return null;
    return this.whatsappService.fetchTemplate(name.trim());
  }

  @Get('conversations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async listConversations(
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    const parsed = limit ? parseInt(limit, 10) : 50;
    const safeLimit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50;
    return this.whatsappService.listConversations(safeLimit);
  }

  @Patch('contacts/:phone')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'superadmin')
  async updateContactName(
    @Param('phone') phone: string,
    @Body() dto: UpdateContactNameDto,
  ): Promise<{ phone: string; name: string }> {
    return this.whatsappService.setContactName(phone, dto.name);
  }
}
