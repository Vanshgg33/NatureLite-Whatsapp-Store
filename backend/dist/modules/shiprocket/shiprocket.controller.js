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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShiprocketController = void 0;
const common_1 = require("@nestjs/common");
const shiprocket_service_1 = require("./shiprocket.service");
const orders_service_1 = require("../orders/orders.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
let ShiprocketController = class ShiprocketController {
    constructor(shiprocketService, ordersService) {
        this.shiprocketService = shiprocketService;
        this.ordersService = ordersService;
    }
    async createShipment(orderId) {
        const order = await this.ordersService.findById(orderId);
        const result = await this.shiprocketService.createShipment(order);
        return {
            success: !!result,
            data: result,
        };
    }
    async generateAwb(shipmentId, courierId) {
        const awb = await this.shiprocketService.generateAwb(shipmentId, courierId);
        return {
            success: !!awb,
            awb: awb || undefined,
        };
    }
    async handleWebhook(payload) {
        await this.shiprocketService.handleWebhook(payload);
        return { received: true };
    }
    async cancelShipment(shipmentId) {
        const success = await this.shiprocketService.cancelShipment(shipmentId);
        return { success };
    }
    async trackShipment(awbNumber) {
        return this.shiprocketService.getTrackingInfo(awbNumber);
    }
    async getShippingRates(body) {
        return this.shiprocketService.getShippingRates(body.pickupPincode, body.deliveryPincode, body.weight, body.cod || false);
    }
};
exports.ShiprocketController = ShiprocketController;
__decorate([
    (0, common_1.Post)('orders/:orderId/ship'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Param)('orderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ShiprocketController.prototype, "createShipment", null);
__decorate([
    (0, common_1.Post)('shipments/:shipmentId/awb'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Param)('shipmentId')),
    __param(1, (0, common_1.Body)('courierId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], ShiprocketController.prototype, "generateAwb", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ShiprocketController.prototype, "handleWebhook", null);
__decorate([
    (0, common_1.Post)('shipments/:shipmentId/cancel'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'superadmin'),
    __param(0, (0, common_1.Param)('shipmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ShiprocketController.prototype, "cancelShipment", null);
__decorate([
    (0, common_1.Get)('track/:awbNumber'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('awbNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ShiprocketController.prototype, "trackShipment", null);
__decorate([
    (0, common_1.Post)('rates'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ShiprocketController.prototype, "getShippingRates", null);
exports.ShiprocketController = ShiprocketController = __decorate([
    (0, common_1.Controller)('shiprocket'),
    __metadata("design:paramtypes", [shiprocket_service_1.ShiprocketService,
        orders_service_1.OrdersService])
], ShiprocketController);
//# sourceMappingURL=shiprocket.controller.js.map