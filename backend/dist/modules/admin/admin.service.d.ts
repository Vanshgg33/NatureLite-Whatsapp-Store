import { Model } from 'mongoose';
import { AdminUser, AdminUserDocument } from './schemas/admin-user.schema';
export declare class AdminService {
    private adminUserModel;
    constructor(adminUserModel: Model<AdminUserDocument>);
    findAll(): Promise<AdminUser[]>;
    findById(id: string): Promise<AdminUser>;
    create(data: {
        name: string;
        email: string;
        password: string;
        phone?: string;
        role?: 'admin' | 'superadmin';
    }): Promise<AdminUser>;
    update(id: string, data: {
        name?: string;
        phone?: string;
        role?: 'admin' | 'superadmin';
        isActive?: boolean;
        permissions?: string[];
    }): Promise<AdminUser>;
    resetPassword(id: string, newPassword: string): Promise<void>;
    deactivate(id: string): Promise<AdminUser>;
    delete(id: string): Promise<void>;
}
