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
exports.GuestCreateOrderDto = exports.RequestReturnDto = exports.UpdateDeliveryWorkflowDto = exports.ReorderDto = exports.OrderQueryDto = exports.UpdateShippingDto = exports.AddOrderNoteDto = exports.CancelOrderDto = exports.UpdatePaymentStatusDto = exports.UpdateOrderStatusDto = exports.CreateOrderDto = exports.OrderItemDto = exports.ShippingAddressDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class ShippingAddressDto {
}
exports.ShippingAddressDto = ShippingAddressDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ShippingAddressDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ShippingAddressDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ShippingAddressDto.prototype, "street", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ShippingAddressDto.prototype, "city", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ShippingAddressDto.prototype, "state", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ShippingAddressDto.prototype, "pincode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ShippingAddressDto.prototype, "landmark", void 0);
class OrderItemDto {
}
exports.OrderItemDto = OrderItemDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], OrderItemDto.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderItemDto.prototype, "variantSku", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], OrderItemDto.prototype, "quantity", void 0);
class CreateOrderDto {
}
exports.CreateOrderDto = CreateOrderDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => OrderItemDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateOrderDto.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "cartId", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ShippingAddressDto),
    __metadata("design:type", ShippingAddressDto)
], CreateOrderDto.prototype, "shippingAddress", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['cod', 'prepaid', 'upi', 'card', 'netbanking', 'wallet']),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "couponCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateOrderDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateOrderDto.prototype, "walletAmount", void 0);
class UpdateOrderStatusDto {
}
exports.UpdateOrderStatusDto = UpdateOrderStatusDto;
__decorate([
    (0, class_validator_1.IsEnum)(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded']),
    __metadata("design:type", String)
], UpdateOrderStatusDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateOrderStatusDto.prototype, "message", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateOrderStatusDto.prototype, "updatedBy", void 0);
class UpdatePaymentStatusDto {
}
exports.UpdatePaymentStatusDto = UpdatePaymentStatusDto;
__decorate([
    (0, class_validator_1.IsEnum)(['pending', 'paid', 'failed', 'refunded']),
    __metadata("design:type", String)
], UpdatePaymentStatusDto.prototype, "paymentStatus", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdatePaymentStatusDto.prototype, "transactionId", void 0);
class CancelOrderDto {
}
exports.CancelOrderDto = CancelOrderDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CancelOrderDto.prototype, "reason", void 0);
class AddOrderNoteDto {
}
exports.AddOrderNoteDto = AddOrderNoteDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AddOrderNoteDto.prototype, "note", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AddOrderNoteDto.prototype, "updatedBy", void 0);
class UpdateShippingDto {
}
exports.UpdateShippingDto = UpdateShippingDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateShippingDto.prototype, "awbNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateShippingDto.prototype, "courierName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateShippingDto.prototype, "trackingUrl", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateShippingDto.prototype, "expectedDeliveryDate", void 0);
class OrderQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
        this.sortBy = 'createdAt';
        this.sortOrder = 'desc';
    }
}
exports.OrderQueryDto = OrderQueryDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], OrderQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], OrderQueryDto.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderQueryDto.prototype, "userId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['pending', 'paid', 'failed', 'refunded']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderQueryDto.prototype, "paymentStatus", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderQueryDto.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderQueryDto.prototype, "startDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderQueryDto.prototype, "endDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderQueryDto.prototype, "sortBy", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], OrderQueryDto.prototype, "sortOrder", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], OrderQueryDto.prototype, "forPacking", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], OrderQueryDto.prototype, "forBilling", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], OrderQueryDto.prototype, "forDelivery", void 0);
class ReorderDto {
}
exports.ReorderDto = ReorderDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ReorderDto.prototype, "orderId", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ShippingAddressDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", ShippingAddressDto)
], ReorderDto.prototype, "shippingAddress", void 0);
class UpdateDeliveryWorkflowDto {
}
exports.UpdateDeliveryWorkflowDto = UpdateDeliveryWorkflowDto;
__decorate([
    (0, class_validator_1.IsEnum)(['delivery_done', 'customer_ringing', 'customer_cancelled', 'customer_tomorrow']),
    __metadata("design:type", String)
], UpdateDeliveryWorkflowDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['cash', 'upi']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDeliveryWorkflowDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDeliveryWorkflowDto.prototype, "paymentProofUrl", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDeliveryWorkflowDto.prototype, "note", void 0);
class RequestReturnDto {
}
exports.RequestReturnDto = RequestReturnDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RequestReturnDto.prototype, "reason", void 0);
class GuestCreateOrderDto {
}
exports.GuestCreateOrderDto = GuestCreateOrderDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => OrderItemDto),
    __metadata("design:type", Array)
], GuestCreateOrderDto.prototype, "items", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ShippingAddressDto),
    __metadata("design:type", ShippingAddressDto)
], GuestCreateOrderDto.prototype, "shippingAddress", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['cod', 'prepaid', 'upi', 'card', 'netbanking', 'wallet']),
    __metadata("design:type", String)
], GuestCreateOrderDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GuestCreateOrderDto.prototype, "couponCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GuestCreateOrderDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GuestCreateOrderDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GuestCreateOrderDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GuestCreateOrderDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], GuestCreateOrderDto.prototype, "walletAmount", void 0);
//# sourceMappingURL=order.dto.js.map