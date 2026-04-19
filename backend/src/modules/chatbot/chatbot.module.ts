import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ChatSessionRepository } from './repositories/chat-session.repository';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { UsersModule } from '../users/users.module';
import { ProductsModule } from '../products/products.module';
import { CategoriesModule } from '../categories/categories.module';
import { CartModule } from '../cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { FeedbackModule } from '../feedback/feedback.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([{ name: ChatSession.name, schema: ChatSessionSchema }]),
    forwardRef(() => WhatsAppModule),
    UsersModule,
    ProductsModule,
    CategoriesModule,
    forwardRef(() => CartModule),
    forwardRef(() => OrdersModule),
    PaymentsModule,
    WalletModule,
    FeedbackModule,
  ],
  controllers: [ChatbotController],
  providers: [ChatSessionRepository, ChatbotService],
  exports: [ChatSessionRepository, ChatbotService],
})
export class ChatbotModule {}
