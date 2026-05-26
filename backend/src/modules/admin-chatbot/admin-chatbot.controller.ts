import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminChatbotService } from './admin-chatbot.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('admin/chatbot')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminChatbotController {
  constructor(private readonly chatbotService: AdminChatbotService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body('message') message: string,
  ): Promise<{ reply: string }> {
    if (!message || typeof message !== 'string') {
      return { reply: '⚠️ Please provide a valid chat message.' };
    }
    return this.chatbotService.chat(message);
  }
}
