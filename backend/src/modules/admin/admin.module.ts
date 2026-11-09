import { Global, Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminService } from './admin.service';
import { AdminUser, AdminUserDocument, AdminUserSchema } from './schemas/admin-user.schema';
import { AdminUserRepository } from './repositories/admin-user.repository';
import { AdminController } from './admin.controller';
import { AccessRole, AccessRoleSchema } from './schemas/access-role.schema';
import { AccessRolesService } from './access-roles.service';
import { AccessRolesController, AdminAccessMeController } from './access-roles.controller';
import { AccessGuard } from '../../common/guards/access.guard';

// Global so any controller can use @RequireAccess (AccessGuard needs the AdminUser/AccessRole models).
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: AccessRole.name, schema: AccessRoleSchema },
    ]),
  ],
  controllers: [AdminController, AccessRolesController, AdminAccessMeController],
  providers: [AdminUserRepository, AdminService, AccessRolesService, AccessGuard],
  exports: [AdminUserRepository, AdminService, AccessGuard, MongooseModule],
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
