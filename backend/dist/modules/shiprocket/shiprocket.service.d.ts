import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { NotificationsService } from '../notifications/notifications.service';
interface ShiprocketOrderResponse {
    order_id: number;
    shipment_id: number;
    status: string;
    awb_code?: string;
    courier_name?: string;
}
interface ShiprocketWebhookPayload {
    awb: string;
    current_status: string;
    shipment_id: number;
    order_id: number;
    etd?: string;
}
export declare class ShiprocketService {
    private orderModel;
    private configService;
    private notificationsService;
    private readonly logger;
    private readonly config;
    private httpClient;
    private authToken;
    private tokenExpiry;
    constructor(orderModel: Model<OrderDocument>, configService: ConfigService, notificationsService: NotificationsService);
    private ensureAuthenticated;
    createShipment(order: Order): Promise<ShiprocketOrderResponse | null>;
    generateAwb(shipmentId: string, courierId?: number): Promise<string | null>;
    getTrackingInfo(awbNumber: string): Promise<Record<string, unknown> | null>;
    handleWebhook(payload: ShiprocketWebhookPayload): Promise<void>;
    cancelShipment(shipmentId: string): Promise<boolean>;
}
export {};
