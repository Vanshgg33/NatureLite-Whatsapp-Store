'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Star, ShoppingBag, Heart, Eye } from 'lucide-react';
import { cn, getProductTotalStock } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useCartStore, CartItem } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { useWishlistStore } from '@/lib/wishlist-store';
import { Product } from '@/types';
import { useCustomerStore } from '@/lib/customer-store';
import { api } from '@/lib/api';

interface ProductCardProps {
  product: Product;
  index?: number;
  variant?: 'default' | 'compact' | 'horizontal';
}

export function ProductCard({
  product,
  index = 0,
  variant = 'default',
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const { toast } = useToast();
  const wishlistToggle = useWishlistStore((state) => state.toggle);
  const isInWishlist = useWishlistStore((state) => state.isInWishlist(product._id));
  const isAuthenticated = useCustomerStore((state) => state.isAuthenticated);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] || '/images/products/placeholder.jpg',
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      gstPercentage: product.gstPercentage,
    };

    addItem(cartItem);
    toast({
      title: 'Added to cart',
      description: `${product.name} has been added to your cart.`,
    });
  };

  const discount = product.compareAtPrice
    ? Math.round(
        ((product.compareAtPrice - product.price) / product.compareAtPrice) * 100
      )
    : 0;

  if (variant === 'compact') {
    return (
      <Link href={`/products/${product.slug}`} className="group block">
        <div className="flex gap-4 p-3 rounded-xl bg-white hover:bg-brand-sand/50 transition-colors">
          <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-brand-sand flex-shrink-0">
            {product.images?.[0] ? (
              <Image
                src={product.images?.[0] as string}
                alt={product.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-display text-2xl text-brand-brown/20">
                  {(product.name || '?').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-sm font-semibold text-brand-charcoal truncate group-hover:text-brand-brown">
              {product.name}
            </h3>
            <p className="font-body text-xs text-brand-muted mt-1">
              {formatPrice(product.price)}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/products/${product.slug}`}
        className="group block"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative bg-white rounded-2xl overflow-hidden shadow-brand-sm transition-all duration-normal group-hover:shadow-brand-lg group-hover:-translate-y-1">
          {/* Image */}
          <div className="relative aspect-square bg-brand-sand">
            {product.images?.[0] ? (
              <Image
                src={product.images?.[0] as string}
                alt={product.name}
                fill
                className="object-cover transition-transform duration-slow group-hover:scale-105"
                loading={index > 0 ? 'lazy' : 'eager'}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-mustard/20 to-brand-brown/20">
                <span className="font-display text-6xl text-brand-brown/20">
                  {(product.name || '?').charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {/* Badges */}
            <div className="absolute top-3 left-3 flex flex-col gap-2">
              {product.isFeatured && (
                <span className="px-3 py-1 text-xs font-body font-medium bg-brand-mustard text-white rounded-full">
                  Featured
                </span>
              )}
              {discount > 0 && (
                <span className="px-3 py-1 text-xs font-body font-medium bg-brand-green text-white rounded-full">
                  {discount}% OFF
                </span>
              )}
              {(() => {
                const totalStock = getProductTotalStock(product);
                return totalStock <= (product.lowStockThreshold ?? 5) && totalStock > 0 ? (
                  <span className="px-3 py-1 text-xs font-body font-medium bg-brand-terracotta text-white rounded-full">
                    Low Stock
                  </span>
                ) : null;
              })()}
            </div>

            {/* Quick actions - always visible on mobile, hover on desktop */}
            <div
              className={cn(
                'absolute top-3 right-3 flex flex-col gap-2 transition-all duration-200',
                isHovered ? 'opacity-100 translate-x-0' : 'sm:opacity-0 sm:translate-x-2 opacity-100 translate-x-0'
              )}
            >
              <button
                className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-brand-sand transition-colors"
                aria-label="Add to wishlist"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (async () => {
                    try {
                      const nextInWishlist = !isInWishlist;

                      // Update local wishlist immediately for snappy UI
                      wishlistToggle({
                        productId: product._id,
                        slug: product.slug,
                        name: product.name,
                        image: product.images[0],
                        price: product.price,
                      });

                      // If authenticated, sync change to server
                      if (isAuthenticated) {
                        if (nextInWishlist) {
                          await api.addToWishlist(product._id);
                        } else {
                          await api.removeFromWishlist(product._id);
                        }
                      }

                      toast({
                        title: nextInWishlist ? 'Added to wishlist' : 'Removed from wishlist',
                        description: `${product.name} has been ${
                          nextInWishlist ? 'added to' : 'removed from'
                        } your wishlist.`,
                      });
                    } catch {
                      toast({
                        title: 'Wishlist update failed',
                        description: 'Please try again in a moment.',
                        variant: 'destructive',
                      });
                    }
                  })();
                }}
              >
                <Heart
                  className={cn(
                    'w-4 h-4',
                    isInWishlist ? 'text-brand-mustard fill-brand-mustard' : 'text-brand-text',
                  )}
                />
              </button>
              <button
                className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-brand-sand transition-colors"
                aria-label="Quick view"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <Eye className="w-4 h-4 text-brand-text" />
              </button>
            </div>

            {/* Add to cart button - always visible on mobile, hover on desktop */}
            <div
              className={cn(
                'absolute bottom-0 inset-x-0 p-4 transition-all duration-200',
                isHovered ? 'opacity-100 translate-y-0' : 'sm:opacity-0 sm:translate-y-4 opacity-100 translate-y-0'
              )}
            >
              <Button
                className="w-full bg-brand-charcoal hover:bg-brand-brown text-white rounded-xl"
                onClick={handleAddToCart}
                disabled={getProductTotalStock(product) === 0}
              >
                <ShoppingBag className="w-4 h-4 mr-2" />
                {getProductTotalStock(product) === 0 ? 'Out of Stock' : 'Add to Cart'}
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Rating */}
            <div className="flex items-center gap-1 mb-2">
              <Star className="w-4 h-4 fill-brand-mustard text-brand-mustard" />
              <span className="text-sm font-body font-medium text-brand-charcoal">
                {(4.5 + Math.random() * 0.5).toFixed(1)}
              </span>
              <span className="text-xs text-brand-muted ml-1">
                ({Math.floor(Math.random() * 100 + 20)})
              </span>
            </div>

            {/* Category */}
            {typeof product.category === 'object' && product.category && (
              <span className="text-xs font-body text-brand-muted uppercase tracking-wide">
                {product.category.name}
              </span>
            )}

            {/* Name */}
            <h3 className="font-display text-lg font-semibold text-brand-charcoal mb-1 group-hover:text-brand-brown transition-colors line-clamp-1">
              {product.name}
            </h3>

            {/* Short description */}
            {product.shortDescription && (
              <p className="font-body text-sm text-brand-muted mb-3 line-clamp-2">
                {product.shortDescription}
              </p>
            )}

            {/* Price */}
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-bold text-brand-charcoal">
                {formatPrice(product.price)}
              </span>
              {product.compareAtPrice && (
                <span className="font-body text-sm text-brand-muted line-through">
                  {formatPrice(product.compareAtPrice)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
