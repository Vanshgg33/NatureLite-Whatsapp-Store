import { Document, Types } from 'mongoose';
export type PaymentDocument = Payment & Document;
export type PaymentGateway = 'razorpay' | 'phonepe' | 'paytm' | 'manual' | 'cod';
export type TransactionStatus = 'initiated' | 'pending' | 'success' | 'failed' | 'refunded';
export declare class Payment {
    _id: Types.ObjectId;
    order: Types.ObjectId;
    user: Types.ObjectId;
    amount: number;
    currency: string;
    gateway: PaymentGateway;
    status: TransactionStatus;
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    gatewaySignature?: string;
    gatewayResponse?: Record<string, unknown>;
    refundId?: string;
    refundAmount?: number;
    refundedAt?: Date;
    refundReason?: string;
    failureReason?: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const PaymentSchema: import("mongoose").Schema<Payment, import("mongoose").Model<Payment, any, any, any, Document<unknown, any, Payment, any, {}> & Payment & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Payment, Document<unknown, {}, import("mongoose").FlatRecord<Payment>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Payment> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
