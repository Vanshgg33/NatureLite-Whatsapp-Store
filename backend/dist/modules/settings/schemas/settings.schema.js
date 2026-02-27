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
exports.DEFAULT_SETTINGS = exports.SettingsSchema = exports.Settings = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let Settings = class Settings {
};
exports.Settings = Settings;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, index: true }),
    __metadata("design:type", String)
], Settings.prototype, "key", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Settings.prototype, "category", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, required: true }),
    __metadata("design:type", Object)
], Settings.prototype, "value", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Settings.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Settings.prototype, "isPublic", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Settings.prototype, "lastUpdatedBy", void 0);
exports.Settings = Settings = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Settings);
exports.SettingsSchema = mongoose_1.SchemaFactory.createForClass(Settings);
exports.SettingsSchema.index({ key: 1 });
exports.SettingsSchema.index({ category: 1 });
exports.DEFAULT_SETTINGS = {
    store: {
        name: 'WhatsApp Store',
        description: 'Your WhatsApp Commerce Store',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        minOrderAmount: 0,
        maxOrderAmount: 100000,
        freeShippingThreshold: 500,
        defaultShippingCharge: 50,
    },
    whatsapp: {
        welcomeMessage: 'Welcome to our store! How can I help you today?',
        orderConfirmationTemplate: 'order_confirmation',
        shippingUpdateTemplate: 'shipping_update',
        deliveryConfirmationTemplate: 'delivery_confirmation',
        abandonedCartReminderEnabled: true,
        abandonedCartReminderDelayMinutes: 60,
    },
    notifications: {
        orderNotificationsEnabled: true,
        shippingNotificationsEnabled: true,
        promotionalMessagesEnabled: false,
    },
    checkout: {
        codEnabled: true,
        prepaidEnabled: true,
        codExtraCharge: 0,
        gstEnabled: true,
        defaultGstPercentage: 18,
    },
    support: {
        businessHours: {
            start: '09:00',
            end: '18:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
        },
        autoReplyOutsideHours: true,
        outsideHoursMessage: 'We are currently outside business hours. We will get back to you soon!',
    },
    appearance: {
        activeTheme: 'forest-green',
        logoUrl: '',
        logoPublicId: '',
    },
    banners: {
        heroBanners: [],
        announcementBar: {
            enabled: false,
            text: '',
            linkText: '',
            linkUrl: '',
            backgroundColor: 'primary',
            textColor: 'white',
        },
    },
};
//# sourceMappingURL=settings.schema.js.map