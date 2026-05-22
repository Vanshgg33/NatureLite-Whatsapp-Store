import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RawMaterialService } from './raw-material.service';
import { RawMaterialController } from './raw-material.controller';
import { RawMaterial, RawMaterialSchema } from './schemas/raw-material.schema';
import { RawMaterialDailyEntry, RawMaterialDailyEntrySchema } from './schemas/raw-material-snapshot.schema';
import { RawMaterialRepository } from './repositories/raw-material.repository';
import { RawMaterialDailyEntryRepository } from './repositories/raw-material-snapshot.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RawMaterial.name, schema: RawMaterialSchema },
      { name: RawMaterialDailyEntry.name, schema: RawMaterialDailyEntrySchema },
    ]),
  ],
  controllers: [RawMaterialController],
  providers: [RawMaterialRepository, RawMaterialDailyEntryRepository, RawMaterialService],
  exports: [RawMaterialService],
})
export class RawMaterialModule {}
