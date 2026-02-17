import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto, UpdatePaymentStatusDto, CancelOrderDto, AddOrderNoteDto, UpdateShippingDto, OrderQueryDto, ReorderDto } from './dto/order.dto';
import { Order } from './schemas/order.schema';
import { JwtPayload } from '@/common/decorators/current-user.decorator';
import { PaginatedResult } from '@/common/types/pagination.types';
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    create(userId: string, dto: CreateOrderDto): Promise<Order>;
    findAll(query: OrderQueryDto): Promise<PaginatedResult<Order>>;
    getMyOrders(userId: string, limit?: string): Promise<Order[]>;
    getOrderStats(startDate?: string, endDate?: string): Promise<Record<string, unknown>>;
    getOrdersByStatus(): Promise<Record<string, number>>;
    findOne(id: string, user: JwtPayload): Promise<Order>;
    findByOrderNumber(orderNumber: string, user: JwtPayload): Promise<Order>;
    updateStatus(id: string, dto: UpdateOrderStatusDto, adminId: string): Promise<Order>;
    updatePaymentStatus(id: string, dto: UpdatePaymentStatusDto): Promise<Order>;
    cancelOrder(id: string, dto: CancelOrderDto, user: JwtPayload): Promise<Order>;
    addNote(id: string, dto: AddOrderNoteDto): Promise<Order>;
    updateShipping(id: string, dto: UpdateShippingDto): Promise<Order>;
    setPriorityTags(id: string, tags: string[]): Promise<Order>;
    reorder(userId: string, dto: ReorderDto): Promise<Order>;
}
