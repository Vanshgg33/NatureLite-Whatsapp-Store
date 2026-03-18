import { IsMongoId } from 'class-validator';

export class AddToWishlistDto {
  @IsMongoId()
  productId: string;
}

export interface WishlistItemResponse {
  productId: string;
  name: string;
  slug: string;
  image?: string;
  price: number;
  addedAt: Date;
}

export interface WishlistResponse {
  items: WishlistItemResponse[];
  itemCount: number;
}

