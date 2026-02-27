import { Document, Types } from 'mongoose';
export type UserDocument = User & Document;
export declare class Address {
    label: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
    isDefault: boolean;
}
export declare const AddressSchema: import("mongoose").Schema<Address, import("mongoose").Model<Address, any, any, any, Document<unknown, any, Address, any, {}> & Address & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Address, Document<unknown, {}, import("mongoose").FlatRecord<Address>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<Address> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
export declare class User {
    _id: Types.ObjectId;
    phone?: string;
    name?: string;
    email?: string;
    password?: string;
    addresses: Address[];
    isActive: boolean;
    isBlocked: boolean;
    blockedReason?: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderAt?: Date;
    lastInteractionAt?: Date;
    preferences: Record<string, unknown>;
    tags: string[];
    notes?: string;
    failedLoginAttempts: number;
    lockoutUntil?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const UserSchema: import("mongoose").Schema<User, import("mongoose").Model<User, any, any, any, Document<unknown, any, User, any, {}> & User & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, User, Document<unknown, {}, import("mongoose").FlatRecord<User>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<User> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
