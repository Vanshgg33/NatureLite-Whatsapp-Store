import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { AdminUserDocument } from './schemas/admin-user.schema';
export declare class AdminModule implements OnModuleInit {
    private adminModel;
    constructor(adminModel: Model<AdminUserDocument>);
    onModuleInit(): Promise<void>;
}
