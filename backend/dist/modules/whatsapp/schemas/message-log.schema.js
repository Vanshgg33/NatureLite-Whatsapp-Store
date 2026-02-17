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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageLogSchema = exports.MessageLog = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let MessageLog = class MessageLog {
};
exports.MessageLog = MessageLog;
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", String)
], MessageLog.prototype, "phone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], MessageLog.prototype, "user", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'ChatSession' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], MessageLog.prototype, "session", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], MessageLog.prototype, "direction", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], MessageLog.prototype, "messageType", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], MessageLog.prototype, "whatsappMessageId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], MessageLog.prototype, "content", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'sent' }),
    __metadata("design:type", String)
], MessageLog.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], MessageLog.prototype, "failureReason", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], MessageLog.prototype, "retryCount", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], MessageLog.prototype, "deliveredAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], MessageLog.prototype, "readAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], MessageLog.prototype, "metadata", void 0);
exports.MessageLog = MessageLog = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], MessageLog);
exports.MessageLogSchema = mongoose_1.SchemaFactory.createForClass(MessageLog);
exports.MessageLogSchema.index({ phone: 1, createdAt: -1 });
exports.MessageLogSchema.index({ session: 1, createdAt: -1 });
exports.MessageLogSchema.index({ whatsappMessageId: 1 });
exports.MessageLogSchema.index({ direction: 1, createdAt: -1 });
exports.MessageLogSchema.index({ status: 1 });
//# sourceMappingURL=message-log.schema.js.map