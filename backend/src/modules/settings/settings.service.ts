import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Settings } from './schemas/settings.schema';
import { SettingsRepository } from './repositories/settings.repository';
import { DEFAULT_SETTINGS } from './schemas/settings.schema';

export type WhatsAppSettings = {
  welcomeMessage: string;
  orderConfirmationTemplate: string;
  shippingUpdateTemplate: string;
  deliveryConfirmationTemplate: string;
  abandonedCartReminderEnabled: boolean;
  abandonedCartReminderDelayMinutes: number;
};

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async onModuleInit(): Promise<void> {
    await this.initializeDefaultSettings();
  }

  private async initializeDefaultSettings(): Promise<void> {
    for (const [category, values] of Object.entries(DEFAULT_SETTINGS)) {
      const key = category;
      const existing = await this.settingsRepository.findOneByKey(key);

      if (!existing) {
        await this.settingsRepository.create({
          key,
          category,
          value: values as Record<string, unknown>,
          description: `${category} settings`,
          isPublic: ['store', 'appearance', 'banners'].includes(category),
        } as Partial<Settings>);
      }
    }
  }

  async get(key: string): Promise<Record<string, unknown> | null> {
    const settings = await this.settingsRepository.findOneByKey(key);
    return settings?.value || null;
  }

  async getByCategory(category: string): Promise<Settings[]> {
    return this.settingsRepository.findByCategory(category);
  }

  async getPublicSettings(): Promise<Record<string, Record<string, unknown>>> {
    const settings = await this.settingsRepository.findPublic();
    const result: Record<string, Record<string, unknown>> = {};
    for (const setting of settings) {
      result[setting.key] = setting.value;
    }
    return result;
  }

  async getAllSettings(): Promise<Record<string, Record<string, unknown>>> {
    const settings = await this.settingsRepository.findAllSettings();
    const result: Record<string, Record<string, unknown>> = {};
    for (const setting of settings) {
      result[setting.key] = setting.value;
    }
    return result;
  }

  async set(
    key: string,
    value: Record<string, unknown>,
    updatedBy?: string,
  ): Promise<Settings> {
    const settings = await this.settingsRepository.findOneAndUpdateByKey(key, {
      value,
      lastUpdatedBy: updatedBy,
    });

    if (!settings) {
      throw new NotFoundException(`Setting "${key}" not found`);
    }

    return settings;
  }

  async update(
    key: string,
    updates: Record<string, unknown>,
    updatedBy?: string,
  ): Promise<Settings> {
    const existing = await this.settingsRepository.findOneByKey(key);

    if (!existing) {
      throw new NotFoundException(`Setting "${key}" not found`);
    }

    const newValue = { ...existing.value, ...updates };

    return this.set(key, newValue, updatedBy);
  }

  async getStoreSettings(): Promise<Record<string, unknown>> {
    return (await this.get('store')) || DEFAULT_SETTINGS.store;
  }

  async getWhatsAppSettings(): Promise<WhatsAppSettings> {
    const raw = (await this.get('whatsapp')) || DEFAULT_SETTINGS.whatsapp;

    const getString = (key: keyof WhatsAppSettings, fallback: string): string => {
      const value = raw[key as string];
      return typeof value === 'string' && value.trim() ? value : fallback;
    };

    const getBoolean = (key: keyof WhatsAppSettings, fallback: boolean): boolean => {
      const value = raw[key as string];
      return typeof value === 'boolean' ? value : fallback;
    };

    const getNumber = (key: keyof WhatsAppSettings, fallback: number): number => {
      const value = raw[key as string];
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    };

    return {
      welcomeMessage: getString('welcomeMessage', DEFAULT_SETTINGS.whatsapp.welcomeMessage),
      orderConfirmationTemplate: getString(
        'orderConfirmationTemplate',
        DEFAULT_SETTINGS.whatsapp.orderConfirmationTemplate,
      ),
      shippingUpdateTemplate: getString(
        'shippingUpdateTemplate',
        DEFAULT_SETTINGS.whatsapp.shippingUpdateTemplate,
      ),
      deliveryConfirmationTemplate: getString(
        'deliveryConfirmationTemplate',
        DEFAULT_SETTINGS.whatsapp.deliveryConfirmationTemplate,
      ),
      abandonedCartReminderEnabled: getBoolean(
        'abandonedCartReminderEnabled',
        DEFAULT_SETTINGS.whatsapp.abandonedCartReminderEnabled,
      ),
      abandonedCartReminderDelayMinutes: getNumber(
        'abandonedCartReminderDelayMinutes',
        DEFAULT_SETTINGS.whatsapp.abandonedCartReminderDelayMinutes,
      ),
    } satisfies WhatsAppSettings;
  }

  async getCheckoutSettings(): Promise<Record<string, unknown>> {
    return (await this.get('checkout')) || DEFAULT_SETTINGS.checkout;
  }

  async getSupportSettings(): Promise<Record<string, unknown>> {
    return (await this.get('support')) || DEFAULT_SETTINGS.support;
  }

  async getMockDataEnabled(): Promise<boolean> {
    const raw = await this.get('mockData');
    return raw?.enabled === true;
  }

  async getChatbotEnabled(): Promise<boolean> {
    try {
      const raw = await this.get('chatbot');
      return raw === null ? false : raw.enabled === true;
    } catch {
      // Fail open: if we can't read settings, assume chatbot is enabled.
      return true;
    }
  }

  async getMetricsResetAt(): Promise<Date | null> {
    const raw = await this.get('metrics');
    const ts = raw?.resetAt;
    return typeof ts === 'string' ? new Date(ts) : null;
  }

  async setMetricsResetAt(date: Date): Promise<void> {
    await this.settingsRepository.getModel().findOneAndUpdate(
      { key: 'metrics' },
      {
        $set: {
          key: 'metrics',
          category: 'metrics',
          value: { resetAt: date.toISOString() },
          isPublic: false,
          description: 'Metrics reset configuration',
        },
      },
      { upsert: true, new: true },
    ).exec();
  }
}
