import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { MessageLog, MessageLogSchema } from '../whatsapp/schemas/message-log.schema';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MessageLog.name, schema: MessageLogSchema }]),
    BullModule.registerQueue({ name: 'notifications' }),
    WhatsAppModule,
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
