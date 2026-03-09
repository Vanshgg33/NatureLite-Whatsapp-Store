import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
  RawBodyRequest,
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
} from './dto/whatsapp.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly chatbotService: ChatbotService,
  ) {}

  @Public()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const result = this.whatsappService.verifyWebhook(mode, token, challenge);

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
    @Body() body: WebhookPayload,
    @Res() res: Response,
  ): Promise<void> {
    const signature = req.headers['x-hub-signature-256'] as string;

    if (signature && req.rawBody) {
      const isValid = this.whatsappService.verifySignature(
        req.rawBody.toString(),
        signature,
      );

      if (!isValid) {
        this.logger.warn('Invalid webhook signature');
        res.status(401).send('Invalid signature');
        return;
      }
    }

    res.status(200).send('OK');

    try {
      const messages = await this.whatsappService.processWebhook(body);

      for (const message of messages) {
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
    @Query('phone') phone: string,
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    return this.whatsappService.getMessageLogs(
      phone,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
