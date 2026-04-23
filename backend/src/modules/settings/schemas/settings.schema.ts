import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SettingsDocument = Settings & Document;

@Schema({ timestamps: true })
export class Settings {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  key: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: Object, required: true })
  value: Record<string, unknown>;

  @Prop()
  description?: string;

  @Prop({ default: false })
  isPublic: boolean;

  @Prop()
  lastUpdatedBy?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);

SettingsSchema.index({ category: 1 });

// Default settings structure
export const DEFAULT_SETTINGS = {
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
  catalog: {
    syncMode: 'dry_run',
    autoSyncEnabled: true,
    selectedCatalogId: '',
    selectedCatalogName: '',
    lastSyncAt: '',
    lastSyncStatus: 'idle',
    lastSyncMessage: '',
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
