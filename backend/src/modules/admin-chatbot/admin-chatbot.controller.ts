import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminChatbotService, HistoryItem } from './admin-chatbot.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

@Controller('admin/chatbot')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminChatbotController {
  constructor(private readonly chatbotService: AdminChatbotService) {}

  // ── Non-streaming chat ────────────────────────────────────────────────────────
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async chat(
    @Body('message') message: string,
    @Body('history') history: HistoryItem[] = [],
    @CurrentUser() user: JwtPayload,
  ): Promise<{ reply: string }> {
    if (!message || typeof message !== 'string')
      return { reply: '⚠️ Please provide a valid chat message.' };
    if (message.length > 500)
      return { reply: '⚠️ Message too long. Keep it under 500 characters.' };
    const safeHistory = this.validateHistory(history);
    return this.chatbotService.chat(message, safeHistory, user.sub);
  }

  // ── Streaming chat (SSE) ──────────────────────────────────────────────────────
  @Post('stream')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async streamChat(
    @Body('message') message: string,
    @Body('history') history: HistoryItem[] = [],
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    if (!message || typeof message !== 'string' || message.length > 500) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ delta: '⚠️ Invalid or too-long message.' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const safeHistory = this.validateHistory(history);
    await this.chatbotService.streamChat(message, safeHistory, user.sub, res);
    res.end();
  }

  // ── Async chat via BullMQ ─────────────────────────────────────────────────────
  @Post('enqueue')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async enqueueChat(
    @Body('message') message: string,
    @Body('history') history: HistoryItem[] = [],
    @CurrentUser() user: JwtPayload,
  ): Promise<{ jobId: string }> {
    const safeHistory = this.validateHistory(history);
    return this.chatbotService.enqueueChat(message, safeHistory, user.sub);
  }

  @Get('job/:jobId')
  @HttpCode(HttpStatus.OK)
  async getChatJobResult(
    @Param('jobId') jobId: string,
  ): Promise<{ status: 'pending' | 'done' | 'failed'; reply?: string }> {
    if (!jobId) throw new NotFoundException('jobId required');
    return this.chatbotService.getChatJobResult(jobId);
  }

  // ── Proactive briefing ────────────────────────────────────────────────────────
  @Get('briefing')
  @HttpCode(HttpStatus.OK)
  async getBriefing(): Promise<Record<string, unknown>> {
    return this.chatbotService.getBriefing();
  }

  // ── Conversation history ──────────────────────────────────────────────────────
  @Get('history')
  @HttpCode(HttpStatus.OK)
  async getHistory(@CurrentUser() user: JwtPayload) {
    return this.chatbotService.getHistory(user.sub);
  }

  @Delete('history')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearHistory(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.chatbotService.clearHistory(user.sub);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private validateHistory(history: unknown): HistoryItem[] {
    if (!Array.isArray(history)) return [];
    return history
      .slice(-6)
      .filter(
        (h): h is HistoryItem =>
          h != null &&
          typeof h.text === 'string' &&
          (h.role === 'user' || h.role === 'assistant'),
      );
  }
}
