import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req, Logger } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicChatbotService, ChatMessage, isInjectionAttempt } from './public-chatbot.service';

@Controller('chatbot')
@Public()
export class PublicChatbotController {
  private readonly logger = new Logger(PublicChatbotController.name);
  constructor(private readonly chatbotService: PublicChatbotService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async chat(
    @Req() req: any,
    @Body('message') message: string,
    @Body('history') history: unknown = [],
    @Body('page') page: unknown,
    @Body('cart') cart: unknown,
    @Body('appliedCoupon') appliedCoupon: unknown,
  ): Promise<{ reply: string }> {
    if (!message || typeof message !== 'string' || !message.trim()) {
      return { reply: 'Please type a message.' };
    }
    if (message.length > 400) {
      return { reply: 'Message is too long. Please keep it under 400 characters.' };
    }

    // Fix 8: log injection attempts with client IP for abuse tracking.
    if (isInjectionAttempt(message)) {
      this.logger.warn(`[PublicBot] injection attempt from ${req.ip ?? 'unknown'}: "${message.slice(0, 80)}"`);
      return { reply: "I'm here to help with NatureLite products and orders. How can I assist you?" };
    }

    const safePage = typeof page === 'string' ? page.replace(/[^\w\-\/\[\]]/g, '').slice(0, 100) : '';
    const cartLine = this.buildCartContext(cart, appliedCoupon);
    const prefix = [safePage ? `[Page: ${safePage}]` : '', cartLine ? `[Cart: ${cartLine}]` : ''].filter(Boolean).join(' ');
    const messageWithCtx = prefix ? `${prefix}\n${message}` : message;

    const safeHistory = this.validateHistory(history);
    const reply = await this.chatbotService.chat(messageWithCtx, safeHistory);
    return { reply };
  }

  private buildCartContext(raw: unknown, coupon: unknown): string {
    if (!Array.isArray(raw) || !raw.length) return '';
    const lines: string[] = [];
    let total = 0;
    for (const item of raw.slice(0, 10)) {
      if (!item || typeof item !== 'object') continue;
      const name = String((item as any).name ?? '').slice(0, 60).trim();
      const qty = Number((item as any).qty);
      const price = Number((item as any).price);
      // Fix 7: reject cart items whose names contain injection patterns.
      if (!name || !Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || isInjectionAttempt(name)) continue;
      const variant = (item as any).variant ? ` (${String((item as any).variant).slice(0, 30)})` : '';
      lines.push(`${name}${variant} ×${qty} ₹${price * qty}`);
      total += price * qty;
    }
    if (!lines.length && !coupon) return '';
    const cartStr = lines.length ? `${lines.join(', ')} | subtotal ₹${total}` : '';
    const couponStr = this.parseCoupon(coupon);
    return [cartStr, couponStr].filter(Boolean).join(' | ');
  }

  private parseCoupon(raw: unknown): string {
    if (!raw || typeof raw !== 'object') return '';
    const code = String((raw as any).code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30);
    const discount = Number((raw as any).discount);
    if (!code || !Number.isFinite(discount) || discount <= 0) return '';
    return `coupon ${code} applied -₹${discount}`;
  }

  private validateHistory(raw: unknown): ChatMessage[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .slice(-6)
      .filter(
        (h): h is ChatMessage =>
          h != null &&
          typeof h === 'object' &&
          (h.role === 'user' || h.role === 'assistant') &&
          typeof h.text === 'string' &&
          h.text.length > 0,
      )
      .map((h) => ({
        role: h.role,
        text: h.role === 'user' ? h.text.slice(0, 300) : h.text.slice(0, 400),
      }));
  }
}
