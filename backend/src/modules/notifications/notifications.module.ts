import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { TemplatePreset, TemplatePresetSchema } from './schemas/template-preset.schema';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: TemplatePreset.name, schema: TemplatePresetSchema },
    ]),
    WhatsAppModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
