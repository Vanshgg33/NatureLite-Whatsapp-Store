'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ShoppingBag, Star, Eye, Check, Flame, Award } from 'lucide-react';
import { useCartStore, CartItem } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { useAddToCartAnimation } from '@/components/ecommerce/add-to-cart-animation';
import { cn, getProductTotalStock } from '@/lib/utils';
import { Product } from '@/types';

interface PremiumProductCardProps {
  product: Product;
  index?: number;
  onQuickView?: (product: Product) => void;
  showMostPopular?: boolean;
  showOnlyXLeft?: boolean;
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
  const [isHovered,     setIsHovered]     = useState(false);
  const [isWishlisted,  setIsWishlisted]  = useState(false);
  const [imageLoaded,   setImageLoaded]   = useState(false);
  const [imageError,    setImageError]    = useState(false);
  const [isAddingToCart,setIsAddingToCart]= useState(false);
  const [showSuccess,   setShowSuccess]   = useState(false);
  const [heartBurst,    setHeartBurst]    = useState(false);
  const addToCartBtnRef = useRef<HTMLButtonElement>(null);

  const addItem    = useCartStore((s) => s.addItem);
  const { toast }  = useToast();
  const flyAnimation = useAddToCartAnimation();

  const discount   = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100) : 0;
  const isNew      = new Date(product.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
  const totalStock = getProductTotalStock(product);
  const isLowStock = forceShowOnlyXLeft ?? (totalStock <= (product.lowStockThreshold || 5) && totalStock > 0);
  const isBestSeller = product.totalSold > 50;
  const reviewCount  = product.totalSold || 0;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (isAddingToCart) return;
    setIsAddingToCart(true);
    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id, name: product.name, slug: product.slug,
      image: product.images?.[0] || '', price: product.price,
      compareAtPrice: product.compareAtPrice, gstPercentage: product.gstPercentage || 5,
    };
    try {
      await addItem(cartItem, 1);
      setIsAddingToCart(false); setShowSuccess(true);
      if (flyAnimation && addToCartBtnRef.current)
        flyAnimation.triggerFlyAnimation(product.images?.[0] || '', addToCartBtnRef.current.getBoundingClientRect());
      toast({ title: 'Added to cart', description: `${product.name} added.` });
      setTimeout(() => setShowSuccess(false), 1500);
    } catch {
      setIsAddingToCart(false);
      toast({ title: 'Error', description: 'Failed to add item.', variant: 'destructive' });
    }
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!isWishlisted) { setHeartBurst(true); setTimeout(() => setHeartBurst(false), 700); }
    setIsWishlisted(!isWishlisted);
    toast({ title: isWishlisted ? 'Removed from wishlist' : 'Added to wishlist', description: product.name });
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); onQuickView?.(product);
  };

  /* ─── COMPACT card (used in grids) ─────────────────────────────────── */
  if (compact) {
    const catName = typeof product.category === 'object' ? (product.category?.name ?? '') : '';
    const imageBg = /ghee|bilona/i.test(catName)
      ? 'linear-gradient(145deg,#fdf4e0,#edd99a55)'
      : /wood.?pressed|pressed.?oil/i.test(catName)
      ? 'linear-gradient(145deg,#eaf2e5,#c8ddb855)'
      : /spice|masala|mirch|coriander|turmeric|haldi|chilli/i.test(catName)
      ? 'linear-gradient(145deg,#faeae8,#f0cecb55)'
      : '#f8f3ea';
    const chipStyle = /ghee|bilona/i.test(catName)
      ? { bg: 'rgba(196,150,10,0.12)', color: '#6b4200', border: 'rgba(196,150,10,0.28)' }
      : /wood.?pressed|pressed.?oil/i.test(catName)
      ? { bg: 'rgba(26,110,50,0.10)', color: '#155c2c', border: 'rgba(26,110,50,0.22)' }
      : /spice|masala|mirch|coriander|turmeric|haldi|chilli/i.test(catName)
      ? { bg: 'rgba(180,50,30,0.09)', color: '#8b2a1a', border: 'rgba(180,50,30,0.22)' }
      : { bg: 'rgba(46,66,37,0.06)', color: 'rgba(46,66,37,0.52)', border: 'rgba(46,66,37,0.14)' };

    return (
      <motion.article
        className="group relative"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.18) }}
      >
        <Link href={`/products/${product.slug}`} className="block">
          <div
            className="bg-white rounded-xl overflow-hidden"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', transition: 'box-shadow 0.25s ease' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; setIsHovered(true); }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'; setIsHovered(false); }}
          >
            {/* Image */}
            <div className="relative overflow-hidden" style={{ aspectRatio: '4/5', background: imageBg }}>
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(135deg,#f5efe3,#ede7d5)' }} />
              )}
              <Image
                src={imageError ? '/images/placeholder-product.svg' : (product.images?.[0] || '/images/placeholder-product.svg')}
                alt={product.name}
                fill
                className={`object-cover transition-transform duration-500 ${isHovered ? 'scale-[1.05]' : 'scale-100'} ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => { setImageError(true); setImageLoaded(true); }}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                unoptimized={imageError}
              />

              {/* Badges — top left, max 1 */}
              <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                {discount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: '#c0392b', color: '#fff', padding: '2px 6px', borderRadius: 4, lineHeight: 1.4 }}>
                    -{discount}%
                  </span>
                )}
                {showMostPopular && !discount && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: '#0b1c08', color: '#fff', padding: '2px 6px', borderRadius: 4, lineHeight: 1.4 }}>
                    🔥 Best
                  </span>
                )}
                {isBestSeller && !showMostPopular && !discount && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: '#0b1c08', color: '#fff', padding: '2px 6px', borderRadius: 4, lineHeight: 1.4 }}>
                    Best Seller
                  </span>
                )}
                {isNew && !discount && !isBestSeller && !showMostPopular && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: '#1a5210', color: '#fff', padding: '2px 6px', borderRadius: 4, lineHeight: 1.4 }}>
                    New
                  </span>
                )}
                {isLowStock && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: '#d97706', color: '#fff', padding: '2px 6px', borderRadius: 4, lineHeight: 1.4 }}>
                    Only {totalStock} left
                  </span>
                )}
              </div>

              {/* Wishlist — top right */}
              <div className="relative">
                <button
                  onClick={handleWishlist}
                  className="absolute top-2 right-2 z-10 flex items-center justify-center rounded-full transition-all duration-200"
                  style={{
                    width: 28, height: 28,
                    background: isWishlisted ? '#c0392b' : 'rgba(255,255,255,0.92)',
                    color: isWishlisted ? '#fff' : 'rgba(11,28,8,0.55)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                  }}
                >
                  <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-current' : ''}`} />
                </button>
                <AnimatePresence>
                  {heartBurst && [...Array(5)].map((_, i) => (
                    <motion.div key={i}
                      className="absolute z-20 rounded-full"
                      style={{ top: 16, right: 16, width: 6, height: 6, background: '#c0392b' }}
                      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                      animate={{ x: Math.cos(i * 72 * Math.PI / 180) * 18, y: Math.sin(i * 72 * Math.PI / 180) * 18, scale: 0, opacity: 0 }}
                      transition={{ duration: 0.5 }}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Add to cart — slide up on hover */}
              {totalStock > 0 ? (
                <div
                  className="absolute bottom-0 inset-x-0 z-10 transition-transform duration-300 ease-out"
                  style={{ transform: isHovered ? 'translateY(0)' : 'translateY(100%)' }}
                >
                  <button
                    ref={addToCartBtnRef}
                    onClick={handleAddToCart}
                    disabled={isAddingToCart || showSuccess}
                    className="w-full flex items-center justify-center gap-1.5 font-semibold transition-colors"
                    style={{
                      padding: '10px 0',
                      fontSize: 12,
                      background: showSuccess ? '#1a5210' : '#0b1c08',
                      color: '#fff',
                    }}
                    onMouseEnter={(e) => { if (!showSuccess) (e.currentTarget as HTMLElement).style.background = '#1a5210'; }}
                    onMouseLeave={(e) => { if (!showSuccess) (e.currentTarget as HTMLElement).style.background = '#0b1c08'; }}
                  >
                    {isAddingToCart ? (
                      <div className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-white animate-spin" />
                    ) : showSuccess ? (
                      <><Check className="w-3.5 h-3.5" /> Added!</>
                    ) : (
                      <><ShoppingBag className="w-3.5 h-3.5" /> Add to Cart</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.55)' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(11,28,8,0.75)', color: '#fff', padding: '4px 10px', borderRadius: 99 }}>Out of Stock</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ padding: '10px 10px 12px' }}>
              {typeof product.category === 'object' && product.category?.name && (
                <span style={{
                  display: 'inline-block',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '2px 7px', borderRadius: 99, marginBottom: 5,
                  background: chipStyle.bg,
                  color: chipStyle.color,
                  border: `1px solid ${chipStyle.border}`,
                }}>
                  {product.category.name}
                </span>
              )}
              <h3
                className="line-clamp-2 font-semibold"
                style={{ fontSize: 13, color: '#0b1c08', lineHeight: 1.35, marginBottom: 6, letterSpacing: '-0.01em' }}
              >
                {product.name}
              </h3>

              {/* Stars */}
              <div className="flex items-center gap-1" style={{ marginBottom: 7 }}>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-2.5 h-2.5"
                    style={{ fill: i < 4 ? '#a07010' : 'transparent', color: i < 4 ? '#a07010' : 'rgba(46,66,37,0.18)' }}
                  />
                ))}
                <span style={{ fontSize: 10, color: 'rgba(46,66,37,0.42)' }}>({reviewCount})</span>
              </div>

              {/* Price */}
              <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0b1c08', letterSpacing: '-0.02em' }}>
                  ₹{product.price.toLocaleString()}
                </span>
                {product.compareAtPrice && product.compareAtPrice > product.price && (
                  <span style={{ fontSize: 11, color: 'rgba(46,66,37,0.35)', textDecoration: 'line-through' }}>
                    ₹{product.compareAtPrice.toLocaleString()}
                  </span>
                )}
              </div>
              {discount > 0 && product.compareAtPrice && (
                <p style={{ fontSize: 10, fontWeight: 600, color: '#1a5210', marginTop: 2 }}>
                  Save ₹{(product.compareAtPrice - product.price).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </Link>
      </motion.article>
    );
  }

  /* ─── FULL card (hero / featured layouts) ──────────────────────────── */
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
        <div className={cn(
          "relative bg-white overflow-hidden transition-all duration-500 hover:shadow-brand-xl rounded-2xl",
          product.isFeatured && "ring-2 ring-brand-mustard/60"
        )}>
          <div className="relative aspect-square overflow-hidden bg-brand-cream">
            {!imageLoaded && <div className="absolute inset-0 bg-gradient-to-br from-brand-cream to-brand-sand animate-pulse" />}
            <motion.div className="relative w-full h-full"
              animate={{ scale: isHovered ? 1.07 : 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image src={imageError ? '/images/placeholder-product.svg' : (product.images?.[0] || '/images/placeholder-product.svg')} alt={product.name}
                fill className={`object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => { setImageError(true); setImageLoaded(true); }}
                sizes="(max-width: 768px) 100vw, 33vw"
                unoptimized={imageError}
              />
            </motion.div>
            {product.images?.[1] && (
              <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: isHovered ? 1 : 0 }} transition={{ duration: 0.3 }}>
                <Image src={product.images[1] as string} alt={`${product.name} alternate`} fill className="object-cover" sizes="33vw" />
              </motion.div>
            )}

            <div className="absolute left-4 top-4 flex flex-col gap-2 z-10">
              {showMostPopular && (
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-brand-mustard text-white">Most popular</span>
              )}
              {product.isFeatured && (
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-brand-mustard to-brand-mustard-dark text-white flex items-center gap-1">
                  <Award className="w-3 h-3" /> Staff Pick
                </span>
              )}
              {isBestSeller && (
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-brand-charcoal text-white flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Best Seller
                </span>
              )}
              {discount > 0 && (
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-brand-terracotta text-white">-{discount}%</span>
              )}
              {isNew && (
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-brand-green text-white">New</span>
              )}
            </div>

            <div className="absolute right-4 top-4 flex flex-col gap-2 z-10">
              <div className="relative">
                <motion.button onClick={handleWishlist}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${isWishlisted ? 'bg-brand-terracotta text-white' : 'bg-white/90 backdrop-blur-sm text-brand-charcoal hover:bg-brand-terracotta hover:text-white'}`}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
                >
                  <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current' : ''}`} />
                </motion.button>
              </div>
              {isHovered && onQuickView && (
                <motion.button onClick={handleQuickView}
                  className="w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm text-brand-charcoal flex items-center justify-center hover:bg-brand-charcoal hover:text-white transition-all duration-300"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                >
                  <Eye className="w-5 h-5" />
                </motion.button>
              )}
            </div>

            <AnimatePresence>
              {isHovered && totalStock > 0 && (
                <motion.div className="absolute bottom-0 left-0 right-0 p-4"
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3 }}
                >
                  <motion.button ref={addToCartBtnRef} onClick={handleAddToCart}
                    disabled={isAddingToCart || showSuccess}
                    className={cn("w-full py-3 rounded-2xl font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-90",
                      showSuccess ? "bg-brand-green text-white" : "bg-brand-charcoal text-white hover:bg-brand-green")}
                    whileHover={!showSuccess ? { scale: 1.02 } : {}} whileTap={!showSuccess ? { scale: 0.98 } : {}}
                  >
                    {isAddingToCart ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : showSuccess ? (
                      <><Check className="w-5 h-5" /> Added!</>
                    ) : (
                      <><ShoppingBag className="w-5 h-5" /> Add to Cart</>
                    )}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {totalStock === 0 && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                <span className="px-6 py-2 bg-brand-charcoal text-white rounded-full font-medium">Out of Stock</span>
              </div>
            )}
          </div>

          <div className="p-5">
            {typeof product.category === 'object' && product.category?.name && (
              <span className="text-xs text-brand-muted uppercase tracking-wider">{product.category.name}</span>
            )}
            <h3 className="font-display font-semibold text-brand-charcoal line-clamp-2 group-hover:text-brand-green transition-colors text-lg mt-1">
              {product.name}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={cn("w-4 h-4", i < 4 ? "fill-brand-mustard text-brand-mustard" : "text-brand-border")} />
                ))}
              </div>
              <span className="text-sm text-brand-muted">({reviewCount})</span>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="font-display font-bold text-xl text-brand-charcoal">₹{product.price.toLocaleString()}</span>
              {product.compareAtPrice && product.compareAtPrice > product.price && (
                <span className="text-sm text-brand-muted line-through">₹{product.compareAtPrice.toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

export function PremiumProductCardCompact({ product, index = 0 }: Omit<PremiumProductCardProps, 'onQuickView'>) {
  const addItem   = useCartStore((s) => s.addItem);
  const { toast } = useToast();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id, name: product.name, slug: product.slug,
      image: product.images[0] || '', price: product.price,
      compareAtPrice: product.compareAtPrice, gstPercentage: product.gstPercentage || 5,
    };
    await addItem(cartItem, 1);
    toast({ title: 'Added to cart', description: product.name });
  };

  return (
    <motion.article className="group"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link href={`/products/${product.slug}`}
        className="flex items-center gap-4 p-3 bg-white rounded-2xl hover:shadow-brand-md transition-all duration-300"
      >
        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-brand-cream flex-shrink-0">
          <Image src={product.images[0] || '/images/placeholder-product.jpg'} alt={product.name}
            fill className="object-cover group-hover:scale-110 transition-transform duration-500" sizes="80px" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-brand-charcoal truncate group-hover:text-brand-green transition-colors">{product.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-semibold text-brand-charcoal">₹{product.price.toLocaleString()}</span>
            {product.compareAtPrice && (
              <span className="text-sm text-brand-muted line-through">₹{product.compareAtPrice.toLocaleString()}</span>
            )}
          </div>
        </div>
        <button onClick={handleAddToCart}
          className="w-11 h-11 rounded-full bg-brand-cream flex items-center justify-center text-brand-charcoal hover:bg-brand-green hover:text-white transition-all duration-300 flex-shrink-0"
        >
          <ShoppingBag className="w-5 h-5" />
        </button>
      </Link>
    </motion.article>
  );
}
