import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailProcessor } from './email.processor';
import { QUEUE_EMAIL } from '../queues/queues.constants';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_EMAIL })],
  providers: [EmailService, EmailProcessor],
  exports: [EmailService],
})
export class EmailModule {}
