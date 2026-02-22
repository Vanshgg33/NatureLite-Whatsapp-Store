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
var ShiprocketService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShiprocketService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const axios_1 = require("axios");
const order_schema_1 = require("../orders/schemas/order.schema");
const notifications_service_1 = require("../notifications/notifications.service");
let ShiprocketService = ShiprocketService_1 = class ShiprocketService {
    constructor(orderModel, configService, notificationsService) {
        this.orderModel = orderModel;
        this.configService = configService;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(ShiprocketService_1.name);
        this.authToken = null;
        this.tokenExpiry = null;
        this.config = this.configService.get('shiprocket');
        this.httpClient = axios_1.default.create({
            baseURL: this.config.apiUrl,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async ensureAuthenticated() {
        if (this.authToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
            return;
        }
        try {
            const response = await this.httpClient.post('/auth/login', {
                email: this.config.email,
                password: this.config.password,
            });
            this.authToken = response.data.token;
            this.tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
            this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;
        }
        catch (error) {
            this.logger.error('Failed to authenticate with Shiprocket', error);
            throw error;
        }
    }
    async createShipment(order) {
        try {
            await this.ensureAuthenticated();
            const orderData = {
                order_id: order.orderNumber,
                order_date: order.createdAt.toISOString().slice(0, 10),
                pickup_location: 'Primary',
                billing_customer_name: order.shippingAddress.name,
                billing_last_name: '',
                billing_address: order.shippingAddress.street,
                billing_city: order.shippingAddress.city,
                billing_pincode: order.shippingAddress.pincode,
                billing_state: order.shippingAddress.state,
                billing_country: 'India',
                billing_email: 'customer@example.com',
                billing_phone: order.shippingAddress.phone,
                shipping_is_billing: true,
                order_items: order.items.map((item) => ({
                    name: item.name,
                    sku: item.variantSku || item.product.toString().slice(-8),
                    units: item.quantity,
                    selling_price: item.price,
                })),
                payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
                sub_total: order.subtotal,
                length: 10,
                breadth: 10,
                height: 10,
                weight: 0.5,
            };
            const response = await this.httpClient.post('/orders/create/adhoc', orderData);
            await this.orderModel.updateOne({ _id: order._id }, {
                $set: {
                    shiprocketOrderId: response.data.order_id.toString(),
                    shiprocketShipmentId: response.data.shipment_id.toString(),
                },
            });
            return response.data;
        }
        catch (error) {
            this.logger.error('Failed to create Shiprocket shipment', error);
            return null;
        }
    }
    async generateAwb(shipmentId, courierId) {
        try {
            await this.ensureAuthenticated();
            const response = await this.httpClient.post('/courier/assign/awb', {
                shipment_id: shipmentId,
                courier_id: courierId,
            });
            const awbCode = response.data.response?.data?.awb_code;
            const courierName = response.data.response?.data?.courier_name;
            if (awbCode) {
                await this.orderModel.updateOne({ shiprocketShipmentId: shipmentId }, {
                    $set: {
                        awbNumber: awbCode,
                        courierName,
                        trackingUrl: `https://shiprocket.co/tracking/${awbCode}`,
                    },
                });
            }
            return awbCode || null;
        }
        catch (error) {
            this.logger.error('Failed to generate AWB', error);
            return null;
        }
    }
    async getTrackingInfo(awbNumber) {
        try {
            await this.ensureAuthenticated();
            const response = await this.httpClient.get(`/courier/track/awb/${awbNumber}`);
            return response.data.tracking_data;
        }
        catch (error) {
            this.logger.error('Failed to get tracking info', error);
            return null;
        }
    }
    async handleWebhook(payload) {
        try {
            const order = await this.orderModel.findOne({ awbNumber: payload.awb });
            if (!order) {
                this.logger.warn(`Order not found for AWB: ${payload.awb}`);
                return;
            }
            const statusMap = {
                '6': 'shipped',
                '17': 'out_for_delivery',
                '7': 'delivered',
                '8': 'cancelled',
                '9': 'returned',
                '10': 'returned',
            };
            const newStatus = statusMap[payload.current_status];
            if (newStatus && newStatus !== order.status) {
                order.status = newStatus;
                order.timeline.push({
                    status: newStatus,
                    message: `Shipment ${newStatus}`,
                    timestamp: new Date(),
                    metadata: { shiprocketStatus: payload.current_status },
                });
                if (payload.etd) {
                    order.expectedDeliveryDate = new Date(payload.etd);
                }
                if (newStatus === 'delivered') {
                    order.deliveredAt = new Date();
                }
                await order.save();
                const phone = order.shippingAddress.phone;
                switch (newStatus) {
                    case 'shipped':
                        await this.notificationsService.sendShippingUpdate(order, phone, payload.awb, order.courierName || 'Courier');
                        break;
                    case 'out_for_delivery':
                        await this.notificationsService.sendOutForDelivery(order, phone);
                        break;
                    case 'delivered':
                        await this.notificationsService.sendDeliveryConfirmation(order, phone);
                        break;
                }
            }
        }
        catch (error) {
            this.logger.error('Failed to process Shiprocket webhook', error);
        }
    }
    async cancelShipment(shipmentId) {
        try {
            await this.ensureAuthenticated();
            await this.httpClient.post('/orders/cancel', {
                ids: [shipmentId],
            });
            return true;
        }
        catch (error) {
            this.logger.error('Failed to cancel shipment', error);
            return false;
        }
    }
    async getShippingRates(pickupPincode, deliveryPincode, weight, cod = false) {
        try {
            await this.ensureAuthenticated();
            const response = await this.httpClient.get('/courier/serviceability/', {
                params: {
                    pickup_postcode: pickupPincode,
                    delivery_postcode: deliveryPincode,
                    weight,
                    cod: cod ? 1 : 0,
                },
            });
            const couriers = response.data.data?.available_courier_companies || [];
            return couriers.map((courier) => ({
                id: courier.courier_company_id.toString(),
                courier: courier.courier_name,
                rate: courier.rate,
                estimatedDays: courier.estimated_delivery_days,
            }));
        }
        catch (error) {
            this.logger.error('Failed to get shipping rates', error);
            return [];
        }
    }
};
exports.ShiprocketService = ShiprocketService;
exports.ShiprocketService = ShiprocketService = ShiprocketService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(order_schema_1.Order.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        config_1.ConfigService,
        notifications_service_1.NotificationsService])
], ShiprocketService);
//# sourceMappingURL=shiprocket.service.js.map