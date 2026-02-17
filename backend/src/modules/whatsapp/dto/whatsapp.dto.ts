import { IsString, IsNotEmpty, IsOptional, IsArray, IsObject, IsEnum } from 'class-validator';

export class SendTextMessageDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  previewUrl?: string;
}

export class SendTemplateMessageDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  templateName: string;

  @IsString()
  @IsOptional()
  languageCode?: string;

  @IsArray()
  @IsOptional()
  headerParams?: string[];

  @IsArray()
  @IsOptional()
  bodyParams?: string[];

  @IsArray()
  @IsOptional()
  buttonParams?: string[];
}

export class SendInteractiveButtonDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  headerText?: string;

  @IsString()
  @IsNotEmpty()
  bodyText: string;

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsArray()
  buttons: Array<{
    id: string;
    title: string;
  }>;
}

export class SendInteractiveListDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  headerText?: string;

  @IsString()
  @IsNotEmpty()
  bodyText: string;

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsString()
  @IsNotEmpty()
  buttonText: string;

  @IsArray()
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
}

export class SendMediaMessageDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEnum(['image', 'video', 'audio', 'document'])
  mediaType: 'image' | 'video' | 'audio' | 'document';

  @IsString()
  @IsNotEmpty()
  mediaUrl: string;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  @IsOptional()
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
        profile: { name: string };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: { id: string; mime_type: string; sha256: string; caption?: string };
        document?: { id: string; mime_type: string; sha256: string; filename: string; caption?: string };
        audio?: { id: string; mime_type: string; sha256: string };
        video?: { id: string; mime_type: string; sha256: string; caption?: string };
        location?: { latitude: number; longitude: number; name?: string; address?: string };
        interactive?: {
          type: 'button_reply' | 'list_reply';
          button_reply?: { id: string; title: string };
          list_reply?: { id: string; title: string; description?: string };
        };
        button?: { text: string; payload: string };
      }>;
      statuses?: Array<{
        id: string;
        status: 'sent' | 'delivered' | 'read' | 'failed';
        timestamp: string;
        recipient_id: string;
        errors?: Array<{ code: number; title: string }>;
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

export class BroadcastMessageDto {
  @IsArray()
  @IsString({ each: true })
  phones: string[];

  @IsString()
  @IsNotEmpty()
  templateName: string;

  @IsArray()
  @IsOptional()
  bodyParams?: string[];

  @IsString()
  @IsOptional()
  languageCode?: string;
}
