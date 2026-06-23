import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Wishlist,
  WishlistSchema,
} from './schemas/wishlist.schema';
import { WishlistRepository } from './repositories/wishlist.repository';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Wishlist.name, schema: WishlistSchema }]),
    forwardRef(() => ProductsModule),
  ],
  controllers: [WishlistController],
  providers: [WishlistRepository, WishlistService],
  exports: [WishlistRepository, WishlistService],
})
export class WishlistModule {}

