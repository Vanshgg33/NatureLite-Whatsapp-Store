import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminUser, AdminUserSchema } from './schemas/admin-user.schema';
import { AdminUserRepository } from './repositories/admin-user.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AdminUser.name, schema: AdminUserSchema }]),
  ],
  providers: [AdminUserRepository, AdminService],
  exports: [AdminUserRepository, AdminService],
})
export class AdminModule {}
