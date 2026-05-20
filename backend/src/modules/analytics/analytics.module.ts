import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsSnapshot, AnalyticsSnapshotSchema } from './schemas/analytics-snapshot.schema';
import { AnalyticsSnapshotRepository } from './repositories/analytics-snapshot.repository';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { ProductsModule } from '../products/products.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { StoreSalesModule } from '../store-sales/store-sales.module';
import { StoreStockModule } from '../store-stock/store-stock.module';
import { StoresModule } from '../stores/stores.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: AnalyticsSnapshot.name, schema: AnalyticsSnapshotSchema },
    ]),
    OrdersModule,
    UsersModule,
    ProductsModule,
    ChatbotModule,
    WhatsAppModule,
    StoreSalesModule,
    StoreStockModule,
    StoresModule,
    SettingsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsSnapshotRepository, AnalyticsService],
  exports: [AnalyticsSnapshotRepository, AnalyticsService],
})
export class AnalyticsModule {}
