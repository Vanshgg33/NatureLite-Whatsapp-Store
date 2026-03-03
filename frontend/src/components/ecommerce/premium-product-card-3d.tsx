'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ShoppingBag, Heart, Eye, Star, Sparkles } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { getProductTotalStock } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Product } from '@/types';

interface PremiumProductCard3DProps {
  product: Product;
  index?: number;
  onQuickView?: (product: Product) => void;
}

export function PremiumProductCard3D({
  product,
  index = 0,
  onQuickView,
}: PremiumProductCard3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const addItem = useCartStore((state) => state.addItem);
  const { toast } = useToast();

  // 3D tilt effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 300 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [10, -10]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-10, 10]), springConfig);
  const scale = useSpring(1, springConfig);

  // Shine effect
  const shineX = useTransform(x, [-0.5, 0.5], ['-100%', '200%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) / rect.width);
    y.set((e.clientY - centerY) / rect.height);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    scale.set(1.02);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
    scale.set(1);
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAddingToCart(true);

    try {
      await addItem({
        productId: product._id,
        name: product.name,
        slug: product.slug,
        image: product.images[0] || '',
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        gstPercentage: product.gstPercentage || 5,
      }, 1);

      toast({
        title: 'Added to cart',
        description: `${product.name} has been added to your cart.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add item to cart.',
        variant: 'destructive',
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  const discount = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  return (
    <motion.div
      ref={cardRef}
      className="group relative"
      style={{
        perspective: 1200,
        transformStyle: 'preserve-3d',
      }}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        className="relative bg-white rounded-3xl overflow-hidden shadow-brand-md"
        style={{
          rotateX,
          rotateY,
          scale,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Shine overlay */}
        <motion.div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.3) 45%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.3) 55%, transparent 60%)`,
            backgroundSize: '300% 100%',
            backgroundPositionX: shineX,
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.3s',
          }}
        />

        {/* Image Section */}
        <div className="relative aspect-[4/5] overflow-hidden bg-brand-cream">
          <Link href={`/products/${product.slug}`}>
            <motion.div
              className="absolute inset-0"
              style={{ translateZ: 20 }}
            >
              <Image
                src={product.images[0] || '/images/placeholder-product.jpg'}
                alt={product.name}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
            </motion.div>
          </Link>

          {/* Gradient overlay on hover */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-t from-brand-charcoal/60 via-transparent to-transparent z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          />

          {/* Badges */}
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
            {product.isNew && (
              <motion.span
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-green text-white text-xs font-semibold rounded-full shadow-lg"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Sparkles className="w-3 h-3" />
                New
              </motion.span>
            )}
            {discount > 0 && (
              <motion.span
                className="px-3 py-1.5 bg-brand-terracotta text-white text-xs font-semibold rounded-full shadow-lg"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                -{discount}%
              </motion.span>
            )}
          </div>

          {/* Wishlist Button */}
          <motion.button
            className={`absolute top-4 right-4 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
              isLiked
                ? 'bg-brand-terracotta text-white'
                : 'bg-white/90 backdrop-blur-sm text-brand-charcoal hover:bg-brand-terracotta hover:text-white'
            }`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.preventDefault();
              setIsLiked(!isLiked);
            }}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          </motion.button>

          {/* Quick Actions */}
          <motion.div
            className="absolute bottom-4 left-4 right-4 z-20 flex gap-2"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: isHovered ? 0 : 20, opacity: isHovered ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.button
              className="flex-1 py-3 bg-white text-brand-charcoal rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-brand-charcoal hover:text-white transition-colors shadow-lg"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAddToCart}
              disabled={isAddingToCart}
            >
              {isAddingToCart ? (
                <motion.div
                  className="w-5 h-5 border-2 border-brand-charcoal/30 border-t-brand-charcoal rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  Add to Cart
                </>
              )}
            </motion.button>

            {onQuickView && (
              <motion.button
                className="w-12 h-12 bg-white/90 backdrop-blur-sm text-brand-charcoal rounded-xl flex items-center justify-center hover:bg-brand-charcoal hover:text-white transition-colors shadow-lg"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.preventDefault();
                  onQuickView(product);
                }}
              >
                <Eye className="w-5 h-5" />
              </motion.button>
            )}
          </motion.div>
        </div>

        {/* Content Section */}
        <motion.div
          className="p-5"
          style={{ translateZ: 30 }}
        >
          {/* Category */}
          {typeof product.category === 'object' && product.category?.name && (
            <span className="text-xs text-brand-muted uppercase tracking-wider font-medium">
              {product.category.name}
            </span>
          )}

          {/* Name */}
          <Link href={`/products/${product.slug}`}>
            <h3 className="font-display text-lg font-semibold text-brand-charcoal mt-1 mb-2 line-clamp-2 hover:text-brand-green transition-colors">
              {product.name}
            </h3>
          </Link>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < 4
                      ? 'fill-brand-mustard text-brand-mustard'
                      : 'text-brand-border'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-brand-muted">
              ({product.totalSold || 0} sold)
            </span>
          </div>

          {/* Price */}
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-bold text-brand-charcoal">
              ₹{product.price.toLocaleString()}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-sm text-brand-muted line-through">
                ₹{product.compareAtPrice.toLocaleString()}
              </span>
            )}
          </div>

          {/* Stock indicator */}
          {(() => {
            const totalStock = getProductTotalStock(product);
            const threshold = product.lowStockThreshold ?? 10;
            return totalStock > 0 && totalStock <= threshold ? (
              <motion.div
                className="mt-3 flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="flex-1 h-1.5 bg-brand-cream rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-brand-terracotta rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (totalStock / threshold) * 100)}%` }}
                    transition={{ duration: 1, delay: 0.6 }}
                  />
                </div>
                <span className="text-xs text-brand-terracotta font-medium">
                  Only {totalStock} left
                </span>
              </motion.div>
            ) : null;
          })()}
        </motion.div>

        {/* Bottom border accent */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-green via-brand-mustard to-brand-terracotta"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          style={{ originX: 0 }}
        />
      </motion.div>
    </motion.div>
  );
}
