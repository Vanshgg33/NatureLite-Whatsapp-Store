import { SessionState } from './schemas/chat-session.schema';
export interface FlowAction {
    type: 'text' | 'buttons' | 'list' | 'template';
    content: string;
    buttons?: Array<{
        id: string;
        title: string;
    }>;
    sections?: Array<{
        title: string;
        rows: Array<{
            id: string;
            title: string;
            description?: string;
        }>;
    }>;
    templateName?: string;
    templateParams?: string[];
}
export interface FlowStep {
    state: SessionState;
    action: FlowAction;
    transitions: Record<string, SessionState | {
        state: SessionState;
        action?: string;
    }>;
}
export declare const CHATBOT_FLOWS: Record<SessionState, FlowStep>;
export declare const FAQ_RESPONSES: Record<string, string>;
