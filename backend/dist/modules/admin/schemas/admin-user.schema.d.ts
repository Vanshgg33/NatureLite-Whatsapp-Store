import { Document, Types } from 'mongoose';
export type AdminUserDocument = AdminUser & Document;
export type AdminRole = 'admin' | 'superadmin';
export declare class AdminUser {
    _id: Types.ObjectId;
    name: string;
    email: string;
    password: string;
    phone?: string;
    role: AdminRole;
    isActive: boolean;
    lastLoginAt?: Date;
    lastLoginIp?: string;
    permissions: string[];
    avatar?: string;
    preferences: Record<string, unknown>;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const AdminUserSchema: import("mongoose").Schema<AdminUser, import("mongoose").Model<AdminUser, any, any, any, Document<unknown, any, AdminUser, any, {}> & AdminUser & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, AdminUser, Document<unknown, {}, import("mongoose").FlatRecord<AdminUser>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<AdminUser> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
