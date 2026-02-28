import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
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
} from './dto/order.dto';
import { Order } from './schemas/order.schema';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '@/common/decorators/current-user.decorator';
import { PaginatedResult } from '@/common/types/pagination.types';

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

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async findAll(@Query() query: OrderQueryDto): Promise<PaginatedResult<Order>> {
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

    if (user.role === 'customer' && order.user.toString() !== user.sub) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    const order = await this.ordersService.findById(id);

    if (user.role === 'customer' && order.user.toString() !== user.sub) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'superadmin')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser('sub') adminId: string,
  ): Promise<Order> {
    dto.updatedBy = adminId;
    return this.ordersService.updateStatus(id, dto);
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

  @Post(':id/cancel')
  async cancelOrder(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<Order> {
    if (user.role === 'customer') {
      const order = await this.ordersService.findById(id);
      if (order.user.toString() !== user.sub) {
        throw new ForbiddenException('You do not have access to this order');
      }
    }

    return this.ordersService.cancelOrder(id, dto, user.sub);
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
}
