import { Injectable, Logger } from '@nestjs/common';

export type AnalyticsEvent =
  | 'chatbot.button_clicked'
  | 'chatbot.screen_rendered'
  | 'chatbot.checkout_started'
  | 'chatbot.coupon_applied'
  | 'chatbot.coupon_failed'
  | 'chatbot.order_completed'
  | 'chatbot.product_viewed'
  | 'chatbot.item_added_to_cart';

@Injectable()
export class ChatbotAnalyticsService {
  private readonly logger = new Logger(ChatbotAnalyticsService.name);

  track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
    try {
      this.logger.log(`[analytics] ${event} ${JSON.stringify(props)}`);
    } catch {
      this.logger.log(`[analytics] ${event}`);
    }
  }
}
