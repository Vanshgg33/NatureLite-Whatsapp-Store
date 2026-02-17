"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WhatsAppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const axios_1 = require("axios");
const crypto = require("crypto");
const message_log_schema_1 = require("./schemas/message-log.schema");
let WhatsAppService = WhatsAppService_1 = class WhatsAppService {
    constructor(messageLogModel, configService) {
        this.messageLogModel = messageLogModel;
        this.configService = configService;
        this.logger = new common_1.Logger(WhatsAppService_1.name);
        this.config = this.configService.get('whatsapp');
        this.httpClient = axios_1.default.create({
            baseURL: `${this.config.apiUrl}/${this.config.phoneNumberId}`,
            headers: {
                Authorization: `Bearer ${this.config.accessToken}`,
                'Content-Type': 'application/json',
            },
        });
    }
    verifyWebhook(mode, token, challenge) {
        if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
            this.logger.log('Webhook verified successfully');
            return challenge;
        }
        this.logger.warn('Webhook verification failed');
        return null;
    }
    verifySignature(payload, signature) {
        const expectedSignature = crypto
            .createHmac('sha256', this.config.appSecret)
            .update(payload)
            .digest('hex');
        return `sha256=${expectedSignature}` === signature;
    }
    async processWebhook(payload) {
        const messages = [];
        for (const entry of payload.entry) {
            for (const change of entry.changes) {
                if (change.field !== 'messages')
                    continue;
                const value = change.value;
                if (value.statuses) {
                    for (const status of value.statuses) {
                        await this.updateMessageStatus(status.id, status.status, status.timestamp);
                    }
                }
                if (value.messages) {
                    for (const msg of value.messages) {
                        const contactName = value.contacts?.[0]?.profile?.name;
                        const whatsappMessage = this.parseInboundMessage(msg, contactName);
                        if (whatsappMessage) {
                            await this.logMessage(whatsappMessage, 'inbound');
                            messages.push(whatsappMessage);
                        }
                    }
                }
            }
        }
        return messages;
    }
    parseInboundMessage(msg, contactName) {
        const baseMessage = {
            phone: msg.from,
            messageId: msg.id,
            timestamp: new Date(parseInt(msg.timestamp, 10) * 1000),
            type: msg.type,
            content: {},
            contactName,
        };
        switch (msg.type) {
            case 'text':
                baseMessage.content.text = msg.text?.body;
                break;
            case 'image':
            case 'video':
            case 'audio':
            case 'document':
                const media = msg[msg.type];
                if (media) {
                    baseMessage.content.mediaId = media.id;
                    baseMessage.content.caption = 'caption' in media ? media.caption : undefined;
                }
                break;
            case 'location':
                if (msg.location) {
                    baseMessage.content.location = {
                        latitude: msg.location.latitude,
                        longitude: msg.location.longitude,
                        name: msg.location.name,
                        address: msg.location.address,
                    };
                }
                break;
            case 'interactive':
                if (msg.interactive?.type === 'button_reply' && msg.interactive.button_reply) {
                    baseMessage.content.buttonId = msg.interactive.button_reply.id;
                    baseMessage.content.buttonText = msg.interactive.button_reply.title;
                }
                else if (msg.interactive?.type === 'list_reply' && msg.interactive.list_reply) {
                    baseMessage.content.listId = msg.interactive.list_reply.id;
                    baseMessage.content.listTitle = msg.interactive.list_reply.title;
                }
                break;
            case 'button':
                if (msg.button) {
                    baseMessage.content.buttonId = msg.button.payload;
                    baseMessage.content.buttonText = msg.button.text;
                }
                break;
            default:
                return null;
        }
        return baseMessage;
    }
    async sendTextMessage(dto) {
        try {
            const response = await this.httpClient.post('/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: dto.phone,
                type: 'text',
                text: {
                    preview_url: !!dto.previewUrl,
                    body: dto.message,
                },
            });
            const messageId = response.data.messages?.[0]?.id;
            if (messageId) {
                await this.logMessage({
                    phone: dto.phone,
                    messageId,
                    timestamp: new Date(),
                    type: 'text',
                    content: { text: dto.message },
                }, 'outbound');
            }
            return messageId || null;
        }
        catch (error) {
            this.logger.error('Failed to send text message', error);
            return null;
        }
    }
    async sendTemplateMessage(dto) {
        try {
            const components = [];
            if (dto.headerParams && dto.headerParams.length > 0) {
                components.push({
                    type: 'header',
                    parameters: dto.headerParams.map((text) => ({ type: 'text', text })),
                });
            }
            if (dto.bodyParams && dto.bodyParams.length > 0) {
                components.push({
                    type: 'body',
                    parameters: dto.bodyParams.map((text) => ({ type: 'text', text })),
                });
            }
            if (dto.buttonParams && dto.buttonParams.length > 0) {
                dto.buttonParams.forEach((param, index) => {
                    components.push({
                        type: 'button',
                        sub_type: 'quick_reply',
                        index,
                        parameters: [{ type: 'payload', payload: param }],
                    });
                });
            }
            const response = await this.httpClient.post('/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: dto.phone,
                type: 'template',
                template: {
                    name: dto.templateName,
                    language: { code: dto.languageCode || 'en' },
                    components: components.length > 0 ? components : undefined,
                },
            });
            const messageId = response.data.messages?.[0]?.id;
            if (messageId) {
                await this.logMessage({
                    phone: dto.phone,
                    messageId,
                    timestamp: new Date(),
                    type: 'template',
                    content: {
                        templateName: dto.templateName,
                        templateParams: dto.bodyParams,
                    },
                }, 'outbound');
            }
            return messageId || null;
        }
        catch (error) {
            this.logger.error('Failed to send template message', error);
            return null;
        }
    }
    async sendInteractiveButtons(dto) {
        try {
            const buttons = dto.buttons.slice(0, 3).map((btn) => ({
                type: 'reply',
                reply: { id: btn.id, title: btn.title.slice(0, 20) },
            }));
            const response = await this.httpClient.post('/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: dto.phone,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    header: dto.headerText ? { type: 'text', text: dto.headerText } : undefined,
                    body: { text: dto.bodyText },
                    footer: dto.footerText ? { text: dto.footerText } : undefined,
                    action: { buttons },
                },
            });
            const messageId = response.data.messages?.[0]?.id;
            if (messageId) {
                await this.logMessage({
                    phone: dto.phone,
                    messageId,
                    timestamp: new Date(),
                    type: 'interactive',
                    content: { text: dto.bodyText },
                }, 'outbound');
            }
            return messageId || null;
        }
        catch (error) {
            this.logger.error('Failed to send interactive buttons', error);
            return null;
        }
    }
    async sendInteractiveList(dto) {
        try {
            const sections = dto.sections.map((section) => ({
                title: section.title,
                rows: section.rows.slice(0, 10).map((row) => ({
                    id: row.id,
                    title: row.title.slice(0, 24),
                    description: row.description?.slice(0, 72),
                })),
            }));
            const response = await this.httpClient.post('/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: dto.phone,
                type: 'interactive',
                interactive: {
                    type: 'list',
                    header: dto.headerText ? { type: 'text', text: dto.headerText } : undefined,
                    body: { text: dto.bodyText },
                    footer: dto.footerText ? { text: dto.footerText } : undefined,
                    action: {
                        button: dto.buttonText.slice(0, 20),
                        sections,
                    },
                },
            });
            const messageId = response.data.messages?.[0]?.id;
            if (messageId) {
                await this.logMessage({
                    phone: dto.phone,
                    messageId,
                    timestamp: new Date(),
                    type: 'interactive',
                    content: { text: dto.bodyText },
                }, 'outbound');
            }
            return messageId || null;
        }
        catch (error) {
            this.logger.error('Failed to send interactive list', error);
            return null;
        }
    }
    async sendMediaMessage(dto) {
        try {
            const mediaObject = {
                link: dto.mediaUrl,
            };
            if (dto.caption) {
                mediaObject.caption = dto.caption;
            }
            if (dto.filename && dto.mediaType === 'document') {
                mediaObject.filename = dto.filename;
            }
            const response = await this.httpClient.post('/messages', {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: dto.phone,
                type: dto.mediaType,
                [dto.mediaType]: mediaObject,
            });
            const messageId = response.data.messages?.[0]?.id;
            if (messageId) {
                await this.logMessage({
                    phone: dto.phone,
                    messageId,
                    timestamp: new Date(),
                    type: dto.mediaType,
                    content: { mediaUrl: dto.mediaUrl, caption: dto.caption },
                }, 'outbound');
            }
            return messageId || null;
        }
        catch (error) {
            this.logger.error('Failed to send media message', error);
            return null;
        }
    }
    async getMediaUrl(mediaId) {
        try {
            const response = await this.httpClient.get(`/${mediaId}`);
            return response.data.url;
        }
        catch (error) {
            this.logger.error('Failed to get media URL', error);
            return null;
        }
    }
    async logMessage(message, direction) {
        try {
            const log = new this.messageLogModel({
                phone: message.phone,
                direction,
                messageType: message.type,
                whatsappMessageId: message.messageId,
                content: message.content,
                status: direction === 'outbound' ? 'sent' : undefined,
            });
            await log.save();
        }
        catch (error) {
            this.logger.error('Failed to log message', error);
        }
    }
    async updateMessageStatus(messageId, status, timestamp) {
        try {
            const updateData = { status };
            if (status === 'delivered') {
                updateData.deliveredAt = new Date(parseInt(timestamp, 10) * 1000);
            }
            else if (status === 'read') {
                updateData.readAt = new Date(parseInt(timestamp, 10) * 1000);
            }
            await this.messageLogModel.updateOne({ whatsappMessageId: messageId }, { $set: updateData });
        }
        catch (error) {
            this.logger.error('Failed to update message status', error);
        }
    }
    async getMessageLogs(phone, limit = 50) {
        return this.messageLogModel
            .find({ phone })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    }
};
exports.WhatsAppService = WhatsAppService;
exports.WhatsAppService = WhatsAppService = WhatsAppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(message_log_schema_1.MessageLog.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        config_1.ConfigService])
], WhatsAppService);
//# sourceMappingURL=whatsapp.service.js.map