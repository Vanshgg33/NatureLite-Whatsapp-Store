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
var WhatsAppController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppController = void 0;
const common_1 = require("@nestjs/common");
const whatsapp_service_1 = require("./whatsapp.service");
const chatbot_service_1 = require("../chatbot/chatbot.service");
const whatsapp_dto_1 = require("./dto/whatsapp.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
let WhatsAppController = WhatsAppController_1 = class WhatsAppController {
    constructor(whatsappService, chatbotService) {
        this.whatsappService = whatsappService;
        this.chatbotService = chatbotService;
        this.logger = new common_1.Logger(WhatsAppController_1.name);
    }
    verifyWebhook(mode, token, challenge, res) {
        const result = this.whatsappService.verifyWebhook(mode, token, challenge);
        if (result) {
            res.status(200).send(result);
        }
        else {
            res.status(403).send('Verification failed');
        }
    }
    async handleWebhook(req, body, res) {
        const signature = req.headers['x-hub-signature-256'];
        if (signature && req.rawBody) {
            const isValid = this.whatsappService.verifySignature(req.rawBody.toString(), signature);
            if (!isValid) {
                this.logger.warn('Invalid webhook signature');
                res.status(401).send('Invalid signature');
                return;
            }
        }
        res.status(200).send('OK');
        try {
            const messages = await this.whatsappService.processWebhook(body);
            for (const message of messages) {
                await this.chatbotService.handleMessage(message);
            }
        }
        catch (error) {
            this.logger.error('Error processing webhook', error);
        }
    }
    async sendTextMessage(dto) {
        const messageId = await this.whatsappService.sendTextMessage(dto);
        return { messageId };
    }
    async sendTemplateMessage(dto) {
        const messageId = await this.whatsappService.sendTemplateMessage(dto);
        return { messageId };
    }
    async sendInteractiveButtons(dto) {
        const messageId = await this.whatsappService.sendInteractiveButtons(dto);
        return { messageId };
    }
    async sendInteractiveList(dto) {
        const messageId = await this.whatsappService.sendInteractiveList(dto);
        return { messageId };
    }
    async sendMediaMessage(dto) {
        const messageId = await this.whatsappService.sendMediaMessage(dto);
        return { messageId };
    }
    async getMessageLogs(phone, limit) {
        return this.whatsappService.getMessageLogs(phone, limit ? parseInt(limit, 10) : 50);
    }
};
exports.WhatsAppController = WhatsAppController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('webhook'),
    __param(0, (0, common_1.Query)('hub.mode')),
    __param(1, (0, common_1.Query)('hub.verify_token')),
    __param(2, (0, common_1.Query)('hub.challenge')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], WhatsAppController.prototype, "verifyWebhook", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "handleWebhook", null);
__decorate([
    (0, common_1.Post)('send/text'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [whatsapp_dto_1.SendTextMessageDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "sendTextMessage", null);
__decorate([
    (0, common_1.Post)('send/template'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [whatsapp_dto_1.SendTemplateMessageDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "sendTemplateMessage", null);
__decorate([
    (0, common_1.Post)('send/buttons'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [whatsapp_dto_1.SendInteractiveButtonDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "sendInteractiveButtons", null);
__decorate([
    (0, common_1.Post)('send/list'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [whatsapp_dto_1.SendInteractiveListDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "sendInteractiveList", null);
__decorate([
    (0, common_1.Post)('send/media'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [whatsapp_dto_1.SendMediaMessageDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "sendMediaMessage", null);
__decorate([
    (0, common_1.Get)('messages/:phone'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Query)('phone')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "getMessageLogs", null);
exports.WhatsAppController = WhatsAppController = WhatsAppController_1 = __decorate([
    (0, common_1.Controller)('whatsapp'),
    __metadata("design:paramtypes", [whatsapp_service_1.WhatsAppService,
        chatbot_service_1.ChatbotService])
], WhatsAppController);
//# sourceMappingURL=whatsapp.controller.js.map