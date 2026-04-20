import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MetaCatalogService } from './meta-catalog.service';
import { MetaCatalogController } from './meta-catalog.controller';
import { MetaCatalogScheduler } from './meta-catalog.scheduler';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [MetaCatalogController],
  providers: [MetaCatalogService, MetaCatalogScheduler],
  exports: [MetaCatalogService],
})
export class MetaCatalogModule {}
