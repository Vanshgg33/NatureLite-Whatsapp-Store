import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from '../admin/admin.module';
import { ProductionController } from './production.controller';
import { ProductionOutboxService } from './production-outbox.service';
import { ProductionService } from './production.service';
import {
  ProdBalance, ProdBalanceSchema, ProdCounter, ProdCounterSchema, ProdEntry, ProdEntrySchema, ProdItem, ProdItemSchema,
  ProdLocation, ProdLocationSchema, ProdMachine, ProdMachineSchema, ProdMovement, ProdMovementSchema,
  ProdOutbox, ProdOutboxSchema, ProdSettings, ProdSettingsSchema, ProdEvidence, ProdEvidenceSchema,
} from './production.schemas';

@Module({
  imports: [
    AdminModule,
    MongooseModule.forFeature([
      { name: ProdItem.name, schema: ProdItemSchema }, { name: ProdLocation.name, schema: ProdLocationSchema },
      { name: ProdMachine.name, schema: ProdMachineSchema }, { name: ProdMovement.name, schema: ProdMovementSchema },
      { name: ProdBalance.name, schema: ProdBalanceSchema }, { name: ProdEntry.name, schema: ProdEntrySchema },
      { name: ProdCounter.name, schema: ProdCounterSchema }, { name: ProdOutbox.name, schema: ProdOutboxSchema },
      { name: ProdSettings.name, schema: ProdSettingsSchema }, { name: ProdEvidence.name, schema: ProdEvidenceSchema },
    ]),
  ],
  controllers: [ProductionController],
  providers: [ProductionService, ProductionOutboxService],
})
export class ProductionModule {}
