import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppService } from './whatsapp.service';
import { WaFlowService } from './wa-flow.service';
import { WhatsAppController } from './whatsapp.controller';
import { MessageLog, MessageLogSchema } from './schemas/message-log.schema';
import { MessageLogRepository } from './repositories/message-log.repository';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MessageLog.name, schema: MessageLogSchema }]),
    forwardRef(() => ChatbotModule),
    UsersModule,
    SettingsModule,
  ],
  controllers: [WhatsAppController],
  providers: [MessageLogRepository, WhatsAppService, WaFlowService],
  exports: [MessageLogRepository, WhatsAppService, WaFlowService],
})
export class WhatsAppModule {}
