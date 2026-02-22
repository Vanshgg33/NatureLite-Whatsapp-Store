import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios, { AxiosInstance } from 'axios';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ShiprocketConfig } from '@/config/configuration';

interface ShiprocketAuthResponse {
  token: string;
}

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

@Injectable()
export class ShiprocketService {
  private readonly logger = new Logger(ShiprocketService.name);
  private readonly config: ShiprocketConfig;
  private httpClient: AxiosInstance;
  private authToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {
    this.config = this.configService.get<ShiprocketConfig>('shiprocket')!;

    this.httpClient = axios.create({
      baseURL: this.config.apiUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.authToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return;
    }

    try {
      const response = await this.httpClient.post<ShiprocketAuthResponse>(
        '/auth/login',
        {
          email: this.config.email,
          password: this.config.password,
        },
      );

      this.authToken = response.data.token;
      this.tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);

      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;
    } catch (error) {
      this.logger.error('Failed to authenticate with Shiprocket', error);
      throw error;
    }
  }

  async createShipment(order: Order): Promise<ShiprocketOrderResponse | null> {
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

      const response = await this.httpClient.post<ShiprocketOrderResponse>(
        '/orders/create/adhoc',
        orderData,
      );

      await this.orderModel.updateOne(
        { _id: order._id },
        {
          $set: {
            shiprocketOrderId: response.data.order_id.toString(),
            shiprocketShipmentId: response.data.shipment_id.toString(),
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create Shiprocket shipment', error);
      return null;
    }
  }

  async generateAwb(shipmentId: string, courierId?: number): Promise<string | null> {
    try {
      await this.ensureAuthenticated();

      const response = await this.httpClient.post<{ response: { data: { awb_code: string; courier_name: string } } }>(
        '/courier/assign/awb',
        {
          shipment_id: shipmentId,
          courier_id: courierId,
        },
      );

      const awbCode = response.data.response?.data?.awb_code;
      const courierName = response.data.response?.data?.courier_name;

      if (awbCode) {
        await this.orderModel.updateOne(
          { shiprocketShipmentId: shipmentId },
          {
            $set: {
              awbNumber: awbCode,
              courierName,
              trackingUrl: `https://shiprocket.co/tracking/${awbCode}`,
            },
          },
        );
      }

      return awbCode || null;
    } catch (error) {
      this.logger.error('Failed to generate AWB', error);
      return null;
    }
  }

  async getTrackingInfo(awbNumber: string): Promise<Record<string, unknown> | null> {
    try {
      await this.ensureAuthenticated();

      const response = await this.httpClient.get<{ tracking_data: Record<string, unknown> }>(
        `/courier/track/awb/${awbNumber}`,
      );

      return response.data.tracking_data;
    } catch (error) {
      this.logger.error('Failed to get tracking info', error);
      return null;
    }
  }

  async handleWebhook(payload: ShiprocketWebhookPayload): Promise<void> {
    try {
      const order = await this.orderModel.findOne({ awbNumber: payload.awb });

      if (!order) {
        this.logger.warn(`Order not found for AWB: ${payload.awb}`);
        return;
      }

      const statusMap: Record<string, string> = {
        '6': 'shipped',
        '17': 'out_for_delivery',
        '7': 'delivered',
        '8': 'cancelled',
        '9': 'returned',
        '10': 'returned',
      };

      const newStatus = statusMap[payload.current_status];

      if (newStatus && newStatus !== order.status) {
        order.status = newStatus as Order['status'];

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
            await this.notificationsService.sendShippingUpdate(
              order,
              phone,
              payload.awb,
              order.courierName || 'Courier',
            );
            break;
          case 'out_for_delivery':
            await this.notificationsService.sendOutForDelivery(order, phone);
            break;
          case 'delivered':
            await this.notificationsService.sendDeliveryConfirmation(order, phone);
            break;
        }
      }
    } catch (error) {
      this.logger.error('Failed to process Shiprocket webhook', error);
    }
  }

  async cancelShipment(shipmentId: string): Promise<boolean> {
    try {
      await this.ensureAuthenticated();

      await this.httpClient.post('/orders/cancel', {
        ids: [shipmentId],
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to cancel shipment', error);
      return false;
    }
  }

  async getShippingRates(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number,
    cod: boolean = false,
  ): Promise<Array<{ id: string; courier: string; rate: number; estimatedDays: number }>> {
    try {
      await this.ensureAuthenticated();

      const response = await this.httpClient.get<{
        data: {
          available_courier_companies: Array<{
            courier_company_id: number;
            courier_name: string;
            rate: number;
            estimated_delivery_days: number;
          }>;
        };
      }>('/courier/serviceability/', {
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
    } catch (error) {
      this.logger.error('Failed to get shipping rates', error);
      return [];
    }
  }
}
