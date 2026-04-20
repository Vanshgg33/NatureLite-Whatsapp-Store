import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { MessageLog, MessageLogSchema } from './schemas/message-log.schema';
import { MessageLogRepository } from './repositories/message-log.repository';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MessageLog.name, schema: MessageLogSchema }]),
    forwardRef(() => ChatbotModule),
    UsersModule,
  ],
  controllers: [WhatsAppController],
  providers: [MessageLogRepository, WhatsAppService],
  exports: [MessageLogRepository, WhatsAppService],
})
export class WhatsAppModule {}
