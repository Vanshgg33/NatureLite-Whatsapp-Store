export declare class SendTextMessageDto {
    phone: string;
    message: string;
    previewUrl?: string;
}
export declare class SendTemplateMessageDto {
    phone: string;
    templateName: string;
    languageCode?: string;
    headerParams?: string[];
    bodyParams?: string[];
    buttonParams?: string[];
}
export declare class SendInteractiveButtonDto {
    phone: string;
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttons: Array<{
        id: string;
        title: string;
    }>;
}
export declare class SendInteractiveListDto {
    phone: string;
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttonText: string;
    sections: Array<{
        title: string;
        rows: Array<{
            id: string;
            title: string;
            description?: string;
        }>;
    }>;
}
export declare class SendMediaMessageDto {
    phone: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    mediaUrl: string;
    caption?: string;
    filename?: string;
}
export interface WebhookEntry {
    id: string;
    changes: Array<{
        value: {
            messaging_product: string;
            metadata: {
                display_phone_number: string;
                phone_number_id: string;
            };
            contacts?: Array<{
                profile: {
                    name: string;
                };
                wa_id: string;
            }>;
            messages?: Array<{
                from: string;
                id: string;
                timestamp: string;
                type: string;
                text?: {
                    body: string;
                };
                image?: {
                    id: string;
                    mime_type: string;
                    sha256: string;
                    caption?: string;
                };
                document?: {
                    id: string;
                    mime_type: string;
                    sha256: string;
                    filename: string;
                    caption?: string;
                };
                audio?: {
                    id: string;
                    mime_type: string;
                    sha256: string;
                };
                video?: {
                    id: string;
                    mime_type: string;
                    sha256: string;
                    caption?: string;
                };
                location?: {
                    latitude: number;
                    longitude: number;
                    name?: string;
                    address?: string;
                };
                interactive?: {
                    type: 'button_reply' | 'list_reply';
                    button_reply?: {
                        id: string;
                        title: string;
                    };
                    list_reply?: {
                        id: string;
                        title: string;
                        description?: string;
                    };
                };
                button?: {
                    text: string;
                    payload: string;
                };
            }>;
            statuses?: Array<{
                id: string;
                status: 'sent' | 'delivered' | 'read' | 'failed';
                timestamp: string;
                recipient_id: string;
                errors?: Array<{
                    code: number;
                    title: string;
                }>;
            }>;
        };
        field: string;
    }>;
}
export interface WebhookPayload {
    object: string;
    entry: WebhookEntry[];
}
export interface WhatsAppMessage {
    phone: string;
    messageId: string;
    timestamp: Date;
    type: string;
    content: {
        text?: string;
        mediaId?: string;
        mediaUrl?: string;
        caption?: string;
        buttonId?: string;
        buttonText?: string;
        listId?: string;
        listTitle?: string;
        templateName?: string;
        templateParams?: string[];
        location?: {
            latitude: number;
            longitude: number;
            name?: string;
            address?: string;
        };
    };
    contactName?: string;
}
export declare class BroadcastMessageDto {
    phones: string[];
    templateName: string;
    bodyParams?: string[];
    languageCode?: string;
}
