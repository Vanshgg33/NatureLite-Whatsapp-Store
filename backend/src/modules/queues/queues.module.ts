import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { NotificationProcessor } from './notification.processor';
import { AbandonedCartProcessor } from './abandoned-cart.processor';
import { NotificationsModule } from '../notifications/notifications.module';
import { CartModule } from '../cart/cart.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password') || undefined,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'notifications' },
      { name: 'shiprocket' },
      { name: 'broadcast' },
    ),
    NotificationsModule,
    CartModule,
    SettingsModule,
  ],
  providers: [NotificationProcessor, AbandonedCartProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
