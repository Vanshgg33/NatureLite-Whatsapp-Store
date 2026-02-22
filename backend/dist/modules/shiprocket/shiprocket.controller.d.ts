import { ShiprocketService } from './shiprocket.service';
import { OrdersService } from '../orders/orders.service';
export declare class ShiprocketController {
    private readonly shiprocketService;
    private readonly ordersService;
    constructor(shiprocketService: ShiprocketService, ordersService: OrdersService);
    createShipment(orderId: string): Promise<{
        success: boolean;
        data?: unknown;
    }>;
    generateAwb(shipmentId: string, courierId?: number): Promise<{
        success: boolean;
        awb?: string;
    }>;
    handleWebhook(payload: Record<string, unknown>): Promise<{
        received: boolean;
    }>;
    cancelShipment(shipmentId: string): Promise<{
        success: boolean;
    }>;
    trackShipment(awbNumber: string): Promise<Record<string, unknown> | null>;
    getShippingRates(body: {
        pickupPincode: string;
        deliveryPincode: string;
        weight: number;
        cod?: boolean;
    }): Promise<unknown[]>;
}
