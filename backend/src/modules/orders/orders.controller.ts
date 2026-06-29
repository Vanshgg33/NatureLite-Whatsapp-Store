import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
  Put,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
  CancelOrderDto,
  AddOrderNoteDto,
  UpdateShippingDto,
  OrderQueryDto,
  ReorderDto,
  UpdateDeliveryWorkflowDto,
  GuestCreateOrderDto,
  AssignDeliveryDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { Order } from './schemas/order.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/types/pagination.types';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

/** Get order owner id whether user ref is populated or raw ObjectId. */
function getOrderUserId(order: Order): string {
  const u = order.user as { _id?: { toString(): string }; toString?: () => string };
  if (u && typeof u === 'object' && u._id != null) return u._id.toString();
  return (u as unknown as { toString(): string }).toString();
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateOrderDto,
  ): Promise<Order> {
    return this.ordersService.create(userId, dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('guest')
  async createGuest(@Body() dto: GuestCreateOrderDto): Promise<Order> {
    return this.ordersService.createGuestOrder(dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async findAll(
    @Query() query: OrderQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResult<Order>> {
    if (user.departmentType === 'delivery') {
      query.forDelivery = true;
      query.deliveryUserId = user.sub;
    }
    return this.ordersService.findAll(query);
  }

  @Get('my-orders')
  async getMyOrders(
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: string,
  ): Promise<Order[]> {
    return this.ordersService.findUserOrders(
      userId,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async getOrderStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Record<string, unknown>> {
    return this.ordersService.getOrderStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('by-status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async getOrdersByStatus(): Promise<Record<string, number>> {
    return this.ordersService.getOrdersByStatus();
  }

  @Get('number/:orderNumber')
  async findByOrderNumber(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    const order = await this.ordersService.findByOrderNumber(orderNumber);

    if (user.role === 'customer' && getOrderUserId(order) !== user.sub) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (user.departmentType === 'delivery') {
      const assigned = (order as any).assignedDeliveryUserId;
      if (!assigned || assigned.toString() !== user.sub) {
        throw new ForbiddenException('This order is not assigned to you.');
      }
    }

    return order;
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    const order = await this.ordersService.findById(id);

    if (user.role === 'customer' && getOrderUserId(order) !== user.sub) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (user.departmentType === 'delivery') {
      const assigned = (order as any).assignedDeliveryUserId;
      if (!assigned || assigned.toString() !== user.sub) {
        throw new ForbiddenException('This order is not assigned to you.');
      }
    }

    return order;
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    dto.updatedBy = user.sub;
    return this.ordersService.updateStatus(id, dto, user.departmentType);
  }

  @Put(':id/assign-delivery')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async assignDelivery(
    @Param('id') id: string,
    @Body() dto: AssignDeliveryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    if (user.departmentType === 'delivery') {
      throw new ForbiddenException('Delivery staff cannot assign delivery.');
    }
    return this.ordersService.assignDelivery(id, dto.deliveryUserId, user.sub);
  }

  @Put(':id/mark-packed')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async markPacked(
    @Param('id') id: string,
    @Body() body: { packedByName?: string },
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    return this.ordersService.markPacked(id, user.sub, user.departmentType, body?.packedByName);
  }

  @Put(':id/payment-status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ): Promise<Order> {
    return this.ordersService.updatePaymentStatus(id, dto);
  }

  @Put(':id/delivery-workflow')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async updateDeliveryWorkflow(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryWorkflowDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    return this.ordersService.updateDeliveryWorkflow(id, dto, user.sub, user.departmentType);
  }

  @Post(':id/cancel')
  async cancelOrder(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    if (user.role === 'customer') {
      const order = await this.ordersService.findById(id);
      if (getOrderUserId(order) !== user.sub) {
        throw new ForbiddenException('You do not have access to this order');
      }
    }

    return this.ordersService.cancelOrder(id, dto, user.sub);
  }

  @Post(':id/request-return')
  async requestReturn(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('sub') userId: string,
  ): Promise<Order> {
    return this.ordersService.requestReturn(userId, id, reason);
  }

  @Post(':id/return/approve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async approveReturn(@Param('id') id: string): Promise<Order> {
    return this.ordersService.approveReturn(id);
  }

  @Post(':id/return/reject')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async rejectReturn(@Param('id') id: string): Promise<Order> {
    return this.ordersService.rejectReturn(id);
  }

  @Post(':id/return/complete')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async completeReturn(@Param('id') id: string): Promise<Order> {
    return this.ordersService.completeReturn(id);
  }

  @Post(':id/notes')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async addNote(
    @Param('id') id: string,
    @Body() dto: AddOrderNoteDto,
  ): Promise<Order> {
    return this.ordersService.addNote(id, dto);
  }

  @Put(':id/shipping')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async updateShipping(
    @Param('id') id: string,
    @Body() dto: UpdateShippingDto,
  ): Promise<Order> {
    return this.ordersService.updateShipping(id, dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<Order> {
    return this.ordersService.updateOrder(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async deleteOrder(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.ordersService.deleteOrder(id);
  }

  @Put(':id/priority-tags')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async setPriorityTags(
    @Param('id') id: string,
    @Body('tags') tags: string[],
  ): Promise<Order> {
    return this.ordersService.setPriorityTags(id, tags);
  }

  @Post('reorder')
  async reorder(
    @CurrentUser('sub') userId: string,
    @Body() dto: ReorderDto,
  ): Promise<Order> {
    return this.ordersService.reorder(userId, dto);
  }

  @Post(':id/invoice')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async storeInvoice(
    @Param('id') id: string,
    @Body('pdfBase64') pdfBase64: string,
    @Body('filename') filename: string,
  ): Promise<{ url: string }> {
    if (!pdfBase64) throw new BadRequestException('pdfBase64 is required');
    return this.ordersService.storeOrderInvoice(id, pdfBase64, filename || `invoice_${id}.pdf`);
  }

  @Post(':id/send-invoice')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async sendInvoice(@Param('id') id: string): Promise<{ sent: boolean }> {
    return this.ordersService.sendOrderInvoiceToCustomer(id);
  }
}
