import { Document, Types } from 'mongoose';
export type ChatSessionDocument = ChatSession & Document;
export type SessionState = 'main_menu' | 'browsing' | 'product_detail' | 'cart' | 'checkout' | 'address_input' | 'payment_selection' | 'order_tracking' | 'reorder' | 'faq' | 'support' | 'awaiting_input';
export declare class ChatSession {
    _id: Types.ObjectId;
    phone: string;
    user?: Types.ObjectId;
    currentState: SessionState;
    previousState?: SessionState;
    context: Record<string, unknown>;
    currentCategoryId?: string;
    currentProductId?: string;
    pendingOrderId?: string;
    awaitingInputFor?: string;
    menuPage: number;
    isHandedOffToSupport: boolean;
    supportHandoffAt?: Date;
    supportAgentId?: string;
    lastMessageAt?: Date;
    lastBotResponseAt?: Date;
    messageCount: number;
    isExpired: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ChatSessionSchema: import("mongoose").Schema<ChatSession, import("mongoose").Model<ChatSession, any, any, any, Document<unknown, any, ChatSession, any, {}> & ChatSession & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ChatSession, Document<unknown, {}, import("mongoose").FlatRecord<ChatSession>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<ChatSession> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
