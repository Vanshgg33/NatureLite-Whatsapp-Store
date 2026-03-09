import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatSession } from './schemas/chat-session.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('chatbot')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Get('session/:phone')
  async getSession(@Param('phone') phone: string): Promise<ChatSession | null> {
    return this.chatbotService.getSession(phone);
  }

  @Post('session/:phone/reset')
  async resetSession(@Param('phone') phone: string): Promise<{ message: string }> {
    await this.chatbotService.resetSession(phone);
    return { message: 'Session reset successfully' };
  }
}
