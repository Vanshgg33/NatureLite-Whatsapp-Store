import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicChatbotService, ChatMessage } from './public-chatbot.service';

@Controller('chatbot')
@Public()
export class PublicChatbotController {
  constructor(private readonly chatbotService: PublicChatbotService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async chat(
    @Body('message') message: string,
    @Body('history') history: unknown = [],
  ): Promise<{ reply: string }> {
    if (!message || typeof message !== 'string' || !message.trim()) {
      return { reply: 'Please type a message.' };
    }
    if (message.length > 400) {
      return { reply: 'Message is too long. Please keep it under 400 characters.' };
    }

    const safeHistory = this.validateHistory(history);
    const reply = await this.chatbotService.chat(message, safeHistory);
    return { reply };
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
