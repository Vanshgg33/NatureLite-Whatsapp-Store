import { AdminUser } from './schemas/admin-user.schema';
import { AdminUserRepository } from './repositories/admin-user.repository';
export declare class AdminService {
    private readonly adminUserRepository;
    constructor(adminUserRepository: AdminUserRepository);
    findAll(): Promise<AdminUser[]>;
    findById(id: string): Promise<AdminUser>;
    create(data: {
        name: string;
        email: string;
        password: string;
        phone?: string;
        role?: 'admin' | 'superadmin';
        departmentType?: 'packing' | 'billing' | 'delivery';
    }): Promise<AdminUser>;
    update(id: string, data: {
        name?: string;
        phone?: string;
        role?: 'admin' | 'superadmin';
        isActive?: boolean;
        permissions?: string[];
        departmentType?: 'packing' | 'billing' | 'delivery';
    }): Promise<AdminUser>;
    resetPassword(id: string, newPassword: string): Promise<void>;
    deactivate(id: string): Promise<AdminUser>;
    delete(id: string): Promise<void>;
}
