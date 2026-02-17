import { Document, Types } from 'mongoose';
export type MessageLogDocument = MessageLog & Document;
export type MessageDirection = 'inbound' | 'outbound';
export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contact' | 'interactive' | 'template' | 'button' | 'list_reply';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export declare class MessageLog {
    _id: Types.ObjectId;
    phone: string;
    user?: Types.ObjectId;
    session?: Types.ObjectId;
    direction: MessageDirection;
    messageType: MessageType;
    whatsappMessageId?: string;
    content: {
        text?: string;
        mediaUrl?: string;
        mediaId?: string;
        caption?: string;
        templateName?: string;
        templateParams?: string[];
        buttonId?: string;
        buttonText?: string;
        listId?: string;
        listTitle?: string;
        location?: {
            latitude: number;
            longitude: number;
            name?: string;
            address?: string;
        };
    };
    status: MessageStatus;
    failureReason?: string;
    retryCount: number;
    deliveredAt?: Date;
    readAt?: Date;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const MessageLogSchema: import("mongoose").Schema<MessageLog, import("mongoose").Model<MessageLog, any, any, any, Document<unknown, any, MessageLog, any, {}> & MessageLog & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, MessageLog, Document<unknown, {}, import("mongoose").FlatRecord<MessageLog>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<MessageLog> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
