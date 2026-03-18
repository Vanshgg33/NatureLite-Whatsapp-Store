import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface SendTemplateMessagePayload {
  countryCode: string;
  phoneNumber: string;
  templateName: string;
  languageCode?: string;
  headerValues?: string[];
  bodyValues?: string[];
  buttonValues?: Record<string, string[]>;
  callbackData?: string;
  campaignId?: string;
}

@Injectable()
export class InteraktService {
  private readonly logger = new Logger(InteraktService.name);
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('interakt.apiKey') ||
      this.configService.get<string>('INTERAKT_API_KEY');

    this.apiKey = apiKey || '';

    this.client = axios.create({
      baseURL: 'https://api.interakt.ai',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        // HTTP Basic Auth with API key as per Interakt docs:
        // Authorization: Basic <API_KEY>
        Authorization: this.apiKey ? `Basic ${this.apiKey}` : '',
      },
    });

    if (!this.apiKey) {
      this.logger.warn('Interakt API key is not configured. WhatsApp notifications will be disabled.');
    } else {
      this.logger.log('InteraktService initialized');
    }
  }

  /**
   * Send a WhatsApp template message via Interakt.
   * NOTE: Interakt's public API supports template-based messages only.
   */
  async sendTemplateMessage(payload: SendTemplateMessagePayload): Promise<{ id: string | null }> {
    if (!this.apiKey) {
      this.logger.warn('Skipping Interakt sendTemplateMessage – API key not configured');
      return { id: null };
    }

    try {
      const response = await this.client.post('/v1/public/message/', {
        countryCode: payload.countryCode,
        phoneNumber: payload.phoneNumber,
        type: 'Template',
        callbackData: payload.callbackData,
        campaignId: payload.campaignId,
        template: {
          name: payload.templateName,
          languageCode: payload.languageCode ?? 'en',
          headerValues: payload.headerValues,
          bodyValues: payload.bodyValues,
          buttonValues: payload.buttonValues,
        },
      });

      if (response.data?.result !== true) {
        this.logger.warn(`Interakt sendTemplateMessage responded with non-success: ${JSON.stringify(response.data)}`);
      }

      return { id: response.data?.id ?? null };
    } catch (error) {
      this.logger.error('Error while sending message via Interakt', error instanceof Error ? error.stack : String(error));
      return { id: null };
    }
  }
}

