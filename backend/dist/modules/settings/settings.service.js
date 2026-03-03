"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const settings_repository_1 = require("./repositories/settings.repository");
const settings_schema_1 = require("./schemas/settings.schema");
let SettingsService = class SettingsService {
    constructor(settingsRepository) {
        this.settingsRepository = settingsRepository;
    }
    async onModuleInit() {
        await this.initializeDefaultSettings();
    }
    async initializeDefaultSettings() {
        for (const [category, values] of Object.entries(settings_schema_1.DEFAULT_SETTINGS)) {
            const key = category;
            const existing = await this.settingsRepository.findOneByKey(key);
            if (!existing) {
                await this.settingsRepository.create({
                    key,
                    category,
                    value: values,
                    description: `${category} settings`,
                    isPublic: ['store', 'appearance', 'banners'].includes(category),
                });
            }
        }
    }
    async get(key) {
        const settings = await this.settingsRepository.findOneByKey(key);
        return settings?.value || null;
    }
    async getByCategory(category) {
        return this.settingsRepository.findByCategory(category);
    }
    async getPublicSettings() {
        const settings = await this.settingsRepository.findPublic();
        const result = {};
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        return result;
    }
    async getAllSettings() {
        const settings = await this.settingsRepository.findAllSettings();
        const result = {};
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        return result;
    }
    async set(key, value, updatedBy) {
        const settings = await this.settingsRepository.findOneAndUpdateByKey(key, {
            value,
            lastUpdatedBy: updatedBy,
        });
        if (!settings) {
            throw new common_1.NotFoundException(`Setting "${key}" not found`);
        }
        return settings;
    }
    async update(key, updates, updatedBy) {
        const existing = await this.settingsRepository.findOneByKey(key);
        if (!existing) {
            throw new common_1.NotFoundException(`Setting "${key}" not found`);
        }
        const newValue = { ...existing.value, ...updates };
        return this.set(key, newValue, updatedBy);
    }
    async getStoreSettings() {
        return (await this.get('store')) || settings_schema_1.DEFAULT_SETTINGS.store;
    }
    async getWhatsAppSettings() {
        return (await this.get('whatsapp')) || settings_schema_1.DEFAULT_SETTINGS.whatsapp;
    }
    async getCheckoutSettings() {
        return (await this.get('checkout')) || settings_schema_1.DEFAULT_SETTINGS.checkout;
    }
    async getSupportSettings() {
        return (await this.get('support')) || settings_schema_1.DEFAULT_SETTINGS.support;
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [settings_repository_1.SettingsRepository])
], SettingsService);
//# sourceMappingURL=settings.service.js.map