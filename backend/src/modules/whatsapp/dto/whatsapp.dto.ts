import { IsString, IsNotEmpty, IsOptional, IsArray, IsObject, IsEnum } from 'class-validator';

class OutboundMessageMetaDto {
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

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

  @IsObject()
  @IsOptional()
  meta?: OutboundMessageMetaDto;
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

  @IsArray()
  @IsOptional()
  urlButtonParams?: string[];

  @IsObject()
  @IsOptional()
  meta?: OutboundMessageMetaDto;
}

export class SendInteractiveButtonDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  headerText?: string;

  @IsString()
  @IsOptional()
  headerImageUrl?: string;

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

  @IsObject()
  @IsOptional()
  meta?: OutboundMessageMetaDto;
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

  @IsObject()
  @IsOptional()
  meta?: OutboundMessageMetaDto;
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

  @IsObject()
  @IsOptional()
  meta?: OutboundMessageMetaDto;
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
          product?: { product_retailer_id: string; quantity?: number; item_price?: number | string; currency?: string };
          product_list_reply?: { title?: string; description?: string; product_items?: Array<{ product_retailer_id: string; quantity?: number; item_price?: number | string; currency?: string }> };
        };
        button?: { text: string; payload: string };
        order?: { catalog_id?: string; text?: string; product_items?: Array<{ product_retailer_id: string; quantity?: number; item_price?: number | string; currency?: string }> };
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

/** 360Dialog sends a flat payload without the Meta Cloud API wrapper. */
export interface FlatWebhookPayload {
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: NonNullable<WebhookPayload['entry'][0]['changes'][0]['value']['messages']>;
  statuses?: WebhookPayload['entry'][0]['changes'][0]['value']['statuses'];
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
    productRetailerId?: string;
    productItems?: Array<{ productRetailerId: string; quantity?: number; itemPrice?: number; currency?: string }>;
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

export class UpdateContactNameDto {
  @IsString()
  @IsNotEmpty()
  name: string;
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
