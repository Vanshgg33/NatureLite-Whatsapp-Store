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
  FlatWebhookPayload,
  WhatsAppMessage,
} from './dto/whatsapp.dto';
import { WhatsAppConfig } from '../../config/configuration';
import { MessageLogMetadata, MessageFinalStatus } from './schemas/message-log.schema';

interface WhatsAppApiResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
}

interface WhatsAppApiErrorShape {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_data?: { details?: string };
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: WhatsAppConfig;
  private readonly nodeEnv: string;
  private readonly is360DialogProvider: boolean;
  private readonly is360DialogSandbox: boolean;
  private readonly outboundMaxAttempts = 3;

  constructor(
    private readonly messageLogRepository: MessageLogRepository,
    private configService: ConfigService,
  ) {
    this.nodeEnv = this.configService.get<string>('app.nodeEnv') || 'development';
    this.config = this.configService.get<WhatsAppConfig>('whatsapp')!;
    this.is360DialogSandbox = this.config.provider === '360dialog_sandbox';
    this.is360DialogProvider =
      this.config.provider === '360dialog' ||
      this.is360DialogSandbox;

    const normalizedApiUrl = this.config.apiUrl.replace(/\/$/, '');

    const baseURL = this.is360DialogProvider
      ? normalizedApiUrl
      : `${normalizedApiUrl}/${this.config.phoneNumberId}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.is360DialogProvider) {
      headers['D360-API-KEY'] = this.config.d360ApiKey;
    } else {
      headers.Authorization = `Bearer ${this.config.accessToken}`;
    }

    this.httpClient = axios.create({
      baseURL,
      headers,
    });

    this.logger.log(
      `WhatsApp provider initialized: ${this.config.provider}`,
    );
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const normalizeToken = (value?: string): string => {
      if (!value) return '';

      const trimmed = value.trim().replace(/^['\"]|['\"]$/g, '');
      const prefixedKey = 'WHATSAPP_WEBHOOK_VERIFY_TOKEN=';

      if (trimmed.startsWith(prefixedKey)) {
        return trimmed.slice(prefixedKey.length).trim();
      }

      return trimmed;
    };

    const expectedToken = normalizeToken(this.config.webhookVerifyToken);
    const incomingToken = normalizeToken(token);

    if (mode === 'subscribe' && incomingToken === expectedToken && expectedToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }
    this.logger.warn('Webhook verification failed');
    return null;
  }

  verifySignature(payload: string, signature: string): boolean {
    // Note: this verifies Meta Cloud API-style `x-hub-signature-256`.
    // If you're using a different provider, update controller header extraction
    // and this verification accordingly.
    if (this.is360DialogProvider) {
      // 360dialog webhook signing differs from Meta app-secret flow.
      // Require explicit verification for the configured provider instead of accepting all requests.
      this.logger.warn('Webhook signature verification not implemented for 360dialog provider');
      return false;
    }

    if (!this.config.appSecret) {
      this.logger.warn('WHATSAPP_APP_SECRET not configured; cannot verify webhook signature');
      return false;
    }

    const expected = crypto
      .createHmac('sha256', this.config.appSecret)
      .update(payload)
      .digest('hex');

    const expectedWithPrefix = `sha256=${expected}`;

    // Timing-safe compare (length must match).
    const a = Buffer.from(expectedWithPrefix, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  shouldBypassSignatureValidation(): boolean {
    return this.is360DialogSandbox && this.nodeEnv !== 'production';
  }

  async processWebhook(payload: WebhookPayload | FlatWebhookPayload): Promise<WhatsAppMessage[]> {
    const messages: WhatsAppMessage[] = [];

    const changes = this.extractWebhookChanges(payload);

    for (const change of changes) {
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
            // Atomic dedupe: insert-first. If duplicate key, skip processing.
            const messageId = whatsappMessage.messageId?.trim();
            if (messageId) {
              const inserted = await this.messageLogRepository.tryCreateInboundByWhatsAppMessageId({
                phone: whatsappMessage.phone,
                whatsappMessageId: messageId,
                messageType: whatsappMessage.type as MessageLogDocument['messageType'],
                content: whatsappMessage.content as MessageLogDocument['content'],
              });
              if (!inserted) {
                continue;
              }
            } else {
              await this.logMessage(whatsappMessage, 'inbound');
            }

            messages.push(whatsappMessage);
          }
        }
      }
    }

    return messages;
  }

  private extractWebhookChanges(
    payload: WebhookPayload | FlatWebhookPayload,
  ): Array<WebhookPayload['entry'][0]['changes'][0]> {
    const asCloudPayload = payload as WebhookPayload;
    if (Array.isArray(asCloudPayload.entry)) {
      return asCloudPayload.entry.flatMap((entry) => entry.changes || []);
    }

    const asFlatPayload = payload as FlatWebhookPayload;
    if (asFlatPayload.messages || asFlatPayload.statuses) {
      return [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '',
              phone_number_id: '',
            },
            contacts: asFlatPayload.contacts as Array<{ profile: { name: string }; wa_id: string }> | undefined,
            messages: asFlatPayload.messages,
            statuses: asFlatPayload.statuses,
          },
        },
      ];
    }

    return [];
  }

  private parseInboundMessage(
    msg: NonNullable<WebhookPayload['entry'][0]['changes'][0]['value']['messages']>[0],
    contactName?: string,
  ): WhatsAppMessage | null {
    if (!msg.from || !/^\d{8,20}$/.test(msg.from)) {
      return null;
    }

    const tsSeconds = Number.parseInt(msg.timestamp, 10);
    const timestamp =
      Number.isFinite(tsSeconds) && tsSeconds > 0 ? new Date(tsSeconds * 1000) : new Date();

    const baseMessage: WhatsAppMessage = {
      phone: msg.from,
      messageId: msg.id,
      timestamp,
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
    const phone = this.normalizePhone(dto.phone);
    const idempotencyKey = dto.meta?.idempotencyKey;
    const content: WhatsAppMessage['content'] = { text: dto.message };

    if (!phone) {
      await this.logFinalOutboundFailure({
        phone: dto.phone,
        messageType: 'text',
        content,
        idempotencyKey,
        failureReason: 'invalid_phone',
        metadata: { idempotencyKey, isInvalidPhone: true, provider: this.getProviderTag() },
      });
      return null;
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text' as const,
      text: {
        preview_url: Boolean(dto.previewUrl),
        body: dto.message,
      },
    };

    return this.sendOutboundWithRetry({
      phone,
      messageType: 'text',
      content,
      idempotencyKey,
      payload,
    });
  }

  async sendTemplateMessage(dto: SendTemplateMessageDto): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    const idempotencyKey = dto.meta?.idempotencyKey;
    const content: WhatsAppMessage['content'] = {
      templateName: dto.templateName,
      templateParams: dto.bodyParams,
    };

    if (!phone) {
      await this.logFinalOutboundFailure({
        phone: dto.phone,
        messageType: 'template',
        content,
        idempotencyKey,
        failureReason: 'invalid_phone',
        metadata: { idempotencyKey, isInvalidPhone: true, provider: this.getProviderTag() },
      });
      return null;
    }

    type TemplateComponentParam = { type: 'text'; text: string } | { type: 'payload'; payload: string };
    type TemplateComponent =
      | { type: 'header'; parameters: Array<{ type: 'text'; text: string }> }
      | { type: 'body'; parameters: Array<{ type: 'text'; text: string }> }
      | {
          type: 'button';
          sub_type: 'quick_reply';
          index: number;
          parameters: Array<Extract<TemplateComponentParam, { type: 'payload' }>>;
        };

    const components: TemplateComponent[] = [];

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

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template' as const,
      template: {
        name: dto.templateName,
        language: { code: dto.languageCode || 'en' },
        components: components.length > 0 ? components : undefined,
      },
    };

    return this.sendOutboundWithRetry({
      phone,
      messageType: 'template',
      content,
      idempotencyKey,
      payload,
    });
  }

  async sendInteractiveButtons(dto: SendInteractiveButtonDto): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    const idempotencyKey = dto.meta?.idempotencyKey;
    const content: WhatsAppMessage['content'] = { text: dto.bodyText };

    if (!phone) {
      await this.logFinalOutboundFailure({
        phone: dto.phone,
        messageType: 'interactive',
        content,
        idempotencyKey,
        failureReason: 'invalid_phone',
        metadata: { idempotencyKey, isInvalidPhone: true, provider: this.getProviderTag() },
      });
      return null;
    }

    const buttons = dto.buttons.slice(0, 3).map((btn) => ({
      type: 'reply' as const,
      reply: { id: btn.id, title: btn.title.slice(0, 20) },
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive' as const,
      interactive: {
        type: 'button' as const,
        header: dto.headerText ? { type: 'text' as const, text: dto.headerText } : undefined,
        body: { text: dto.bodyText },
        footer: dto.footerText ? { text: dto.footerText } : undefined,
        action: { buttons },
      },
    };

    const messageId = await this.sendOutboundWithRetry({
      phone,
      messageType: 'interactive',
      content,
      idempotencyKey,
      payload,
    });

    // Coexistence or account-specific policies can reject interactive payloads.
    // Fallback to plain text so conversations can continue (do not retry fallback here).
    if (!messageId) {
      const fallbackOptions = dto.buttons
        .slice(0, 3)
        .map((btn, idx) => `${idx + 1}. ${btn.title}`)
        .join('\n');
      const fallbackText = fallbackOptions
        ? `${dto.bodyText}\n\nReply with:\n${fallbackOptions}`
        : dto.bodyText;

      await this.sendTextMessage({
        phone,
        message: fallbackText,
        meta: idempotencyKey ? { idempotencyKey: `${idempotencyKey}:fallback_text` } : undefined,
      });
    }

    return messageId;
  }

  async sendInteractiveList(dto: SendInteractiveListDto): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    const idempotencyKey = dto.meta?.idempotencyKey;
    const content: WhatsAppMessage['content'] = { text: dto.bodyText };

    if (!phone) {
      await this.logFinalOutboundFailure({
        phone: dto.phone,
        messageType: 'interactive',
        content,
        idempotencyKey,
        failureReason: 'invalid_phone',
        metadata: { idempotencyKey, isInvalidPhone: true, provider: this.getProviderTag() },
      });
      return null;
    }

    const sections = dto.sections.map((section) => ({
      title: section.title,
      rows: section.rows.slice(0, 10).map((row) => ({
        id: row.id,
        title: row.title.slice(0, 24),
        description: row.description?.slice(0, 72),
      })),
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive' as const,
      interactive: {
        type: 'list' as const,
        header: dto.headerText ? { type: 'text' as const, text: dto.headerText } : undefined,
        body: { text: dto.bodyText },
        footer: dto.footerText ? { text: dto.footerText } : undefined,
        action: {
          button: dto.buttonText.slice(0, 20),
          sections,
        },
      },
    };

    return this.sendOutboundWithRetry({
      phone,
      messageType: 'interactive',
      content,
      idempotencyKey,
      payload,
    });
  }

  async sendMediaMessage(dto: SendMediaMessageDto): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    const idempotencyKey = dto.meta?.idempotencyKey;
    const content: WhatsAppMessage['content'] = { mediaUrl: dto.mediaUrl, caption: dto.caption };

    if (!phone) {
      await this.logFinalOutboundFailure({
        phone: dto.phone,
        messageType: dto.mediaType,
        content,
        idempotencyKey,
        failureReason: 'invalid_phone',
        metadata: { idempotencyKey, isInvalidPhone: true, provider: this.getProviderTag() },
      });
      return null;
    }

    const payloadBase = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: dto.mediaType,
    } as const;

    if (dto.mediaType === 'document') {
      const payload = {
        ...payloadBase,
        document: {
          link: dto.mediaUrl,
          caption: dto.caption,
          filename: dto.filename,
        },
      };
      return this.sendOutboundWithRetry({
        phone,
        messageType: 'document',
        content,
        idempotencyKey,
        payload,
      });
    }

    if (dto.mediaType === 'image') {
      const payload = {
        ...payloadBase,
        image: {
          link: dto.mediaUrl,
          caption: dto.caption,
        },
      };
      return this.sendOutboundWithRetry({
        phone,
        messageType: 'image',
        content,
        idempotencyKey,
        payload,
      });
    }

    if (dto.mediaType === 'video') {
      const payload = {
        ...payloadBase,
        video: {
          link: dto.mediaUrl,
          caption: dto.caption,
        },
      };
      return this.sendOutboundWithRetry({
        phone,
        messageType: 'video',
        content,
        idempotencyKey,
        payload,
      });
    }

    // audio
    const payload = {
      ...payloadBase,
      audio: { link: dto.mediaUrl },
    };
    return this.sendOutboundWithRetry({
      phone,
      messageType: 'audio',
      content,
      idempotencyKey,
      payload,
    });
  }

  async getMediaUrl(mediaId: string): Promise<string | null> {
    if (this.is360DialogSandbox) {
      this.logger.warn('Media retrieval is not available in 360dialog sandbox mode');
      return null;
    }

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
      const ts = Number.parseInt(timestamp, 10);
      const eventAt = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : undefined;

      await this.messageLogRepository.updateStatusMonotonicByWhatsAppMessageId({
        whatsappMessageId: messageId,
        status,
        eventAt,
      });
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

  private normalizePhone(input: string): string | null {
    const digits = (input || '').replace(/[^\d]/g, '');
    if (!/^\d{8,20}$/.test(digits)) return null;
    return digits;
  }

  private getProviderTag(): MessageLogMetadata['provider'] {
    if (this.is360DialogSandbox) return '360dialog_sandbox';
    if (this.is360DialogProvider) return '360dialog';
    return 'meta_cloud';
  }

  private async sendOutboundWithRetry(input: {
    phone: string;
    messageType: MessageLogDocument['messageType'];
    content: WhatsAppMessage['content'];
    idempotencyKey?: string;
    payload: object;
  }): Promise<string | null> {
    const baseMetadata: MessageLogMetadata = {
      idempotencyKey: input.idempotencyKey,
      provider: this.getProviderTag(),
    };

    if (input.idempotencyKey) {
      const existing = await this.messageLogRepository.findOneByIdempotencyKey(input.idempotencyKey);
      if (existing?.finalStatus === 'success') {
        return existing.whatsappMessageId ?? null;
      }
    }

    let attempt = 0;
    let lastFailureReason: string | undefined;
    let lastMetadata: MessageLogMetadata = baseMetadata;

    while (attempt < this.outboundMaxAttempts) {
      attempt += 1;
      const now = new Date();

      try {
        const response = await this.httpClient.post<WhatsAppApiResponse>('/messages', input.payload);
        const messageId = response.data.messages?.[0]?.id ?? null;

        if (messageId) {
          await this.messageLogRepository.upsertOutboundByIdempotencyKey({
            phone: input.phone,
            messageType: input.messageType,
            content: input.content,
            status: 'sent',
            finalStatus: 'success',
            retryCount: attempt - 1,
            lastAttemptAt: now,
            whatsappMessageId: messageId,
            metadata: lastMetadata,
          });

          return messageId;
        }

        lastFailureReason = 'no_message_id';
        await this.messageLogRepository.upsertOutboundByIdempotencyKey({
          phone: input.phone,
          messageType: input.messageType,
          content: input.content,
          status: 'failed',
          finalStatus: attempt >= this.outboundMaxAttempts ? 'failure' : undefined,
          failureReason: lastFailureReason,
          retryCount: attempt,
          lastAttemptAt: now,
          metadata: lastMetadata,
        });
      } catch (error) {
        const interpreted = this.interpretProviderError(error);
        lastFailureReason = interpreted.failureReason;
        lastMetadata = { ...baseMetadata, ...interpreted.metadata };

        const shouldRetry = interpreted.shouldRetry && attempt < this.outboundMaxAttempts;

        await this.messageLogRepository.upsertOutboundByIdempotencyKey({
          phone: input.phone,
          messageType: input.messageType,
          content: input.content,
          status: 'failed',
          finalStatus: shouldRetry ? undefined : 'failure',
          failureReason: lastFailureReason,
          retryCount: attempt,
          lastAttemptAt: now,
          metadata: lastMetadata,
        });

        if (!shouldRetry) {
          this.logger.warn('whatsapp_send_failed_permanent', {
            phone: input.phone,
            messageType: input.messageType,
            failureReason: lastFailureReason,
            attempt,
          });
          break;
        }

        const baseDelayMs = attempt === 1 ? 600 : 1800;
        const jitterMs = Math.floor(Math.random() * 301); // 0–300ms
        const delayMs = baseDelayMs + jitterMs;
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    await this.logFinalOutboundFailure({
      phone: input.phone,
      messageType: input.messageType,
      content: input.content,
      idempotencyKey: input.idempotencyKey,
      failureReason: lastFailureReason ?? 'failed',
      metadata: lastMetadata,
    });

    return null;
  }

  private interpretProviderError(error: object): {
    shouldRetry: boolean;
    failureReason: string;
    metadata: Omit<MessageLogMetadata, 'idempotencyKey' | 'provider'>;
  } {
    if (axios.isAxiosError<WhatsAppApiErrorShape>(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const code = data?.error?.code;
      const title = data?.error?.message;
      const details = data?.error?.error_data?.details;

      const isClientError = typeof status === 'number' && status >= 400 && status < 500;

      // Heuristics: invalid recipient / blocked user are permanent failures.
      const combined = `${title || ''} ${details || ''}`.toLowerCase();
      const isBlocked =
        combined.includes('blocked') ||
        combined.includes('user has blocked') ||
        combined.includes('recipient blocked');
      const isInvalidPhone =
        combined.includes('invalid parameter') ||
        combined.includes('phone number') && combined.includes('invalid') ||
        combined.includes('recipient') && combined.includes('valid') ||
        combined.includes('not a valid whatsapp user');

      const permanent = isClientError && (isBlocked || isInvalidPhone);
      const shouldRetry = !permanent;

      return {
        shouldRetry,
        failureReason: permanent ? (isBlocked ? 'blocked_by_user' : 'invalid_phone') : 'provider_error',
        metadata: {
          errorCode: typeof code === 'number' ? String(code) : undefined,
          errorTitle: title,
          errorDetails: details,
          isBlocked: isBlocked || undefined,
          isInvalidPhone: isInvalidPhone || undefined,
        },
      };
    }

    return {
      shouldRetry: true,
      failureReason: 'unknown_error',
      metadata: {},
    };
  }

  private async logFinalOutboundFailure(input: {
    phone: string;
    messageType: MessageLogDocument['messageType'];
    content: WhatsAppMessage['content'];
    idempotencyKey?: string;
    failureReason: string;
    metadata: MessageLogMetadata;
  }): Promise<void> {
    // Ensure there is at least one durable row for investigation.
    await this.messageLogRepository.upsertOutboundByIdempotencyKey({
      phone: input.phone,
      messageType: input.messageType,
      content: input.content,
      status: 'failed',
      finalStatus: 'failure' satisfies MessageFinalStatus,
      failureReason: input.failureReason,
      retryCount: this.outboundMaxAttempts,
      lastAttemptAt: new Date(),
      metadata: input.metadata,
    });
  }
}
