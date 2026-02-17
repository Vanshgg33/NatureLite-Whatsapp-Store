import { SettingsService } from './settings.service';
import { Settings } from './schemas/settings.schema';
export declare class SettingsController {
    private readonly settingsService;
    constructor(settingsService: SettingsService);
    getPublicSettings(): Promise<Record<string, Record<string, unknown>>>;
    getAllSettings(): Promise<Record<string, Record<string, unknown>>>;
    getSettings(key: string): Promise<Record<string, unknown> | null>;
    setSettings(key: string, value: Record<string, unknown>, userId: string): Promise<Settings>;
    updateSettings(key: string, updates: Record<string, unknown>, userId: string): Promise<Settings>;
}
