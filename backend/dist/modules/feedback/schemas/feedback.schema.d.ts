import { Document, Types } from 'mongoose';
export type FeedbackDocument = Feedback & Document;
export type FeedbackType = 'product_review' | 'order_feedback' | 'general' | 'complaint' | 'suggestion';
export type FeedbackStatus = 'pending' | 'acknowledged' | 'resolved' | 'closed';
export declare class Feedback {
    _id: Types.ObjectId;
    user: Types.ObjectId;
    order?: Types.ObjectId;
    product?: Types.ObjectId;
    type: FeedbackType;
    rating?: number;
    message: string;
    images: string[];
    status: FeedbackStatus;
    adminResponse?: string;
    respondedAt?: Date;
    respondedBy?: string;
    isPublic: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const FeedbackSchema: import("mongoose").Schema<Feedback, import("mongoose").Model<Feedback, any, any, any, Document<unknown, any, Feedback, any, {}> & Feedback & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Feedback, Document<unknown, {}, import("mongoose").FlatRecord<Feedback>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Feedback> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
