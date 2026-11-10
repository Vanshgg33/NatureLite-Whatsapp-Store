import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportConfig, ReportConfigSchema } from './schemas/report-config.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Complaint, ComplaintSchema } from '../complaints/schemas/complaint.schema';
import { DailyReportService } from './daily-report.service';
import { ReportsController } from './reports.controller';
import { MediaModule } from '../media/media.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportConfig.name, schema: ReportConfigSchema },
      { name: Order.name,        schema: OrderSchema },
      { name: User.name,         schema: UserSchema },
      { name: Complaint.name,    schema: ComplaintSchema },
    ]),
    MediaModule,
    WhatsAppModule,
    EmailModule,
  ],
  controllers: [ReportsController],
  providers: [DailyReportService],
})
export class ReportsModule {}
