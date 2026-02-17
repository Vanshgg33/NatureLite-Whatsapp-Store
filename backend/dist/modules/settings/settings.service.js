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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const settings_schema_1 = require("./schemas/settings.schema");
let SettingsService = class SettingsService {
    constructor(settingsModel) {
        this.settingsModel = settingsModel;
    }
    async onModuleInit() {
        await this.initializeDefaultSettings();
    }
    async initializeDefaultSettings() {
        for (const [category, values] of Object.entries(settings_schema_1.DEFAULT_SETTINGS)) {
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
    async get(key) {
        const settings = await this.settingsModel.findOne({ key });
        return settings?.value || null;
    }
    async getByCategory(category) {
        return this.settingsModel.find({ category });
    }
    async getPublicSettings() {
        const settings = await this.settingsModel.find({ isPublic: true });
        const result = {};
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        return result;
    }
    async getAllSettings() {
        const settings = await this.settingsModel.find();
        const result = {};
        for (const setting of settings) {
            result[setting.key] = setting.value;
        }
        return result;
    }
    async set(key, value, updatedBy) {
        const settings = await this.settingsModel.findOneAndUpdate({ key }, {
            $set: {
                value,
                lastUpdatedBy: updatedBy,
            },
        }, { new: true });
        if (!settings) {
            throw new common_1.NotFoundException(`Setting "${key}" not found`);
        }
        return settings;
    }
    async update(key, updates, updatedBy) {
        const existing = await this.settingsModel.findOne({ key });
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
    __param(0, (0, mongoose_1.InjectModel)(settings_schema_1.Settings.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], SettingsService);
//# sourceMappingURL=settings.service.js.map