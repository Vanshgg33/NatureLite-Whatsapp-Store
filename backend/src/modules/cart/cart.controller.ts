import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import {
  AddToCartDto,
  UpdateCartItemDto,
  ApplyCouponDto,
  CartResponse,
} from './dto/cart.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentUser('sub') userId: string): Promise<CartResponse> {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  async addItem(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddToCartDto,
  ): Promise<CartResponse> {
    return this.cartService.addItem(userId, dto);
  }

  @Put('items/:productId')
  async updateItemQuantity(
    @CurrentUser('sub') userId: string,
    @Param('productId') productId: string,
    @Query('variantSku') variantSku: string | undefined,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartResponse> {
    return this.cartService.updateItemQuantity(userId, productId, dto, variantSku);
  }

  @Delete('items/:productId')
  async removeItem(
    @CurrentUser('sub') userId: string,
    @Param('productId') productId: string,
    @Query('variantSku') variantSku?: string,
  ): Promise<CartResponse> {
    return this.cartService.removeItem(userId, productId, variantSku);
  }

  @Delete()
  async clearCart(@CurrentUser('sub') userId: string): Promise<CartResponse> {
    return this.cartService.clearCart(userId);
  }

  @Post('coupon')
  async applyCoupon(
    @CurrentUser('sub') userId: string,
    @Body() dto: ApplyCouponDto,
  ): Promise<CartResponse> {
    return this.cartService.applyCoupon(userId, dto.couponCode);
  }

  @Delete('coupon')
  async removeCoupon(@CurrentUser('sub') userId: string): Promise<CartResponse> {
    return this.cartService.removeCoupon(userId);
  }
}
