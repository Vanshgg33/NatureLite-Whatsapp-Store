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
  const [isHovered,        setIsHovered]        = useState(false);
  const [isWishlisted,     setIsWishlisted]     = useState(false);
  const [imageLoaded,      setImageLoaded]      = useState(false);
  const [imageError,       setImageError]       = useState(false);
  const [showSuccess,      setShowSuccess]      = useState(false);
  const [heartBurst,       setHeartBurst]       = useState(false);
  const [selectedVarIdx,   setSelectedVarIdx]   = useState<number | null>(null);
  const addToCartBtnRef = useRef<HTMLButtonElement>(null);
  const tiltRef  = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);

  // Use direct DOM manipulation instead of state to avoid re-renders on every mousemove
  const handleCardMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = tiltRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    el.style.transform = `rotateX(${(relY - 0.5) * 9}deg) rotateY(${(relX - 0.5) * -9}deg)`;
    if (shineRef.current) {
      shineRef.current.style.backgroundImage = `radial-gradient(circle at ${relX * 100}% ${relY * 100}%, rgba(255,255,255,0.22) 0%, transparent 65%)`;
    }
  };
  const handleCardMouseLeave = () => {
    const el = tiltRef.current;
    if (el) {
      el.style.transition = 'transform 0.45s ease, box-shadow 0.25s ease';
      el.style.transform = 'rotateX(0deg) rotateY(0deg)';
    }
  };

  const addItem    = useCartStore((s) => s.addItem);
  const cartItems  = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const { toast }  = useToast();
  const flyAnimation = useAddToCartAnimation();

  const displayVariants = product.variants?.filter((v) => v.isActive) ?? [];
  const selectedVar  = selectedVarIdx !== null ? (displayVariants[selectedVarIdx] ?? null) : null;

  const cartItemForSelectedVar = cartItems.find(
    (item) => item.productId === product._id && (!selectedVar ? !item.variantSku : item.variantSku === selectedVar.sku)
  );
  const quantityInCart = cartItemForSelectedVar?.quantity ?? 0;

  // Only swap to variant image on explicit click; default to product image
  const displayImage = (selectedVarIdx !== null && selectedVar?.images?.length ? selectedVar.images[0] : null) ?? product.images?.[0] ?? null;
  const displayPrice = selectedVar?.price ?? product.price;
  const displayCompare = selectedVar?.compareAtPrice ?? product.compareAtPrice;
  const discount   = displayCompare
    ? Math.round(((displayCompare - displayPrice) / displayCompare) * 100) : 0;
  const isNew      = new Date(product.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
  const totalStock = getProductTotalStock(product);
  const isLowStock = forceShowOnlyXLeft ?? (totalStock <= (product.lowStockThreshold || 5) && totalStock > 0);
  const isBestSeller = product.totalSold > 50;
  const reviewCount  = product.totalSold || 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (showSuccess) return;
    // Instantly show success state — optimistic UI, no waiting for server
    setShowSuccess(true);
    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id, name: product.name, slug: product.slug,
      image: product.images?.[0] || '', price: displayPrice,
      compareAtPrice: displayCompare, gstPercentage: product.gstPercentage || 5,
      ...(selectedVar && { variantSku: selectedVar.sku, variantName: selectedVar.name }),
    };
    if (flyAnimation && addToCartBtnRef.current)
      flyAnimation.triggerFlyAnimation(product.images?.[0] || '', addToCartBtnRef.current.getBoundingClientRect());
    toast({ title: 'Added to cart', description: `${product.name} added.` });
    // Fire-and-forget: sync with server in background
    addItem(cartItem, 1).catch(() => {
      toast({ title: 'Error', description: 'Failed to add item.', variant: 'destructive' });
    });
    setTimeout(() => setShowSuccess(false), 1500);
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
        onMouseMove={handleCardMouseMove}
        onMouseLeave={handleCardMouseLeave}
        style={{ perspective: 700 }}
      >
        <Link href={`/products/${product.slug}`} className="block">
          <div
            ref={tiltRef}
            className="bg-white rounded-xl overflow-hidden"
            style={{
              boxShadow: isHovered ? '0 12px 32px rgba(0,0,0,0.13)' : '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'transform 0.45s ease, box-shadow 0.25s ease',
            }}
            onMouseEnter={() => {
              setIsHovered(true);
              if (tiltRef.current) tiltRef.current.style.transition = 'transform 0.10s ease, box-shadow 0.25s ease';
            }}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Image */}
            <div className="relative overflow-hidden" style={{ aspectRatio: '4/5', background: imageBg }}>
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(135deg,#f5efe3,#ede7d5)' }} />
              )}
              <div className={`absolute inset-0 transition-transform duration-500 ${isHovered ? 'scale-[1.05]' : 'scale-100'}`}>
                <Image
                  src={imageError ? '/images/placeholder-product.svg' : (displayImage || '/images/placeholder-product.svg')}
                  alt={product.name}
                  fill
                  className={`object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => { setImageError(true); setImageLoaded(true); }}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  unoptimized={imageError}
                />
              </div>

              {/* Shine overlay */}
              <div
                ref={shineRef}
                className="absolute inset-0 pointer-events-none z-[5] rounded-t-xl transition-opacity duration-300"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.22) 0%, transparent 65%)`,
                  opacity: isHovered ? 1 : 0,
                }}
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
                  className="absolute top-2 right-2 z-10 flex items-center justify-center rounded-full cursor-pointer"
                  style={{
                    width: 28, height: 28,
                    background: isWishlisted ? '#c0392b' : 'rgba(255,255,255,0.92)',
                    color: isWishlisted ? '#fff' : 'rgba(11,28,8,0.55)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                    transition: 'background 0.1s, color 0.1s',
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

              {/* Out of Stock overlay on image if overall product out of stock */}
              {totalStock <= 0 && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.55)', zIndex: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(11,28,8,0.75)', color: '#fff', padding: '4px 10px', borderRadius: 99 }}>Out of Stock</span>
                </div>
              )}

              {/* Quick View button */}
              {onQuickView && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickView(product); }}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-20 cursor-pointer"
                  style={{
                    background: 'rgba(11,28,8,0.78)',
                    backdropFilter: 'blur(8px)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '5px 12px',
                    borderRadius: 99,
                    opacity: isHovered ? 1 : 0,
                    transform: `translateX(-50%) translateY(${isHovered ? '0px' : '6px'})`,
                    transition: 'opacity 0.2s, transform 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Eye className="w-3 h-3" />
                  Quick View
                </button>
              )}
            </div>

            {/* Info */}
            <div style={{ padding: '12px 12px 14px' }}>
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

              {/* Stars - styled subtly */}
              <div className="flex items-center gap-1" style={{ marginBottom: 7 }}>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-2.5 h-2.5"
                    style={{ fill: i < 4 ? '#a07010' : 'transparent', color: i < 4 ? '#a07010' : 'rgba(46,66,37,0.18)' }}
                  />
                ))}
                <span style={{ fontSize: 10, color: 'rgba(46,66,37,0.42)' }}>({reviewCount})</span>
              </div>

              {/* Price block - displayed ABOVE variants */}
              <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mb-3">
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0b1c08', letterSpacing: '-0.02em' }}>
                  ₹{displayPrice.toLocaleString()}
                </span>
                {displayCompare && displayCompare > displayPrice && (
                  <span style={{ fontSize: 11, color: 'rgba(46,66,37,0.35)', textDecoration: 'line-through' }}>
                    ₹{displayCompare.toLocaleString()}
                  </span>
                )}
                {discount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#c0392b', background: '#fee2e2', padding: '1px 5px', borderRadius: 4 }}>
                    {discount}% off
                  </span>
                )}
              </div>

              {/* Variant pills - displayed BELOW price */}
              {displayVariants.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {displayVariants.slice(0, 6).map((v, i) => {
                    const raw = v.attributes?.volume ?? v.attributes?.size ?? v.attributes?.weight ?? v.name;
                    const label = String(raw).length > 10 ? String(raw).slice(0, 10) : String(raw);
                    const isSelected = i === selectedVarIdx;
                    const isOOS = v.stock <= 0;
                    return (
                      <button
                        key={v.sku}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!isOOS) { setSelectedVarIdx(selectedVarIdx === i ? null : i); setImageError(false); } }}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '5px 11px',
                          borderRadius: 99,
                          cursor: isOOS ? 'not-allowed' : 'pointer',
                          background: isSelected
                            ? 'linear-gradient(135deg, #1a3a14 0%, #2d5c24 100%)'
                            : isOOS
                            ? 'rgba(46,66,37,0.04)'
                            : 'rgba(46,66,37,0.06)',
                          color: isSelected ? '#e8f5e1' : isOOS ? 'rgba(46,66,37,0.25)' : 'rgba(46,66,37,0.70)',
                          border: `1.5px solid ${isSelected ? 'transparent' : isOOS ? 'rgba(46,66,37,0.10)' : 'rgba(46,66,37,0.18)'}`,
                          textDecoration: isOOS ? 'line-through' : 'none',
                          letterSpacing: '0.02em',
                          lineHeight: 1,
                          boxShadow: isSelected
                            ? '0 2px 8px rgba(26,58,20,0.28), inset 0 1px 0 rgba(255,255,255,0.10)'
                            : 'none',
                          transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                          transform: isSelected ? 'scale(1.06)' : 'scale(1)',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Add to Cart / Quantity Modifier - ALWAYS visible at the bottom */}
              <div className="mt-3 w-full">
                {totalStock <= 0 || (selectedVar && selectedVar.stock <= 0) ? (
                  <div className="w-full h-10 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl font-semibold text-xs border border-gray-200 select-none">
                    Out of Stock
                  </div>
                ) : quantityInCart > 0 ? (
                  <div className="flex items-center h-10 w-full rounded-xl border border-[#0b1c08] overflow-hidden bg-white shadow-sm">
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        updateQuantity(product._id, quantityInCart - 1, selectedVar?.sku);
                      }}
                      className="w-1/3 h-full flex items-center justify-center hover:bg-gray-50 text-[#0b1c08] font-bold text-lg cursor-pointer"
                      style={{ transition: 'background 0.1s' }}
                      title="Decrease quantity"
                    >
                      −
                    </button>
                    <div className="w-1/3 h-full flex items-center justify-center bg-[#0b1c08] text-white font-bold text-sm">
                      {quantityInCart}
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        updateQuantity(product._id, quantityInCart + 1, selectedVar?.sku);
                      }}
                      className="w-1/3 h-full flex items-center justify-center hover:bg-gray-50 text-[#0b1c08] font-bold text-lg cursor-pointer"
                      style={{ transition: 'background 0.1s' }}
                      title="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    ref={addToCartBtnRef}
                    onClick={handleAddToCart}
                    className="w-full h-10 flex items-center justify-center gap-1.5 font-bold text-xs text-[#0b1c08] border border-[#0b1c08] rounded-xl bg-white hover:bg-gray-50 cursor-pointer active:scale-[0.97]"
                    style={{ transition: 'background 0.1s, transform 0.1s' }}
                  >
                    {showSuccess ? (
                      <>✔ Added!</>
                    ) : (
                      <>+ Add to Cart</>
                    )}
                  </button>
                )}
              </div>
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
            <motion.div
              className="absolute inset-[7%]"
              animate={{ scale: isHovered ? 1.07 : 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image src={imageError ? '/images/placeholder-product.svg' : (product.images?.[0] || '/images/placeholder-product.svg')} alt={product.name}
                fill className={`object-contain transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
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
              {onQuickView && (
                <button
                  onClick={handleQuickView}
                  className="w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm text-brand-charcoal flex items-center justify-center hover:bg-brand-charcoal hover:text-white transition-all duration-300"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    transform: isHovered ? 'translateX(0)' : 'translateX(8px)',
                    transition: 'opacity 0.25s ease, transform 0.25s ease',
                  }}
                >
                  <Eye className="w-5 h-5" />
                </button>
              )}
            </div>

            {totalStock > 0 && (
              <div
                className="absolute bottom-0 left-0 right-0 p-4 transition-all duration-300"
                style={{
                  opacity: isHovered ? 1 : 0,
                  transform: isHovered ? 'translateY(0)' : 'translateY(12px)',
                }}
              >
                <button
                  ref={addToCartBtnRef}
                  onClick={handleAddToCart}
                  className={cn(
                    "w-full py-3 rounded-2xl font-medium flex items-center justify-center gap-2 cursor-pointer active:scale-[0.97]",
                    showSuccess ? "bg-brand-green text-white" : "bg-brand-charcoal text-white hover:bg-brand-green"
                  )}
                  style={{ transition: 'background-color 0.1s, transform 0.1s' }}
                >
                  {showSuccess ? (
                    <><Check className="w-5 h-5" /> Added!</>
                  ) : (
                    <><ShoppingBag className="w-5 h-5" /> Add to Cart</>
                  )}
                </button>
              </div>
            )}

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
          <div className="absolute inset-[8%] group-hover:scale-110 transition-transform duration-500">
            <Image src={product.images[0] || '/images/placeholder-product.jpg'} alt={product.name}
              fill className="object-contain" sizes="64px" />
          </div>
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
