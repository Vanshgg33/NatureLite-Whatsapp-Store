import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './schemas/settings.schema';
export declare class SettingsService implements OnModuleInit {
    private settingsModel;
    constructor(settingsModel: Model<SettingsDocument>);
    onModuleInit(): Promise<void>;
    private initializeDefaultSettings;
    get(key: string): Promise<Record<string, unknown> | null>;
    getByCategory(category: string): Promise<Settings[]>;
    getPublicSettings(): Promise<Record<string, Record<string, unknown>>>;
    getAllSettings(): Promise<Record<string, Record<string, unknown>>>;
    set(key: string, value: Record<string, unknown>, updatedBy?: string): Promise<Settings>;
    update(key: string, updates: Record<string, unknown>, updatedBy?: string): Promise<Settings>;
    getStoreSettings(): Promise<Record<string, unknown>>;
    getWhatsAppSettings(): Promise<Record<string, unknown>>;
    getCheckoutSettings(): Promise<Record<string, unknown>>;
    getSupportSettings(): Promise<Record<string, unknown>>;
}
