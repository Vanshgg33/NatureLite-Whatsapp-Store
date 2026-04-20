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
        };
        button?: { text: string; payload: string };
        /** Delivered when the customer sends their WhatsApp cart. */
        order?: {
          catalog_id: string;
          text?: string;
          product_items?: Array<{
            product_retailer_id: string;
            quantity: number;
            item_price: number;
            currency: string;
          }>;
        };
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
    templateName?: string;
    templateParams?: string[];
    location?: {
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    };
    /** Single-product catalog message — retailer_id the bot showed. */
    catalogProductId?: string;
    /** Product-list catalog message — flat list of all retailer_ids shown. */
    catalogProductIds?: string[];
    /** Inbound "order" (native WhatsApp cart submission). */
    order?: {
      catalogId: string;
      text?: string;
      items: Array<{
        productRetailerId: string;
        quantity: number;
        itemPrice: number;
        currency: string;
      }>;
    };
  };
  contactName?: string;
}

export class UpdateContactNameDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

/**
 * Single-product catalog message. Renders as a WhatsApp product card with
 * image, price, and a native "View" button that opens the full product detail
 * + quantity stepper + Add-to-cart flow inside WhatsApp itself.
 */
export class SendSingleProductDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  bodyText?: string;

  @IsString()
  @IsOptional()
  footerText?: string;

  /** Meta Commerce catalog id. Falls back to META_CATALOG_ID env if omitted. */
  @IsString()
  @IsOptional()
  catalogId?: string;

  /** Maps to our product._id — matches the retailer_id synced in Phase 1. */
  @IsString()
  @IsNotEmpty()
  productRetailerId: string;

  @IsObject()
  @IsOptional()
  meta?: OutboundMessageMetaDto;
}

/**
 * Multi-product catalog message. Meta caps this at 30 products across up to
 * 10 sections per message. Customer sees an image-rich grouped list, taps
 * products to add to the native WhatsApp cart, then taps Send to return the
 * cart as an inbound "order" webhook (handled in Phase 3).
 */
export class SendProductListDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  /** Required by Meta for product_list; shown as the card title. Max 60 chars. */
  @IsString()
  @IsNotEmpty()
  headerText: string;

  /** Required. Max 1024 chars. */
  @IsString()
  @IsNotEmpty()
  bodyText: string;

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsString()
  @IsOptional()
  catalogId?: string;

  @IsArray()
  sections: Array<{
    title: string;
    productItems: Array<{ productRetailerId: string }>;
  }>;

  @IsObject()
  @IsOptional()
  meta?: OutboundMessageMetaDto;
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
