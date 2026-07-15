import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { BroadcastProcessor } from './broadcast.processor';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { QUEUE_NOTIFICATIONS, QUEUE_BROADCAST } from '../queues/queues.constants';
import { QueueScalerService } from '../queues/queue-scaler.service';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { TemplatePreset, TemplatePresetSchema } from './schemas/template-preset.schema';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    BullModule.registerQueue({ name: QUEUE_BROADCAST }),
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: TemplatePreset.name, schema: TemplatePresetSchema },
    ]),
    WhatsAppModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor, BroadcastProcessor, QueueScalerService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
