import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AddToWishlistDto, WishlistResponse } from './dto/wishlist.dto';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  async getWishlist(
    @CurrentUser('sub') userId: string,
  ): Promise<WishlistResponse> {
    return this.wishlistService.getWishlist(userId);
  }

  @Post('items')
  async addItem(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddToWishlistDto,
  ): Promise<WishlistResponse> {
    return this.wishlistService.addItem(userId, dto);
  }

  @Delete('items/:productId')
  async removeItem(
    @CurrentUser('sub') userId: string,
    @Param('productId') productId: string,
  ): Promise<WishlistResponse> {
    return this.wishlistService.removeItem(userId, productId);
  }

  @Delete()
  async clearWishlist(
    @CurrentUser('sub') userId: string,
  ): Promise<WishlistResponse> {
    return this.wishlistService.clearWishlist(userId);
  }
}

