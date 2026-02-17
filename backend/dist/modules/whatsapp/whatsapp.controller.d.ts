import { RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { SendTextMessageDto, SendTemplateMessageDto, SendInteractiveButtonDto, SendInteractiveListDto, SendMediaMessageDto, WebhookPayload } from './dto/whatsapp.dto';
export declare class WhatsAppController {
    private readonly whatsappService;
    private readonly chatbotService;
    private readonly logger;
    constructor(whatsappService: WhatsAppService, chatbotService: ChatbotService);
    verifyWebhook(mode: string, token: string, challenge: string, res: Response): void;
    handleWebhook(req: RawBodyRequest<Request>, body: WebhookPayload, res: Response): Promise<void>;
    sendTextMessage(dto: SendTextMessageDto): Promise<{
        messageId: string | null;
    }>;
    sendTemplateMessage(dto: SendTemplateMessageDto): Promise<{
        messageId: string | null;
    }>;
    sendInteractiveButtons(dto: SendInteractiveButtonDto): Promise<{
        messageId: string | null;
    }>;
    sendInteractiveList(dto: SendInteractiveListDto): Promise<{
        messageId: string | null;
    }>;
    sendMediaMessage(dto: SendMediaMessageDto): Promise<{
        messageId: string | null;
    }>;
    getMessageLogs(phone: string, limit?: string): Promise<unknown[]>;
}
