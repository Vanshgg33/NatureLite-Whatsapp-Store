import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { Reminder, ReminderSchema } from './schemas/reminder.schema';
import { ReminderRepository } from './repositories/reminder.repository';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Reminder.name, schema: ReminderSchema }]),
    forwardRef(() => StoresModule),
  ],
  controllers: [RemindersController],
  providers: [ReminderRepository, RemindersService],
  exports: [RemindersService, ReminderRepository, MongooseModule],
})
export class RemindersModule {}
