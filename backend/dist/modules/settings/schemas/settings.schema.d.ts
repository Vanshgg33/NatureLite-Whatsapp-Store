import { Document, Types } from 'mongoose';
export type SettingsDocument = Settings & Document;
export declare class Settings {
    _id: Types.ObjectId;
    key: string;
    category: string;
    value: Record<string, unknown>;
    description?: string;
    isPublic: boolean;
    lastUpdatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const SettingsSchema: import("mongoose").Schema<Settings, import("mongoose").Model<Settings, any, any, any, Document<unknown, any, Settings, any, {}> & Settings & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Settings, Document<unknown, {}, import("mongoose").FlatRecord<Settings>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Settings> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export declare const DEFAULT_SETTINGS: {
    store: {
        name: string;
        description: string;
        currency: string;
        timezone: string;
        minOrderAmount: number;
        maxOrderAmount: number;
        freeShippingThreshold: number;
        defaultShippingCharge: number;
    };
    whatsapp: {
        welcomeMessage: string;
        orderConfirmationTemplate: string;
        shippingUpdateTemplate: string;
        deliveryConfirmationTemplate: string;
        abandonedCartReminderEnabled: boolean;
        abandonedCartReminderDelayMinutes: number;
    };
    notifications: {
        orderNotificationsEnabled: boolean;
        shippingNotificationsEnabled: boolean;
        promotionalMessagesEnabled: boolean;
    };
    checkout: {
        codEnabled: boolean;
        prepaidEnabled: boolean;
        codExtraCharge: number;
        gstEnabled: boolean;
        defaultGstPercentage: number;
    };
    support: {
        businessHours: {
            start: string;
            end: string;
            days: string[];
        };
        autoReplyOutsideHours: boolean;
        outsideHoursMessage: string;
    };
};
