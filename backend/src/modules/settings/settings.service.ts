import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument, DEFAULT_SETTINGS } from './schemas/settings.schema';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeDefaultSettings();
  }

  private async initializeDefaultSettings(): Promise<void> {
    for (const [category, values] of Object.entries(DEFAULT_SETTINGS)) {
      const key = category;
      const existing = await this.settingsModel.findOne({ key });

      if (!existing) {
        const settings = new this.settingsModel({
          key,
          category,
          value: values,
          description: `${category} settings`,
          isPublic: category === 'store',
        });
        await settings.save();
      }
    }
  }

  async get(key: string): Promise<Record<string, unknown> | null> {
    const settings = await this.settingsModel.findOne({ key });
    return settings?.value || null;
  }

  async getByCategory(category: string): Promise<Settings[]> {
    return this.settingsModel.find({ category });
  }

  async getPublicSettings(): Promise<Record<string, Record<string, unknown>>> {
    const settings = await this.settingsModel.find({ isPublic: true });
    const result: Record<string, Record<string, unknown>> = {};

    for (const setting of settings) {
      result[setting.key] = setting.value;
    }

    return result;
  }

  async getAllSettings(): Promise<Record<string, Record<string, unknown>>> {
    const settings = await this.settingsModel.find();
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
    const settings = await this.settingsModel.findOneAndUpdate(
      { key },
      {
        $set: {
          value,
          lastUpdatedBy: updatedBy,
        },
      },
      { new: true },
    );

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
    const existing = await this.settingsModel.findOne({ key });

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
