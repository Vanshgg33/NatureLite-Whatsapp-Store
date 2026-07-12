import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { MessageLogDocument } from './schemas/message-log.schema';
import { MessageLogRepository } from './repositories/message-log.repository';
import { UsersService } from '../users/users.service';
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

export class WhatsAppPermanentError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly errorCode?: string,
  ) {
    super(userMessage);
    this.name = 'WhatsAppPermanentError';
  }
}

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

const versionedApiPathPattern = /\/v\d+(?:\/|$)/;

@Injectable()
export class WhatsAppService implements OnModuleInit {
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
    private readonly usersService: UsersService,
  ) {
    this.nodeEnv = this.configService.get<string>('app.nodeEnv') || 'development';
    this.config = this.configService.get<WhatsAppConfig>('whatsapp')!;
    this.is360DialogSandbox = this.config.provider === '360dialog_sandbox';
    this.is360DialogProvider =
      this.config.provider === '360dialog' ||
      this.is360DialogSandbox;

    const normalizedApiUrl = this.config.apiUrl.replace(/\/$/, '');
    const effectiveApiUrl =
      this.is360DialogSandbox && !versionedApiPathPattern.test(normalizedApiUrl)
        ? `${normalizedApiUrl}/v1`
        : normalizedApiUrl;

    const baseURL = this.is360DialogProvider
      ? effectiveApiUrl
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
    this.logger.log(`WhatsApp API base URL: ${baseURL}`);
  }

  async onModuleInit(): Promise<void> {
    if (!this.is360DialogSandbox) {
      return;
    }

    const webhookUrl = this.config.webhookUrl.trim();
    if (!webhookUrl) {
      this.logger.warn('WHATSAPP_WEBHOOK_URL is not configured; skipping 360dialog sandbox webhook registration');
      return;
    }

    // Validate webhook URL format
    try {
      new URL(webhookUrl);
    } catch {
      this.logger.error(
        `Invalid WHATSAPP_WEBHOOK_URL format: ${webhookUrl}. Must be a valid absolute URL.`,
      );
      return;
    }

    // Attempt registration with retry logic
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(
          `Attempting to register 360dialog sandbox webhook (attempt ${attempt}/${maxAttempts}) at ${webhookUrl}`,
        );

        const response = await this.httpClient.post(
          '/configs/webhook',
          { url: webhookUrl },
          { timeout: 10000 }, // 10 second timeout
        );

        this.logger.log(
          `✓ 360dialog sandbox webhook registered successfully: ${response.data?.url || webhookUrl}`,
        );
        return; // Success, exit immediately
      } catch (error) {
        lastError = error as Error;

        if (axios.isAxiosError(error)) {
          const status = error.response?.status ?? 'unknown';
          const errorData = error.response?.data;
          const errorMessage = typeof errorData === 'object' && 'error' in errorData 
            ? JSON.stringify(errorData) 
            : String(errorData);

          this.logger.warn(
            `Webhook registration attempt ${attempt}/${maxAttempts} failed with status ${status}: ${errorMessage}`,
          );

          // If 4xx (client error), likely a configuration issue - don't retry
          if (error.response && error.response.status >= 400 && error.response.status < 500) {
            this.logger.error(
              `Client error (${status}) registering webhook - likely configuration issue. Webhook URL: ${webhookUrl}`,
            );
            return;
          }
        } else {
          this.logger.warn(
            `Webhook registration attempt ${attempt}/${maxAttempts} failed with error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxAttempts) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Cap at 5s
          this.logger.log(`Retrying webhook registration in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retry attempts failed
    this.logger.warn(
      `Failed to register 360dialog sandbox webhook after ${maxAttempts} attempts. ` +
      `Service will continue - webhook may have been manually registered or will be registered on next startup. ` +
      `Last error: ${lastError?.message || 'unknown'}`,
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
      // 360dialog webhook signing: attempt to verify using appSecret if configured.
      // If appSecret is not configured, bypass verification (webhook URL is already authenticated
      // via D360-API-KEY header used during registration).
      if (!this.config.appSecret) {
        this.logger.warn(
          'WHATSAPP_APP_SECRET not configured for 360dialog provider; bypassing webhook signature verification ' +
          '(webhook authenticity is ensured via D360-API-KEY during registration)',
        );
        return true; // Allow webhooks to proceed (D360 API Key authentication is sufficient)
      }

      // If appSecret is configured, verify using the same mechanism as Meta Cloud API
      const expected = crypto
        .createHmac('sha256', this.config.appSecret)
        .update(payload)
        .digest('hex');

      const expectedWithPrefix = `sha256=${expected}`;

      const a = Buffer.from(expectedWithPrefix, 'utf8');
      const b = Buffer.from(signature, 'utf8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
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

            if (whatsappMessage.contactName?.trim()) {
              const existing = await this.usersService.findByPhone(whatsappMessage.phone);
              if (!existing?.name) {
                await this.usersService.setNameByPhone(
                  whatsappMessage.phone,
                  whatsappMessage.contactName.trim(),
                );
              }
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
        } else {
          const interactive = msg.interactive as Record<string, any> | undefined;
          const productReply = interactive?.product || interactive?.product_reply;
          const productListReply = interactive?.product_list_reply;
          const productItems = productListReply?.product_items || interactive?.product_items || [];

          const productRetailerId =
            productReply?.product_retailer_id ||
            productReply?.productRetailerId ||
            productItems?.[0]?.product_retailer_id;

          if (productRetailerId) {
            baseMessage.content.productRetailerId = productRetailerId;
          }

          if (Array.isArray(productItems) && productItems.length > 0) {
            baseMessage.content.productItems = productItems
              .map((item: any) => ({
                productRetailerId: item.product_retailer_id,
                quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
                itemPrice: this.parseCatalogItemPrice(item.item_price),
                currency: typeof item.currency === 'string' ? item.currency : undefined,
              }))
              .filter((item) => Boolean(item.productRetailerId));
          }
        }
        break;

      case 'order': {
        const order = msg.order as Record<string, any> | undefined;
        const productItems = order?.product_items;
        if (Array.isArray(productItems) && productItems.length > 0) {
          baseMessage.content.productItems = productItems
            .map((item: any) => ({
              productRetailerId: item.product_retailer_id,
              quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
              itemPrice: this.parseCatalogItemPrice(item.item_price),
              currency: typeof item.currency === 'string' ? item.currency : undefined,
            }))
            .filter((item) => Boolean(item.productRetailerId));
          baseMessage.content.productRetailerId = baseMessage.content.productItems[0]?.productRetailerId;
        }
        break;
      }

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

  async sendSingleProductMessage(dto: {
    phone: string;
    catalogId: string;
    productRetailerId: string;
    bodyText?: string;
    footerText?: string;
    meta?: { idempotencyKey?: string };
  }): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    if (!phone) return null;

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'product',
        body: dto.bodyText ? { text: dto.bodyText } : undefined,
        footer: dto.footerText ? { text: dto.footerText } : undefined,
        action: {
          catalog_id: dto.catalogId,
          product_retailer_id: dto.productRetailerId,
        },
      },
    };

    return this.sendOutboundWithRetry({
      phone,
      messageType: 'interactive',
      content: { text: dto.bodyText || '' },
      idempotencyKey: dto.meta?.idempotencyKey,
      payload,
    });
  }

  async sendCatalogMessage(dto: {
    phone: string;
    bodyText: string;
    footerText?: string;
    thumbnailProductRetailerId?: string;
    meta?: { idempotencyKey?: string };
  }): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    if (!phone) return null;

    const action: Record<string, unknown> = {
      name: 'catalog_message',
    };
    if (dto.thumbnailProductRetailerId) {
      action.parameters = {
        thumbnail_product_retailer_id: dto.thumbnailProductRetailerId,
      };
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'catalog_message',
        body: { text: dto.bodyText },
        footer: dto.footerText ? { text: dto.footerText } : undefined,
        action,
      },
    };

    return this.sendOutboundWithRetry({
      phone,
      messageType: 'interactive',
      content: { text: dto.bodyText },
      idempotencyKey: dto.meta?.idempotencyKey,
      payload,
    });
  }

  async sendProductListMessage(dto: {
    phone: string;
    catalogId: string;
    bodyText: string;
    headerText?: string;
    footerText?: string;
    sections: Array<{ title: string; productRetailerIds: string[] }>;
    meta?: { idempotencyKey?: string };
  }): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    if (!phone) return null;

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        body: { text: dto.bodyText },
        header: dto.headerText ? { type: 'text', text: dto.headerText } : undefined,
        footer: dto.footerText ? { text: dto.footerText } : undefined,
        action: {
          catalog_id: dto.catalogId,
          sections: dto.sections.map((section) => ({
            title: section.title,
            product_items: section.productRetailerIds.map((productRetailerId) => ({ product_retailer_id: productRetailerId })),
          })),
        },
      },
    };

    return this.sendOutboundWithRetry({
      phone,
      messageType: 'interactive',
      content: { text: dto.bodyText },
      idempotencyKey: dto.meta?.idempotencyKey,
      payload,
    });
  }

  async sendCatalogLinkMessage(dto: {
    phone: string;
    catalogUrl: string;
    bodyText: string;
    buttonLabel?: string;
    meta?: { idempotencyKey?: string };
  }): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    if (!phone) return null;

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: dto.bodyText },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: dto.buttonLabel ?? 'View Catalogue',
            url: dto.catalogUrl,
          },
        },
      },
    };

    return this.sendOutboundWithRetry({
      phone,
      messageType: 'interactive',
      content: { text: dto.bodyText },
      idempotencyKey: dto.meta?.idempotencyKey,
      payload,
    });
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

    if (dto.headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: dto.headerImageUrl } }],
      } as any);
    } else if (dto.headerParams && dto.headerParams.length > 0) {
      components.push({
        type: 'header',
        parameters: dto.headerParams.map((text) => ({ type: 'text', text })),
      });
    }

    if (dto.bodyParams && dto.bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: dto.bodyParams.map((text, idx) => {
          const paramName = dto.bodyParamNames?.[idx];
          return paramName
            ? { type: 'text' as const, text, parameter_name: paramName }
            : { type: 'text' as const, text };
        }),
      } as any);
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

    if (dto.urlButtonParams && dto.urlButtonParams.length > 0) {
      dto.urlButtonParams.forEach((param, index) => {
        components.push({
          type: 'button',
          sub_type: 'url',
          index,
          parameters: [{ type: 'text', text: param }],
        } as any);
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

    this.logger.debug(`sendTemplateMessage payload=${JSON.stringify(payload.template)}`);

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

    // WhatsApp rejects interactive messages with empty/whitespace body text
    // (error #100). Supply a minimal fallback so a misconfigured flow can't 400.
    const safeBody = dto.bodyText?.trim() ? dto.bodyText.slice(0, 1024) : 'Please choose an option:';

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive' as const,
      interactive: {
        type: 'button' as const,
        header: dto.headerImageUrl
          ? { type: 'image' as const, image: { link: dto.headerImageUrl } }
          : dto.headerText
            ? { type: 'text' as const, text: dto.headerText }
            : undefined,
        body: { text: safeBody },
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
        .map((btn, idx) => `${idx + 1}. ${this.stripEmoji(btn.title)}`)
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

  /**
   * Strip emoji / box-draw characters from a label so the numbered text
   * fallback (used when 360dialog rejects interactive payloads) stays
   * clean on devices that render emojis as placeholders.
   */
  /**
   * Meta sends order/product item_price either as a number (major units, e.g.
   * 250) or as a string ("250.00", sometimes "250.00 INR"). Normalise to a
   * positive rupee number; return undefined for missing/unparseable/non-positive.
   */
  private parseCatalogItemPrice(raw: unknown): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    let value: number;
    if (typeof raw === 'number') {
      value = raw;
    } else if (typeof raw === 'string') {
      const cleaned = raw.replace(/[^0-9.\-]/g, '').trim();
      if (!cleaned) return undefined;
      value = Number(cleaned);
    } else {
      return undefined;
    }
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Number(value.toFixed(2));
  }

  private stripEmoji(text: string): string {
    return text
      .replace(
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2500}-\u{25FF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
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

    // WhatsApp interactive-list limits (provider-enforced):
    //   section.title  ≤ 24 chars   row.title       ≤ 24 chars
    //   row.description ≤ 72 chars  action.button   ≤ 20 chars
    const sections = dto.sections.map((section) => ({
      title: section.title.slice(0, 24),
      rows: section.rows.slice(0, 10).map((row) => ({
        id: row.id,
        title: row.title.slice(0, 24),
        description: row.description?.slice(0, 72),
      })),
    }));

    // WhatsApp rejects interactive messages with empty/whitespace body text (error #100).
    const safeBody = dto.bodyText?.trim() ? dto.bodyText.slice(0, 1024) : 'Please choose an option:';

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive' as const,
      interactive: {
        type: 'list' as const,
        header: dto.headerText ? { type: 'text' as const, text: dto.headerText } : undefined,
        body: { text: safeBody },
        footer: dto.footerText ? { text: dto.footerText } : undefined,
        action: {
          button: dto.buttonText.slice(0, 20),
          sections,
        },
      },
    };

    const messageId = await this.sendOutboundWithRetry({
      phone,
      messageType: 'interactive',
      content,
      idempotencyKey,
      payload,
    });

    // Some sandbox/provider policies reject interactive list payloads.
    // Fallback to plain text options so the conversation can continue.
    if (!messageId) {
      const flattenedRows = dto.sections
        .flatMap((section) => section.rows)
        .slice(0, 10);

      const fallbackOptions = flattenedRows
        .map((row, idx) => {
          const title = this.stripEmoji(row.title);
          const desc = row.description ? ` — ${this.stripEmoji(row.description)}` : '';
          return `${idx + 1}. ${title}${desc}`;
        })
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

  async uploadMedia(buffer: Buffer, mimeType: string, filename: string): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FormData = require('form-data');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', buffer, { filename, contentType: mimeType });
    try {
      const response = await this.httpClient.post<{ id: string }>('/media', form, {
        headers: { ...form.getHeaders() },
      });
      return response.data?.id ?? null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `WhatsApp media upload failed: status=${error.response?.status} body=${JSON.stringify(error.response?.data).slice(0, 500)}`,
        );
      } else {
        this.logger.error('WhatsApp media upload failed', error);
      }
      return null;
    }
  }

  async sendDocumentByMediaId(dto: {
    phone: string;
    mediaId: string;
    caption?: string;
    filename?: string;
    meta?: { idempotencyKey?: string };
  }): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone);
    const idempotencyKey = dto.meta?.idempotencyKey;
    const content: WhatsAppMessage['content'] = { caption: dto.caption };

    if (!phone) {
      await this.logFinalOutboundFailure({
        phone: dto.phone,
        messageType: 'document',
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
      type: 'document',
      document: { id: dto.mediaId, caption: dto.caption, filename: dto.filename },
    };

    return this.sendOutboundWithRetry({
      phone,
      messageType: 'document',
      content,
      idempotencyKey,
      payload,
    });
  }

  async fetchTemplate(templateName: string): Promise<Record<string, any> | null> {
    try {
      if (this.is360DialogProvider) {
        const response = await this.httpClient.get('/v2/configs/templates');
        const raw = response.data;
        // 360dialog v1 → { waba_templates: [...] }
        // 360dialog v2 → { data: [...] } or direct array
        const templates: Record<string, any>[] =
          raw?.waba_templates ??
          raw?.templates ??
          raw?.data ??
          (Array.isArray(raw) ? raw : []);
        this.logger.log(`fetchTemplate [360dialog]: ${templates.length} templates, top-level keys=[${Object.keys(raw ?? {}).join(', ')}]`);
        const found = templates.find((t: Record<string, any>) => t.name === templateName) ?? null;
        if (!found) this.logger.warn(`fetchTemplate [360dialog]: "${templateName}" not found — available: [${templates.slice(0, 10).map((t: any) => t.name).join(', ')}]`);
        return found;
      } else {
        const response = await axios.get(
          `${this.config.apiUrl}/${this.config.businessAccountId}/message_templates`,
          {
            headers: { Authorization: `Bearer ${this.config.accessToken}` },
            params: { name: templateName, fields: 'name,components,language,status', limit: 5 },
          },
        );
        return response.data?.data?.[0] ?? null;
      }
    } catch (error) {
      const err = error as any;
      const status = err?.response?.status;
      const body = err?.response?.data ? JSON.stringify(err.response.data) : (err?.message ?? String(error));
      this.logger.warn(`fetchTemplate failed for "${templateName}": HTTP ${status ?? '?'} — ${body}`);
      return null;
    }
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

      if (status === 'failed') {
        this.logger.warn(`wa_delivery_failed messageId=${messageId}`);
      }

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

  /**
   * Admin inbox: one row per phone that has ever exchanged a WhatsApp message,
   * sorted by most-recent first, hydrated with the customer's stored name.
   */
  async listConversations(limit: number = 50): Promise<
    Array<{
      phone: string;
      name: string | null;
      lastMessage: {
        preview: string;
        direction: 'inbound' | 'outbound';
        status?: string;
        at: Date;
      };
    }>
  > {
    const conversations = await this.messageLogRepository.listConversations(limit);
    if (!conversations.length) return [];

    const phones = conversations.map((c) => c.phone);
    const users = await this.usersService.findManyByPhones(phones);
    const nameByPhone = new Map(users.map((u) => [u.phone, u.name || null]));

    return conversations.map((c) => {
      const text = c.lastMessage.content?.text || c.lastMessage.content?.caption;
      const template = c.lastMessage.content?.templateName;
      const preview = text || (template ? `[template: ${template}]` : '[Media]');
      return {
        phone: c.phone,
        name: nameByPhone.get(c.phone) ?? null,
        lastMessage: {
          preview: preview.slice(0, 160),
          direction: c.lastMessage.direction,
          status: c.lastMessage.status,
          at: c.lastMessage.createdAt,
        },
      };
    });
  }

  /**
   * Set the display name for a chat contact. Creates the user record if the
   * contact hasn't been provisioned yet (chat-only — no login/order history).
   */
  async setContactName(phone: string, name: string): Promise<{ phone: string; name: string }> {
    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      throw new Error('Invalid phone number');
    }
    const user = await this.usersService.setNameByPhone(normalized, name);
    return { phone: normalized, name: user.name || '' };
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

  async sendWhatsAppFlow(dto: {
    phone: string;
    flowId: string;
    flowToken: string;
    flowMode: 'draft' | 'published';
    headerText?: string;
    bodyText: string;
    footerText?: string;
    ctaLabel: string;
  }): Promise<string | null> {
    const phone = this.normalizePhone(dto.phone) ?? dto.phone;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        ...(dto.headerText ? { header: { type: 'text', text: dto.headerText.slice(0, 60) } } : {}),
        body: { text: dto.bodyText },
        ...(dto.footerText ? { footer: { text: dto.footerText.slice(0, 60) } } : {}),
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: dto.flowToken,
            flow_id: dto.flowId,
            flow_cta: dto.ctaLabel,
            flow_action: 'data_exchange',
            mode: dto.flowMode,
          },
        },
      },
    };
    return this.sendOutboundWithRetry({
      phone,
      messageType: 'interactive',
      content: { text: dto.bodyText },
      payload,
    });
  }

  async markReadAndTyping(messageId: string, phone: string): Promise<void> {
    const normalizedPhone = this.normalizePhone(phone) ?? phone;
    try {
      if (this.is360DialogProvider) {
        await this.httpClient.post('/messages', {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        });
        await this.httpClient.post('/messages', {
          to: normalizedPhone,
          type: 'action',
          action: { type: 'typing' },
        });
      } else {
        await this.httpClient.post('/messages', {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        });
      }
    } catch {
      // non-critical — never block message processing
    }
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
    let permanentProviderError: { message: string; errorCode?: string } | undefined;

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

        // Surface the raw provider response so we can diagnose 360dialog rejections.
        if (axios.isAxiosError(error)) {
          this.logger.warn(
            `whatsapp_send_attempt_failed attempt=${attempt} status=${error.response?.status} type=${input.messageType} body=${JSON.stringify(error.response?.data).slice(0, 1000)}`,
          );
        }

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
            errorCode: lastMetadata.errorCode,
            errorTitle: lastMetadata.errorTitle,
            errorDetails: lastMetadata.errorDetails,
            attempt,
          });
          permanentProviderError = {
            message: WhatsAppService.formatProviderError(lastMetadata.errorCode, lastMetadata.errorTitle, lastMetadata.errorDetails),
            errorCode: lastMetadata.errorCode,
          };
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

    if (permanentProviderError) {
      throw new WhatsAppPermanentError(permanentProviderError.message, permanentProviderError.errorCode);
    }

    return null;
  }

  private static formatProviderError(errorCode?: string, errorTitle?: string, errorDetails?: string): string {
    const codeMap: Record<string, string> = {
      '100': 'Template parameter error — one or more body variable values are missing or empty',
      '132001': 'Template name not found — verify the exact template name in WhatsApp Manager',
      '132000': 'Template parameter count mismatch — body variable count in template does not match params sent',
      '132005': 'Template text too long',
      '131009': 'Template parameter format mismatch',
      '131047': 'Message outside 24-hour re-engagement window',
      '131021': 'Recipient phone number is not on WhatsApp',
      '131026': 'Message undeliverable to this recipient',
      '130429': 'WhatsApp rate limit reached — try again later',
    };
    if (errorCode && codeMap[errorCode]) {
      return `(#${errorCode}) ${codeMap[errorCode]}`;
    }
    const parts = [errorTitle, errorDetails].filter(Boolean);
    const base = parts.length ? parts.join(': ') : 'WhatsApp permanently rejected the message';
    return errorCode ? `(#${errorCode}) ${base}` : base;
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

      // #100 is a template/parameter configuration error — permanent but NOT a phone issue.
      // Do not retry: the same empty/missing parameter will fail on every attempt.
      if (code === 100) {
        return {
          shouldRetry: false,
          failureReason: 'provider_error',
          metadata: {
            errorCode: '100',
            errorTitle: title,
            errorDetails: details,
          },
        };
      }

      // Heuristics: invalid recipient / blocked user are permanent failures.
      const combined = `${title || ''} ${details || ''}`.toLowerCase();
      const isBlocked =
        combined.includes('blocked') ||
        combined.includes('user has blocked') ||
        combined.includes('recipient blocked');
      const isInvalidPhone =
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
