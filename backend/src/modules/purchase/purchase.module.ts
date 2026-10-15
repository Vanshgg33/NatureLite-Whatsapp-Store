import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PurchaseMaterial, PurchaseMaterialSchema } from './schemas/purchase-material.schema';
import { PurchaseRequest, PurchaseRequestSchema } from './schemas/purchase-request.schema';
import { PurchaseVendor, PurchaseVendorSchema } from './schemas/purchase-vendor.schema';
import { PurchaseTag, PurchaseTagSchema } from './schemas/purchase-tag.schema';
import { AdminUser, AdminUserSchema } from '../admin/schemas/admin-user.schema';
import { PurchaseService } from './purchase.service';
import { PurchaseController } from './purchase.controller';
import { EmailModule } from '../email/email.module';
import { PermissionGuard } from '../../common/guards/permission.guard';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: PurchaseMaterial.name, schema: PurchaseMaterialSchema },
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: PurchaseVendor.name, schema: PurchaseVendorSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: PurchaseTag.name, schema: PurchaseTagSchema },
    ]),
  ],
  controllers: [PurchaseController],
  providers: [PurchaseService, PermissionGuard],
})
export class PurchaseModule {}
