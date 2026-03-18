import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminService } from './admin.service';
import { AdminUser, AdminUserDocument, AdminUserSchema } from './schemas/admin-user.schema';
import { AdminUserRepository } from './repositories/admin-user.repository';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AdminUser.name, schema: AdminUserSchema }]),
  ],
  controllers: [AdminController],
  providers: [AdminUserRepository, AdminService],
  exports: [AdminUserRepository, AdminService],
})
export class AdminModule implements OnModuleInit {
  constructor(
    @InjectModel(AdminUser.name) private adminModel: Model<AdminUserDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.adminModel.collection.dropIndex('phone_1');
    } catch {
      // Index may not exist or already be sparse; ignore
    }
    await this.adminModel.syncIndexes();
  }
}
