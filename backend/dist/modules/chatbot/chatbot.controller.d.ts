import { ChatbotService } from './chatbot.service';
import { ChatSession } from './schemas/chat-session.schema';
export declare class ChatbotController {
    private readonly chatbotService;
    constructor(chatbotService: ChatbotService);
    getSession(phone: string): Promise<ChatSession | null>;
    resetSession(phone: string): Promise<{
        message: string;
    }>;
}
