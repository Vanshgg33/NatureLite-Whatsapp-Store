import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { MessageLogDocument } from './schemas/message-log.schema';
import { MessageLogRepository } from './repositories/message-log.repository';
import {
  SendTextMessageDto,
  SendTemplateMessageDto,
  SendInteractiveButtonDto,
  SendInteractiveListDto,
  SendMediaMessageDto,
  WebhookPayload,
  WhatsAppMessage,
} from './dto/whatsapp.dto';
import { WhatsAppConfig } from '../../config/configuration';

interface WhatsAppApiResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: WhatsAppConfig;

  constructor(
    private readonly messageLogRepository: MessageLogRepository,
    private configService: ConfigService,
  ) {
    this.config = this.configService.get<WhatsAppConfig>('whatsapp')!;

    this.httpClient = axios.create({
      baseURL: `${this.config.apiUrl}/${this.config.phoneNumberId}`,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }
    this.logger.warn('Webhook verification failed');
    return null;
  }

  verifySignature(payload: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.config.appSecret)
      .update(payload)
      .digest('hex');

    return `sha256=${expectedSignature}` === signature;
  }

  async processWebhook(payload: WebhookPayload): Promise<WhatsAppMessage[]> {
    const messages: WhatsAppMessage[] = [];

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;

        if (value.statuses) {
          for (const status of value.statuses) {
            await this.updateMessageStatus(status.id, status.status, status.timestamp);
          }
        }

        if (value.messages) {
          for (const msg of value.messages) {
            const contactName = value.contacts?.[0]?.profile?.name;

            const whatsappMessage = this.parseInboundMessage(msg, contactName);
            if (whatsappMessage) {
              await this.logMessage(whatsappMessage, 'inbound');
              messages.push(whatsappMessage);
            }
          }
        }
      }
    }

    return messages;
  }

  private parseInboundMessage(
    msg: NonNullable<WebhookPayload['entry'][0]['changes'][0]['value']['messages']>[0],
    contactName?: string,
  ): WhatsAppMessage | null {
    const baseMessage: WhatsAppMessage = {
      phone: msg.from,
      messageId: msg.id,
      timestamp: new Date(parseInt(msg.timestamp, 10) * 1000),
      type: msg.type,
      content: {},
      contactName,
    };

    switch (msg.type) {
      case 'text':
        baseMessage.content.text = msg.text?.body;
        break;

      case 'image':
      case 'video':
      case 'audio':
      case 'document':
        const media = msg[msg.type as 'image' | 'video' | 'audio' | 'document'];
        if (media) {
          baseMessage.content.mediaId = media.id;
          baseMessage.content.caption = 'caption' in media ? media.caption : undefined;
        }
        break;

      case 'location':
        if (msg.location) {
          baseMessage.content.location = {
            latitude: msg.location.latitude,
            longitude: msg.location.longitude,
            name: msg.location.name,
            address: msg.location.address,
          };
        }
        break;

      case 'interactive':
        if (msg.interactive?.type === 'button_reply' && msg.interactive.button_reply) {
          baseMessage.content.buttonId = msg.interactive.button_reply.id;
          baseMessage.content.buttonText = msg.interactive.button_reply.title;
        } else if (msg.interactive?.type === 'list_reply' && msg.interactive.list_reply) {
          baseMessage.content.listId = msg.interactive.list_reply.id;
          baseMessage.content.listTitle = msg.interactive.list_reply.title;
        }
        break;

      case 'button':
        if (msg.button) {
          baseMessage.content.buttonId = msg.button.payload;
          baseMessage.content.buttonText = msg.button.text;
        }
        break;

      default:
        return null;
    }

    return baseMessage;
  }

  async sendTextMessage(dto: SendTextMessageDto): Promise<string | null> {
    try {
      const response = await this.httpClient.post<WhatsAppApiResponse>('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: dto.phone,
        type: 'text',
        text: {
          preview_url: !!dto.previewUrl,
          body: dto.message,
        },
      });

      const messageId = response.data.messages?.[0]?.id;

      if (messageId) {
        await this.logMessage(
          {
            phone: dto.phone,
            messageId,
            timestamp: new Date(),
            type: 'text',
            content: { text: dto.message },
          },
          'outbound',
        );
      }

      return messageId || null;
    } catch (error) {
      this.logger.error('Failed to send text message', error);
      return null;
    }
  }

  async sendTemplateMessage(dto: SendTemplateMessageDto): Promise<string | null> {
    try {
      const components: Array<Record<string, unknown>> = [];

      if (dto.headerParams && dto.headerParams.length > 0) {
        components.push({
          type: 'header',
          parameters: dto.headerParams.map((text) => ({ type: 'text', text })),
        });
      }

      if (dto.bodyParams && dto.bodyParams.length > 0) {
        components.push({
          type: 'body',
          parameters: dto.bodyParams.map((text) => ({ type: 'text', text })),
        });
      }

      if (dto.buttonParams && dto.buttonParams.length > 0) {
        dto.buttonParams.forEach((param, index) => {
          components.push({
            type: 'button',
            sub_type: 'quick_reply',
            index,
            parameters: [{ type: 'payload', payload: param }],
          });
        });
      }

      const response = await this.httpClient.post<WhatsAppApiResponse>('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: dto.phone,
        type: 'template',
        template: {
          name: dto.templateName,
          language: { code: dto.languageCode || 'en' },
          components: components.length > 0 ? components : undefined,
        },
      });

      const messageId = response.data.messages?.[0]?.id;

      if (messageId) {
        await this.logMessage(
          {
            phone: dto.phone,
            messageId,
            timestamp: new Date(),
            type: 'template',
            content: {
              templateName: dto.templateName,
              templateParams: dto.bodyParams,
            },
          },
          'outbound',
        );
      }

      return messageId || null;
    } catch (error) {
      this.logger.error('Failed to send template message', error);
      return null;
    }
  }

  async sendInteractiveButtons(dto: SendInteractiveButtonDto): Promise<string | null> {
    try {
      const buttons = dto.buttons.slice(0, 3).map((btn) => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.title.slice(0, 20) },
      }));

      const response = await this.httpClient.post<WhatsAppApiResponse>('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: dto.phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          header: dto.headerText ? { type: 'text', text: dto.headerText } : undefined,
          body: { text: dto.bodyText },
          footer: dto.footerText ? { text: dto.footerText } : undefined,
          action: { buttons },
        },
      });

      const messageId = response.data.messages?.[0]?.id;

      if (messageId) {
        await this.logMessage(
          {
            phone: dto.phone,
            messageId,
            timestamp: new Date(),
            type: 'interactive',
            content: { text: dto.bodyText },
          },
          'outbound',
        );
      }

      return messageId || null;
    } catch (error) {
      this.logger.error('Failed to send interactive buttons', error);
      return null;
    }
  }

  async sendInteractiveList(dto: SendInteractiveListDto): Promise<string | null> {
    try {
      const sections = dto.sections.map((section) => ({
        title: section.title,
        rows: section.rows.slice(0, 10).map((row) => ({
          id: row.id,
          title: row.title.slice(0, 24),
          description: row.description?.slice(0, 72),
        })),
      }));

      const response = await this.httpClient.post<WhatsAppApiResponse>('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: dto.phone,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: dto.headerText ? { type: 'text', text: dto.headerText } : undefined,
          body: { text: dto.bodyText },
          footer: dto.footerText ? { text: dto.footerText } : undefined,
          action: {
            button: dto.buttonText.slice(0, 20),
            sections,
          },
        },
      });

      const messageId = response.data.messages?.[0]?.id;

      if (messageId) {
        await this.logMessage(
          {
            phone: dto.phone,
            messageId,
            timestamp: new Date(),
            type: 'interactive',
            content: { text: dto.bodyText },
          },
          'outbound',
        );
      }

      return messageId || null;
    } catch (error) {
      this.logger.error('Failed to send interactive list', error);
      return null;
    }
  }

  async sendMediaMessage(dto: SendMediaMessageDto): Promise<string | null> {
    try {
      const mediaObject: Record<string, unknown> = {
        link: dto.mediaUrl,
      };

      if (dto.caption) {
        mediaObject.caption = dto.caption;
      }

      if (dto.filename && dto.mediaType === 'document') {
        mediaObject.filename = dto.filename;
      }

      const response = await this.httpClient.post<WhatsAppApiResponse>('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: dto.phone,
        type: dto.mediaType,
        [dto.mediaType]: mediaObject,
      });

      const messageId = response.data.messages?.[0]?.id;

      if (messageId) {
        await this.logMessage(
          {
            phone: dto.phone,
            messageId,
            timestamp: new Date(),
            type: dto.mediaType,
            content: { mediaUrl: dto.mediaUrl, caption: dto.caption },
          },
          'outbound',
        );
      }

      return messageId || null;
    } catch (error) {
      this.logger.error('Failed to send media message', error);
      return null;
    }
  }

  async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const response = await this.httpClient.get<{ url: string }>(`/${mediaId}`);
      return response.data.url;
    } catch (error) {
      this.logger.error('Failed to get media URL', error);
      return null;
    }
  }

  private async logMessage(
    message: WhatsAppMessage,
    direction: 'inbound' | 'outbound',
  ): Promise<void> {
    try {
      await this.messageLogRepository.create({
        phone: message.phone,
        direction,
        messageType: message.type,
        whatsappMessageId: message.messageId,
        content: message.content,
        status: direction === 'outbound' ? 'sent' : undefined,
      } as Partial<MessageLogDocument>);
    } catch (error) {
      this.logger.error('Failed to log message', error);
    }
  }

  private async updateMessageStatus(
    messageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    timestamp: string,
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = { status };

      if (status === 'delivered') {
        updateData.deliveredAt = new Date(parseInt(timestamp, 10) * 1000);
      } else if (status === 'read') {
        updateData.readAt = new Date(parseInt(timestamp, 10) * 1000);
      }

      await this.messageLogRepository.updateOneByWhatsAppMessageId(messageId, updateData);
    } catch (error) {
      this.logger.error('Failed to update message status', error);
    }
  }

  async getMessageLogs(
    phone: string,
    limit: number = 50,
  ): Promise<MessageLogDocument[]> {
    return this.messageLogRepository.findByPhone(phone, limit);
  }
}
