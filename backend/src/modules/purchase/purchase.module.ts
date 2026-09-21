import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PurchaseMaterial, PurchaseMaterialSchema } from './schemas/purchase-material.schema';
import { PurchaseRequest, PurchaseRequestSchema } from './schemas/purchase-request.schema';
import { PurchaseVendor, PurchaseVendorSchema } from './schemas/purchase-vendor.schema';
import { AdminUser, AdminUserSchema } from '../admin/schemas/admin-user.schema';
import { PurchaseService } from './purchase.service';
import { PurchaseController } from './purchase.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: PurchaseMaterial.name, schema: PurchaseMaterialSchema },
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: PurchaseVendor.name, schema: PurchaseVendorSchema },
      { name: AdminUser.name, schema: AdminUserSchema },
    ]),
  ],
  controllers: [PurchaseController],
  providers: [PurchaseService],
})
export class PurchaseModule {}
