import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { WishlistRepository } from './repositories/wishlist.repository';
import {
  WishlistDocument,
  WishlistItem,
} from './schemas/wishlist.schema';
import { ProductsService } from '../products/products.service';
import {
  AddToWishlistDto,
  WishlistResponse,
} from './dto/wishlist.dto';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class WishlistService {
  constructor(
    private readonly wishlistRepository: WishlistRepository,
    private readonly productsService: ProductsService,
  ) {}

  async getWishlist(userId: string): Promise<WishlistResponse> {
    const wishlist = await this.findOrCreateWishlist(userId);
    return this.formatWishlistResponse(wishlist);
  }

  async addItem(userId: string, dto: AddToWishlistDto): Promise<WishlistResponse> {
    const userObjId = parseObjectId(userId, 'userId');
    const productObjId = parseObjectId(dto.productId, 'productId');

    let wishlist = await this.wishlistRepository.findOneByUser(userObjId);
    if (!wishlist) {
      wishlist = await this.wishlistRepository.create({
        user: userObjId,
        items: [],
      } as Partial<WishlistDocument>);
    }

    const exists = wishlist.items.some(
      (item) => item.product.toString() === productObjId.toString(),
    );
    if (!exists) {
      const product = await this.productsService.findById(dto.productId);

      const item: WishlistItem = {
        product: productObjId as Types.ObjectId,
        name: product.name,
        slug: product.slug,
        image: product.images?.[0],
        price: product.price,
        addedAt: new Date(),
      };

      wishlist.items.push(item);
      await wishlist.save();
    }

    return this.formatWishlistResponse(wishlist);
  }

  async removeItem(
    userId: string,
    productId: string,
  ): Promise<WishlistResponse> {
    const userObjId = parseObjectId(userId, 'userId');
    const productObjId = parseObjectId(productId, 'productId');

    const wishlist = await this.findOrCreateWishlist(userId);

    const originalLength = wishlist.items.length;
    wishlist.items = wishlist.items.filter(
      (item) => item.product.toString() !== productObjId.toString(),
    );

    if (wishlist.items.length < originalLength) {
      await wishlist.save();
    }

    return this.formatWishlistResponse(wishlist);
  }

  async clearWishlist(userId: string): Promise<WishlistResponse> {
    const wishlist = await this.findOrCreateWishlist(userId);
    wishlist.items = [];
    await wishlist.save();
    return this.formatWishlistResponse(wishlist);
  }

  private async findOrCreateWishlist(
    userId: string,
  ): Promise<WishlistDocument> {
    const userObjId = parseObjectId(userId, 'userId');
    let wishlist = await this.wishlistRepository.findOneByUser(userObjId);
    if (!wishlist) {
      wishlist = await this.wishlistRepository.create({
        user: userObjId,
        items: [],
      } as Partial<WishlistDocument>);
    }
    return wishlist;
  }

  private formatWishlistResponse(
    wishlist: WishlistDocument,
  ): WishlistResponse {
    const items = wishlist.items.map((item) => ({
      productId: item.product.toString(),
      name: item.name,
      slug: item.slug,
      image: item.image,
      price: item.price,
      addedAt: item.addedAt,
    }));

    return {
      items,
      itemCount: items.length,
    };
  }
}

