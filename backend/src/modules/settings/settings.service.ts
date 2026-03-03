import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Settings } from './schemas/settings.schema';
import { SettingsRepository } from './repositories/settings.repository';
import { DEFAULT_SETTINGS } from './schemas/settings.schema';

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

  async getWhatsAppSettings(): Promise<Record<string, unknown>> {
    return (await this.get('whatsapp')) || DEFAULT_SETTINGS.whatsapp;
  }

  async getCheckoutSettings(): Promise<Record<string, unknown>> {
    return (await this.get('checkout')) || DEFAULT_SETTINGS.checkout;
  }

  async getSupportSettings(): Promise<Record<string, unknown>> {
    return (await this.get('support')) || DEFAULT_SETTINGS.support;
  }
}
