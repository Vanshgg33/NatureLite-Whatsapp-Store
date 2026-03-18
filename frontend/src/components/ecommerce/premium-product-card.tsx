'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ShoppingBag, Star, Eye, Leaf, Flame, TrendingUp, Award, Check } from 'lucide-react';
import { useCartStore, CartItem } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { useAddToCartAnimation } from '@/components/ecommerce/add-to-cart-animation';
import { cn, getProductTotalStock } from '@/lib/utils';
import { Product } from '@/types';

interface PremiumProductCardProps {
  product: Product;
  index?: number;
  onQuickView?: (product: Product) => void;
  /** Show "Most popular" badge (psychology: primacy/decoy) */
  showMostPopular?: boolean;
  /** Show "Only X left" scarcity (overrides default low-stock logic when true) */
  showOnlyXLeft?: boolean;
  /** Tighter layout for grids (smaller image, less padding) */
  compact?: boolean;
}

export function PremiumProductCard({
  product,
  index = 0,
  onQuickView,
  showMostPopular = false,
  showOnlyXLeft: forceShowOnlyXLeft,
  compact = false,
}: PremiumProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const addToCartBtnRef = useRef<HTMLButtonElement>(null);

  const addItem = useCartStore((state) => state.addItem);
  const { toast } = useToast();
  const flyAnimation = useAddToCartAnimation();

  const discount = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  const isNew =
    new Date(product.createdAt).getTime() >
    Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

  const rating = 4.5; // Placeholder - integrate with actual reviews
  const reviewCount = product.totalSold || 0;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isAddingToCart) return;

    setIsAddingToCart(true);

    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] || '',
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      gstPercentage: product.gstPercentage || 5,
    };

    try {
      await addItem(cartItem, 1);
      setIsAddingToCart(false);
      setShowSuccess(true);
      // Trigger flying animation
      if (flyAnimation && addToCartBtnRef.current) {
        flyAnimation.triggerFlyAnimation(product.images?.[0] || '', addToCartBtnRef.current.getBoundingClientRect());
      }
      toast({
        title: 'Added to cart',
        description: `${product.name} has been added to your cart.`,
      });
      setTimeout(() => setShowSuccess(false), 1500);
    } catch {
      setIsAddingToCart(false);
      toast({
        title: 'Error',
        description: 'Failed to add item to cart.',
        variant: 'destructive',
      });
    }
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isWishlisted) {
      setHeartBurst(true);
      setTimeout(() => setHeartBurst(false), 700);
    }
    setIsWishlisted(!isWishlisted);
    toast({
      title: isWishlisted ? 'Removed from wishlist' : 'Added to wishlist',
      description: `${product.name} has been ${isWishlisted ? 'removed from' : 'added to'} your wishlist.`,
    });
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onQuickView?.(product);
  };

  return (
    <motion.article
      className="group relative"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.2) }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link href={`/products/${product.slug}`} className="block">
        {/* Card Container */}
        <div className={cn(
          "relative bg-white overflow-hidden transition-all duration-500 hover:shadow-brand-xl",
          compact ? "rounded-2xl" : "rounded-3xl",
          product.isFeatured && "ring-2 ring-brand-mustard/60 shadow-[0_0_20px_-5px_rgba(212,165,116,0.3)]"
        )}>
          {/* Image Container */}
          <div className={cn(
            "relative overflow-hidden bg-brand-cream",
            compact ? "aspect-[4/3]" : "aspect-square"
          )}>
            {/* Loading skeleton */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-br from-brand-cream to-brand-sand animate-pulse" />
            )}

            {/* Product Image */}
            <motion.div
              className="relative w-full h-full"
              animate={{ scale: isHovered ? 1.08 : 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image
                src={product.images?.[0] || '/images/placeholder-product.jpg'}
                alt={product.name}
                fill
                className={`object-cover transition-opacity duration-500 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setImageLoaded(true)}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </motion.div>

            {/* Secondary image on hover */}
            {product.images?.[1] && (
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <Image
                  src={product.images?.[1] as string}
                  alt={`${product.name} alternate`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </motion.div>
            )}

            {/* Badges - max 3 visible, priority ordered */}
            <div className={cn("absolute left-4 flex flex-col z-10", compact ? "top-2 gap-1" : "top-4 gap-2")}>
              {(() => {
                const badges: React.ReactNode[] = [];
                const totalStock = getProductTotalStock(product);
                const isLowStock = forceShowOnlyXLeft ?? (totalStock <= (product.lowStockThreshold || 5) && totalStock > 0);
                const isBestSeller = product.totalSold > 50;
                if (showMostPopular && badges.length < 3) {
                  badges.push(
                    <motion.span
                      key="most-popular"
                      className={cn("bg-brand-mustard text-white font-semibold rounded-full", compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs")}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      Most popular
                    </motion.span>
                  );
                }
                const isTrending = product.viewCount > 100;

                // Priority: Staff Pick > Low Stock > Best Seller > Trending > New > Discount
                if (product.isFeatured && badges.length < 3) {
                  badges.push(
                    <motion.span
                      key="staff-pick"
                      className={cn("bg-gradient-to-r from-brand-mustard to-brand-mustard-dark text-white font-semibold rounded-full flex items-center gap-1 shadow-sm", compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs")}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 }}
                    >
                      <Award className="w-3 h-3" />
                      Staff Pick
                    </motion.span>
                  );
                }
                if (isLowStock && badges.length < 3) {
                  badges.push(
                    <motion.span
                      key="low-stock"
                      className={cn("bg-brand-terracotta text-white font-medium rounded-full flex items-center gap-1 animate-pulse-soft", compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs")}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Only {totalStock} left!
                    </motion.span>
                  );
                }
                if (isBestSeller && badges.length < 3) {
                  badges.push(
                    <motion.span
                      key="best-seller"
                      className={cn("bg-brand-charcoal text-white font-medium rounded-full flex items-center gap-1", compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs")}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 }}
                    >
                      <Flame className="w-3 h-3" />
                      Best Seller
                    </motion.span>
                  );
                }
                if (isTrending && !isBestSeller && badges.length < 3) {
                  badges.push(
                    <motion.span
                      key="trending"
                      className={cn("bg-brand-green/90 text-white font-medium rounded-full flex items-center gap-1", compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs")}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <TrendingUp className="w-3 h-3" />
                      Trending
                    </motion.span>
                  );
                }
                if (isNew && badges.length < 3) {
                  badges.push(
                    <motion.span
                      key="new"
                      className={cn("bg-brand-green text-white font-medium rounded-full flex items-center gap-1", compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs")}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 }}
                    >
                      <Leaf className="w-3 h-3" />
                      New
                    </motion.span>
                  );
                }
                if (discount > 0 && badges.length < 3) {
                  badges.push(
                    <motion.span
                      key="discount"
                      className={cn("bg-brand-terracotta text-white font-medium rounded-full", compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs")}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      -{discount}%
                    </motion.span>
                  );
                }
                return badges;
              })()}
            </div>

            {/* Action Buttons */}
            <div className={cn("absolute right-4 flex flex-col z-10", compact ? "top-2 gap-1" : "top-4 gap-2")}>
              {/* Wishlist Button with heart burst */}
              <div className="relative">
                <motion.button
                  onClick={handleWishlist}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isWishlisted
                      ? 'bg-brand-terracotta text-white'
                      : 'bg-white/90 backdrop-blur-sm text-brand-charcoal hover:bg-brand-terracotta hover:text-white'
                  }`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Heart
                    className={`w-5 h-5 transition-all ${isWishlisted ? 'fill-current' : ''}`}
                  />
                </motion.button>
                {/* Heart burst particles */}
                <AnimatePresence>
                  {heartBurst && (
                    <>
                      {[...Array(6)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-brand-terracotta"
                          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                          animate={{
                            x: Math.cos((i * 60 * Math.PI) / 180) * 25,
                            y: Math.sin((i * 60 * Math.PI) / 180) * 25,
                            scale: 0,
                            opacity: 0,
                          }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        />
                      ))}
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Quick View Button */}
              <AnimatePresence>
                {isHovered && onQuickView && (
                  <motion.button
                    onClick={handleQuickView}
                    className="w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm text-brand-charcoal flex items-center justify-center hover:bg-brand-charcoal hover:text-white transition-all duration-300"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Eye className="w-5 h-5" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Add to Cart Overlay */}
            <AnimatePresence>
              {isHovered && getProductTotalStock(product) > 0 && (
                <motion.div
                  className={cn("absolute bottom-0 left-0 right-0", compact ? "p-2" : "p-4")}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.button
                    ref={addToCartBtnRef}
                    onClick={handleAddToCart}
                    disabled={isAddingToCart || showSuccess}
                    className={cn(
                      "w-full font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-90",
                      compact ? "py-2 rounded-xl text-sm" : "py-3 rounded-2xl",
                      showSuccess
                        ? "bg-brand-green text-white"
                        : "bg-brand-charcoal text-white hover:bg-brand-green"
                    )}
                    whileHover={!showSuccess ? { scale: 1.02 } : {}}
                    whileTap={!showSuccess ? { scale: 0.98 } : {}}
                  >
                    {isAddingToCart ? (
                      <motion.div
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                    ) : showSuccess ? (
                      <motion.span
                        className="flex items-center gap-2"
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                      >
                        <Check className="w-5 h-5" />
                        Added!
                      </motion.span>
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        Add to Cart
                      </>
                    )}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Out of Stock Overlay */}
            {getProductTotalStock(product) === 0 && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                <span className="px-6 py-2 bg-brand-charcoal text-white rounded-full font-medium">
                  Out of Stock
                </span>
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className={compact ? "p-3" : "p-5"}>
            {/* Category */}
            {typeof product.category === 'object' && product.category?.name && (
              <span className={cn("text-brand-muted uppercase tracking-wider", compact ? "text-[10px]" : "text-xs")}>
                {product.category.name}
              </span>
            )}

            {/* Product Name */}
            <h3 className={cn("font-display font-semibold text-brand-charcoal line-clamp-2 group-hover:text-brand-green transition-colors", compact ? "text-sm mt-0.5" : "text-lg mt-1")}>
              {product.name}
            </h3>

            {/* Rating */}
            <div className={cn("flex items-center gap-2", compact ? "mt-1" : "mt-2")}>
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      compact ? "w-3 h-3" : "w-4 h-4",
                      i < Math.floor(rating)
                        ? "fill-brand-mustard text-brand-mustard"
                        : i < rating
                          ? "fill-brand-mustard/50 text-brand-mustard"
                          : "text-brand-border"
                    )}
                  />
                ))}
              </div>
              <span className={cn("text-brand-muted", compact ? "text-xs" : "text-sm")}>
                ({reviewCount})
              </span>
            </div>

            {/* Price */}
            <div className={cn("flex items-center gap-2", compact ? "mt-1.5" : "mt-3 gap-3")}>
              <span className={cn("font-display font-bold text-brand-charcoal", compact ? "text-base" : "text-xl")}>
                ₹{product.price.toLocaleString()}
              </span>
              {product.compareAtPrice && product.compareAtPrice > product.price && (
                <span className={cn("text-brand-muted line-through", compact ? "text-xs" : "text-sm")}>
                  ₹{product.compareAtPrice.toLocaleString()}
                </span>
              )}
            </div>

            {/* Quick variant indicator */}
            {product.variants && product.variants.length > 0 && (
              <div className={cn("flex items-center gap-2", compact ? "mt-1.5" : "mt-3")}>
                <span className={cn("text-brand-muted", compact ? "text-[10px]" : "text-xs")}>
                  {product.variants.length} variants
                </span>
                <div className="flex -space-x-1">
                  {product.variants.slice(0, 4).map((variant, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full border-2 border-white bg-brand-sand text-[8px] flex items-center justify-center font-medium"
                      title={variant.name}
                    >
                      {variant.name.charAt(0)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

// Compact variant for smaller displays
export function PremiumProductCardCompact({
  product,
  index = 0,
}: Omit<PremiumProductCardProps, 'onQuickView'>) {
  const addItem = useCartStore((state) => state.addItem);
  const { toast } = useToast();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images[0] || '',
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      gstPercentage: product.gstPercentage || 5,
    };

    await addItem(cartItem, 1);
    toast({
      title: 'Added to cart',
      description: `${product.name} has been added to your cart.`,
    });
  };

  return (
    <motion.article
      className="group"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link
        href={`/products/${product.slug}`}
        className="flex items-center gap-4 p-3 bg-white rounded-2xl hover:shadow-brand-md transition-all duration-300"
      >
        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-brand-cream flex-shrink-0">
          <Image
            src={product.images[0] || '/images/placeholder-product.jpg'}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            sizes="80px"
          />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-brand-charcoal truncate group-hover:text-brand-green transition-colors">
            {product.name}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-semibold text-brand-charcoal">
              ₹{product.price.toLocaleString()}
            </span>
            {product.compareAtPrice && (
              <span className="text-sm text-brand-muted line-through">
                ₹{product.compareAtPrice.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleAddToCart}
          className="w-11 h-11 rounded-full bg-brand-cream flex items-center justify-center text-brand-charcoal hover:bg-brand-green hover:text-white transition-all duration-300 flex-shrink-0"
        >
          <ShoppingBag className="w-5 h-5" />
        </button>
      </Link>
    </motion.article>
  );
}
