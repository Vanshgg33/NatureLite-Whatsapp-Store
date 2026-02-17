import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { MessageLogDocument } from './schemas/message-log.schema';
import { SendTextMessageDto, SendTemplateMessageDto, SendInteractiveButtonDto, SendInteractiveListDto, SendMediaMessageDto, WebhookPayload, WhatsAppMessage } from './dto/whatsapp.dto';
export declare class WhatsAppService {
    private messageLogModel;
    private configService;
    private readonly logger;
    private readonly httpClient;
    private readonly config;
    constructor(messageLogModel: Model<MessageLogDocument>, configService: ConfigService);
    verifyWebhook(mode: string, token: string, challenge: string): string | null;
    verifySignature(payload: string, signature: string): boolean;
    processWebhook(payload: WebhookPayload): Promise<WhatsAppMessage[]>;
    private parseInboundMessage;
    sendTextMessage(dto: SendTextMessageDto): Promise<string | null>;
    sendTemplateMessage(dto: SendTemplateMessageDto): Promise<string | null>;
    sendInteractiveButtons(dto: SendInteractiveButtonDto): Promise<string | null>;
    sendInteractiveList(dto: SendInteractiveListDto): Promise<string | null>;
    sendMediaMessage(dto: SendMediaMessageDto): Promise<string | null>;
    getMediaUrl(mediaId: string): Promise<string | null>;
    private logMessage;
    private updateMessageStatus;
    getMessageLogs(phone: string, limit?: number): Promise<MessageLogDocument[]>;
}
