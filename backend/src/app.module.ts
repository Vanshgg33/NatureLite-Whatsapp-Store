import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UcmModule } from './modules/ucm/ucm.module';
import { MediaModule } from './modules/media/media.module';
import { AuditModule } from './modules/audit/audit.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InteraktModule } from './modules/interakt/interakt.module';
import { EmailModule } from './modules/email/email.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { StoresModule } from './modules/stores/stores.module';
import { StoreStockModule } from './modules/store-stock/store-stock.module';
import { StoreSalesModule } from './modules/store-sales/store-sales.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { RawMaterialModule } from './modules/raw-materials/raw-material.module';
import { AdminChatbotModule } from './modules/admin-chatbot/admin-chatbot.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
    }),

    ScheduleModule.forRoot(),

    RedisModule,

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('redis.host');
        const port = configService.get<number>('redis.port');
        const password = configService.get<string>('redis.password');
        const username = configService.get<string>('redis.username');
        const tls = configService.get<boolean>('redis.tls');
        return {
          connection: {
            host,
            port,
            ...(username ? { username } : {}),
            ...(password ? { password } : {}),
            ...(tls ? { tls: { rejectUnauthorized: false } } : {}),
            // Required for BullMQ workers — disables ioredis auto-retry behaviour
            // that conflicts with BullMQ's own blocking commands
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
        };
      },
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('redis.host');
        const port = configService.get<number>('redis.port');
        const password = configService.get<string>('redis.password');
        const username = configService.get<string>('redis.username');
        const tls = configService.get<boolean>('redis.tls');
        return [{
          ttl: configService.get<number>('throttle.ttl') || 60,
          limit: configService.get<number>('throttle.limit') || 100,
          storage: new ThrottlerStorageRedisService({
            host,
            port,
            ...(username ? { username } : {}),
            ...(password ? { password } : {}),
            ...(tls ? { tls: { rejectUnauthorized: false } } : {}),
          }),
        }];
      },
    }),

    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    CartModule,
    OrdersModule,
    CouponsModule,
    WhatsAppModule,
    ChatbotModule,
    NotificationsModule,
    AnalyticsModule,
    AdminModule,
    SettingsModule,
    UcmModule,
    MediaModule,
    AuditModule,
    PaymentsModule,
    InteraktModule,
    EmailModule,
    FeedbackModule,
    StoresModule,
    StoreStockModule,
    StoreSalesModule,
    RemindersModule,
    WishlistModule,
    WalletModule,
    RawMaterialModule,
    AdminChatbotModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
