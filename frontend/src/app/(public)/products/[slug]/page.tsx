'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Star, Truck, ShieldCheck, Leaf, Heart, Check,
  ChevronLeft, ChevronRight, Box, RotateCcw, Minus, Plus,
} from 'lucide-react';
import { QuantitySelector } from '@/components/ecommerce/quantity-selector';
import { useCartStore, CartItem } from '@/lib/cart-store';
import { useCustomerStore } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { cn, getProductTotalStock } from '@/lib/utils';
import type { Product, ProductReview } from '@/types';
import { useWishlistStore } from '@/lib/wishlist-store';
import { PremiumProductCard } from '@/components/ecommerce/premium-product-card';
import BilonaProcessSection, { isBilonaGheeProduct } from '@/components/ecommerce/BilonaProcessSection';
import { BatchStoryCard, PurityMeter, StockContextBanner } from '@/components/ecommerce/product-batch-panel';
import dynamic from 'next/dynamic';

const Product3DViewer = dynamic(
  () => import('@/components/three/scenes/Product3DViewer').then((mod) => mod.Product3DViewer),
  { ssr: false },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen pt-24" style={{ background: '#f2ece0' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-4 w-28 rounded-full bg-amber-100 animate-pulse mb-10" />
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
          <div className="space-y-3">
            <div className="aspect-square rounded-3xl bg-gradient-to-br from-amber-50 to-amber-100/60 animate-pulse" />
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-20 h-20 rounded-xl bg-amber-100 animate-pulse" />
              ))}
            </div>
          </div>
          <div className="space-y-4 pt-4">
            <div className="h-3 w-20 rounded bg-amber-100 animate-pulse" />
            <div className="h-10 w-3/4 rounded-xl bg-amber-100 animate-pulse" />
            <div className="h-5 w-1/3 rounded bg-amber-100 animate-pulse" />
            <div className="h-20 rounded-xl bg-amber-100 animate-pulse" />
            <div className="h-14 rounded-2xl bg-amber-100 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const params = useParams();
  const slug   = params.slug as string;

  const [quantity,            setQuantity]            = useState(1);
  const [selectedImageIndex,  setSelectedImageIndex]  = useState(0);
  const [selectedVariant,     setSelectedVariant]     = useState<string | null>(null);
  const [show3D,              setShow3D]              = useState(false);
  const [variantAutoSelected, setVariantAutoSelected] = useState(false);
  const [isAddingToCart,      setIsAddingToCart]      = useState(false);
  const [showCartSuccess,     setShowCartSuccess]     = useState(false);
  const [showReviewForm,      setShowReviewForm]      = useState(false);
  const [reviewRating,        setReviewRating]        = useState(5);
  const [reviewMessage,       setReviewMessage]       = useState('');
  const [submittingReview,    setSubmittingReview]    = useState(false);

  const addItem           = useCartStore((s) => s.addItem);
  const isAuthenticated   = useCustomerStore((s) => s.isAuthenticated);
  const { toast }         = useToast();
  const wishlistToggle    = useWishlistStore((s) => s.toggle);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api.getProductBySlug(slug),
  });

  const isInWishlist = useWishlistStore((s) =>
    product ? s.isInWishlist(product._id) : false,
  );

  const categoryId =
    product?.category && typeof product.category === 'object'
      ? (product.category as { _id: string })._id
      : typeof product?.category === 'string'
      ? product.category
      : undefined;

  const { data: relatedProducts } = useQuery<Product[]>({
    queryKey: ['products', 'related', categoryId ?? 'featured'],
    queryFn: async () => {
      if (categoryId) {
        const res = await api.getProducts({ category: categoryId, limit: 5, isActive: true });
        return res.items;
      }
      return api.getFeaturedProducts(5);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!product,
  });

  const { data: reviews, refetch: refetchReviews } = useQuery({
    queryKey: ['product-reviews', product?._id],
    queryFn: () => api.getProductReviews(product!._id),
    enabled: !!product?._id,
  });

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (product && product.variants?.length > 0 && !variantAutoSelected) {
      setSelectedVariant(product.variants[0].sku);
      setVariantAutoSelected(true);
    }
  }, [product, variantAutoSelected]);

  const selectedVariantData =
    product && selectedVariant ? product.variants.find((v) => v.sku === selectedVariant) : null;
  const currentPrice  = selectedVariantData?.price || product?.price || 0;
  const comparePrice  = selectedVariantData?.compareAtPrice || product?.compareAtPrice;
  const currentStock  = selectedVariantData ? (selectedVariantData.stock ?? 0) : (product?.stock || 0);
  const discount      = comparePrice ? Math.round(((comparePrice - currentPrice) / comparePrice) * 100) : 0;

  useEffect(() => {
    if (currentStock > 0 && quantity > currentStock) setQuantity(currentStock);
    if (currentStock === 0 && quantity !== 1) setQuantity(1);
  }, [currentStock, quantity]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleAddToCart = async () => {
    if (!product || isAddingToCart) return;
    setIsAddingToCart(true);

    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images[0] || '/images/products/placeholder.jpg',
      price: currentPrice,
      compareAtPrice: comparePrice,
      gstPercentage: product.gstPercentage,
      variantSku: selectedVariant || undefined,
      variantName: selectedVariantData?.name,
    };

    try {
      await addItem(cartItem, quantity);
      setShowCartSuccess(true);
      toast({ title: 'Added to cart', description: `${quantity} × ${product.name} added.` });
      setTimeout(() => setShowCartSuccess(false), 2000);
    } catch {
      toast({ title: 'Could not add to cart', variant: 'destructive' });
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleWishlist = async () => {
    if (!product) return;
    const nextState = !isInWishlist;
    wishlistToggle({ productId: product._id, slug: product.slug, name: product.name, image: product.images[0], price: currentPrice });
    try {
      if (isAuthenticated) {
        if (nextState) await api.addToWishlist(product._id);
        else           await api.removeFromWishlist(product._id);
      }
      toast({ title: nextState ? 'Added to wishlist' : 'Removed from wishlist' });
    } catch {
      toast({ title: 'Wishlist update failed', variant: 'destructive' });
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewMessage.trim()) return;
    setSubmittingReview(true);
    try {
      await api.createFeedback({ type: 'product_review', productId: product!._id, rating: reviewRating, message: reviewMessage });
      toast({ title: 'Review submitted!', description: 'Thank you for your feedback.' });
      setReviewMessage(''); setReviewRating(5); setShowReviewForm(false);
      refetchReviews();
    } catch {
      toast({ title: 'Failed to submit review', variant: 'destructive' });
    } finally {
      setSubmittingReview(false);
    }
  };

  // ── Computed ───────────────────────────────────────────────────────────────

  const avgRating = reviews?.length
    ? reviews.reduce((s: number, r: ProductReview) => s + (r.rating || 0), 0) / reviews.length
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSkeleton />;

  if (!product) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center" style={{ background: '#f2ece0' }}>
        <div className="text-center">
          <p className="font-display text-2xl font-bold mb-4" style={{ color: '#0b1c08' }}>Product not found</p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold"
            style={{ background: '#0b1c08', color: '#fff8f0' }}
          >
            Browse Products <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const images   = product.images.length > 0 ? product.images : [null];
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL;
  const productUrl = siteUrl ? `${siteUrl}/products/${product.slug}` : `/products/${product.slug}`;
  const totalStock = getProductTotalStock(product);

  const productJsonLd = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: product.name, image: images.filter(Boolean),
    description: product.shortDescription || (typeof product.description === 'string' ? product.description.replace(/<[^>]+>/g, '').slice(0, 200) : undefined),
    sku: product.sku,
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: currentPrice, availability: currentStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: productUrl },
  };

  return (
    <div className="min-h-screen pt-24" style={{ background: '#f2ece0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Breadcrumb ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-200"
            style={{ color: 'rgba(46,66,37,0.50)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#a07010')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(46,66,37,0.50)')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Products
          </Link>
        </motion.div>

        {/* ── Product main grid ──────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">

          {/* Left — Gallery ────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="lg:sticky lg:top-28"
          >
            {/* Main image / 3D */}
            <div
              className="relative aspect-square overflow-hidden rounded-3xl mb-3"
              style={{ background: 'rgba(255,252,245,0.95)', border: '1px solid rgba(26,82,16,0.12)', boxShadow: '0 8px 40px -12px rgba(13,44,7,0.12)' }}
            >
              {show3D ? (
                <Product3DViewer className="w-full h-full" />
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedImageIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0"
                  >
                    {images[selectedImageIndex] ? (
                      <Image
                        src={images[selectedImageIndex]!}
                        alt={product.name}
                        fill
                        className="object-cover"
                        priority
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="font-display font-black" style={{ fontSize: 'clamp(5rem, 20vw, 10rem)', color: 'rgba(160,112,16,0.12)', letterSpacing: '-0.04em' }}>
                          {(product.name || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}

              {/* Gallery arrows */}
              {!show3D && images.length > 1 && (
                <>
                  <button
                    onClick={() => setSelectedImageIndex((i) => (i === 0 ? images.length - 1 : i - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
                    style={{ background: 'rgba(255,252,245,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(26,82,16,0.15)', color: '#0b1c08' }}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSelectedImageIndex((i) => (i === images.length - 1 ? 0 : i + 1))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
                    style={{ background: 'rgba(255,252,245,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(26,82,16,0.15)', color: '#0b1c08' }}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* 3D toggle */}
              <button
                onClick={() => setShow3D(!show3D)}
                className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all duration-200"
                style={{ background: 'rgba(255,252,245,0.88)', backdropFilter: 'blur(8px)', border: '1px solid rgba(26,82,16,0.18)', color: '#0b1c08' }}
              >
                {show3D ? (<><RotateCcw className="w-3.5 h-3.5" /> Photos</>) : (<><Box className="w-3.5 h-3.5" /> View 3D</>)}
              </button>

              {/* Discount badge */}
              {discount > 0 && (
                <div
                  className="absolute top-4 left-4 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: '#a07010', color: '#fff' }}
                >
                  -{discount}%
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className="relative w-[72px] h-[72px] flex-shrink-0 rounded-2xl overflow-hidden transition-all duration-200"
                    style={{
                      border: `2px solid ${selectedImageIndex === index ? '#a07010' : 'rgba(26,82,16,0.12)'}`,
                      opacity: selectedImageIndex === index ? 1 : 0.65,
                    }}
                  >
                    {image ? (
                      <Image src={image} alt="" fill className="object-cover" sizes="72px" />
                    ) : (
                      <div className="w-full h-full" style={{ background: 'rgba(212,165,116,0.15)' }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Right — Info ───────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Category tag */}
            {typeof product.category === 'object' && product.category?.name && (
              <p style={{ fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(160,112,16,0.75)', fontFamily: 'monospace', marginBottom: 10 }}>
                {product.category.name}
              </p>
            )}

            {/* Product name */}
            <h1
              className="font-display font-bold text-brand-charcoal mb-3"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', letterSpacing: '-0.02em', lineHeight: 1.1 }}
            >
              {product.name}
            </h1>

            {/* Rating row */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4"
                    style={{
                      color: i < Math.round(avgRating) ? '#a07010' : 'rgba(26,82,16,0.20)',
                      fill:  i < Math.round(avgRating) ? '#a07010' : 'rgba(26,82,16,0.20)',
                    }}
                  />
                ))}
              </div>
              <span className="text-sm" style={{ color: 'rgba(46,66,37,0.50)' }}>
                {reviews?.length
                  ? `${avgRating.toFixed(1)} · ${reviews.length} review${reviews.length !== 1 ? 's' : ''}`
                  : 'No reviews yet'}
              </span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3 mb-5">
              <span
                className="font-display font-bold"
                style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: '#0b1c08', letterSpacing: '-0.01em' }}
              >
                {formatPrice(currentPrice)}
              </span>
              {comparePrice && comparePrice > currentPrice && (
                <>
                  <span className="text-lg line-through" style={{ color: 'rgba(46,66,37,0.35)' }}>
                    {formatPrice(comparePrice)}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(101,153,55,0.12)', color: '#3d6b22' }}
                  >
                    Save {formatPrice(comparePrice - currentPrice)}
                  </span>
                </>
              )}
            </div>

            {/* Short description */}
            {product.shortDescription && (
              <p className="text-base leading-relaxed mb-5" style={{ color: 'rgba(13,44,7,0.65)' }}>
                {product.shortDescription}
              </p>
            )}

            {/* ── Batch Story + Purity + Stock context ── */}
            {product.batchInfo && (
              <div className="space-y-3 mb-5">
                <BatchStoryCard info={product.batchInfo} />
                {product.batchInfo.purityClaims && product.batchInfo.purityClaims.length > 0 && (
                  <PurityMeter claims={product.batchInfo.purityClaims} />
                )}
              </div>
            )}
            <div className="mb-4">
              <StockContextBanner
                stock={totalStock}
                threshold={product.lowStockThreshold ?? 5}
                nextBatchDays={product.batchInfo?.nextBatchDays}
                batchNumber={product.batchInfo?.batchNumber}
              />
            </div>

            {/* Divider */}
            <div className="mb-6" style={{ height: 1, background: 'rgba(26,82,16,0.12)' }} />

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(46,66,37,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Size
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.sku}
                      onClick={() => setSelectedVariant(variant.sku)}
                      disabled={variant.stock === 0}
                      className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200', variant.stock === 0 && 'opacity-40 cursor-not-allowed')}
                      style={{
                        border: `1.5px solid ${selectedVariant === variant.sku ? '#a07010' : 'rgba(26,82,16,0.20)'}`,
                        background: selectedVariant === variant.sku ? 'rgba(160,112,16,0.10)' : 'transparent',
                        color: selectedVariant === variant.sku ? '#a07010' : 'rgba(13,44,7,0.70)',
                      }}
                    >
                      {variant.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity + Add to cart */}
            <div className="flex items-center gap-3 mb-4">
              <QuantitySelector value={quantity} onChange={setQuantity} min={1} max={currentStock} size="lg" />
              <motion.button
                onClick={handleAddToCart}
                disabled={currentStock === 0 || isAddingToCart}
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                style={{
                  background: showCartSuccess ? 'rgba(101,153,55,0.90)' : '#a07010',
                  color: '#fff',
                  boxShadow: showCartSuccess ? '0 4px 20px -4px rgba(101,153,55,0.45)' : '0 4px 20px -4px rgba(160,112,16,0.45)',
                }}
                whileHover={{ scale: currentStock === 0 ? 1 : 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isAddingToCart ? (
                  <motion.div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
                ) : showCartSuccess ? (
                  <><Check className="w-4 h-4" /> Added!</>
                ) : currentStock === 0 ? (
                  'Out of Stock'
                ) : (
                  'Add to Cart'
                )}
              </motion.button>

              <button
                onClick={handleWishlist}
                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 flex-shrink-0"
                style={{
                  border: `1.5px solid ${isInWishlist ? '#a07010' : 'rgba(26,82,16,0.20)'}`,
                  background: isInWishlist ? 'rgba(160,112,16,0.10)' : 'transparent',
                  color: isInWishlist ? '#a07010' : 'rgba(46,66,37,0.50)',
                }}
              >
                <Heart className={cn('w-5 h-5', isInWishlist && 'fill-current')} />
              </button>
            </div>


            {/* Trust features */}
            <div
              className="rounded-2xl p-4 grid grid-cols-3 gap-3 mt-6"
              style={{ background: 'rgba(255,252,245,0.80)', border: '1px solid rgba(26,82,16,0.10)' }}
            >
              {[
                { icon: Truck,        label: 'Free shipping', sub: 'orders ₹999+' },
                { icon: ShieldCheck,  label: '100% pure',     sub: 'no additives'  },
                { icon: Leaf,         label: 'Traditional',   sub: 'wood-pressed'  },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex flex-col items-center text-center gap-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(160,112,16,0.12)' }}>
                    <Icon className="w-4 h-4" style={{ color: '#a07010' }} />
                  </div>
                  <span className="text-xs font-semibold" style={{ color: '#0b1c08' }}>{label}</span>
                  <span className="text-[10px]" style={{ color: 'rgba(46,66,37,0.45)' }}>{sub}</span>
                </div>
              ))}
            </div>

            {/* Full description */}
            {product.description && (
              <div className="mt-10 pt-8" style={{ borderTop: '1px solid rgba(26,82,16,0.10)' }}>
                <h3 className="font-display text-lg font-bold mb-4" style={{ color: '#0b1c08' }}>About this product</h3>
                <div
                  className="text-sm leading-relaxed prose prose-brand"
                  style={{ color: 'rgba(13,44,7,0.70)' }}
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Bilona Process Animation (ghee products only) ──────── */}
        {isBilonaGheeProduct(product) && (
          <motion.div
            className="mt-16"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <BilonaProcessSection />
          </motion.div>
        )}

        {/* ── Reviews ────────────────────────────────────────────── */}
        <div className="mt-24">
          <div
            className="flex items-center justify-between mb-8 pb-5"
            style={{ borderBottom: '1px solid rgba(26,82,16,0.10)' }}
          >
            <div>
              <p style={{ fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(46,66,37,0.40)', fontFamily: 'monospace', marginBottom: 6 }}>
                Community
              </p>
              <h2 className="font-display text-2xl font-bold" style={{ color: '#0b1c08' }}>
                Customer Reviews
                {reviews?.length ? <span className="text-base font-normal ml-2" style={{ color: 'rgba(46,66,37,0.40)' }}>({reviews.length})</span> : null}
              </h2>
            </div>
            {isAuthenticated && !showReviewForm && (
              <button
                onClick={() => setShowReviewForm(true)}
                className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200"
                style={{ border: '1.5px solid rgba(26,82,16,0.25)', color: '#0b1c08', background: 'transparent' }}
              >
                Write a review
              </button>
            )}
          </div>

          {/* Review form */}
          <AnimatePresence>
            {showReviewForm && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl p-6 mb-8"
                style={{ background: 'rgba(255,252,245,0.90)', border: '1px solid rgba(26,82,16,0.12)' }}
              >
                <h3 className="font-display text-lg font-bold mb-5" style={{ color: '#0b1c08' }}>Your Review</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(46,66,37,0.55)' }}>Rating</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setReviewRating(star)} className="p-0.5">
                          <Star
                            className="w-6 h-6 transition-colors"
                            style={{ color: star <= reviewRating ? '#a07010' : 'rgba(26,82,16,0.25)', fill: star <= reviewRating ? '#a07010' : 'transparent' }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(46,66,37,0.55)' }}>Review</p>
                    <textarea
                      className="w-full min-h-[100px] rounded-2xl px-4 py-3 text-sm outline-none resize-none transition-all duration-200"
                      style={{ background: 'rgba(255,252,245,0.70)', border: '1px solid rgba(26,82,16,0.18)', color: '#0b1c08' }}
                      placeholder="Share your experience…"
                      value={reviewMessage}
                      onChange={(e) => setReviewMessage(e.target.value)}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(160,112,16,0.40)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(26,82,16,0.18)')}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSubmitReview}
                      disabled={submittingReview || !reviewMessage.trim()}
                      className="px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                      style={{ background: '#a07010', color: '#fff' }}
                    >
                      {submittingReview ? 'Submitting…' : 'Submit review'}
                    </button>
                    <button
                      onClick={() => setShowReviewForm(false)}
                      className="px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200"
                      style={{ border: '1px solid rgba(26,82,16,0.20)', color: 'rgba(46,66,37,0.60)', background: 'transparent' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reviews list */}
          {reviews?.length ? (
            <div className="space-y-4">
              {reviews.map((review: ProductReview) => (
                <motion.div
                  key={review._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-5"
                  style={{ background: 'rgba(255,252,245,0.80)', border: '1px solid rgba(26,82,16,0.10)' }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5" style={{ color: i < (review.rating || 0) ? '#a07010' : 'rgba(26,82,16,0.20)', fill: i < (review.rating || 0) ? '#a07010' : 'rgba(26,82,16,0.20)' }} />
                      ))}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: '#0b1c08' }}>
                      {review.user?.name ?? review.userId?.name ?? 'Customer'}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(46,66,37,0.40)' }}>
                      {new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(13,44,7,0.70)' }}>{review.message}</p>
                  {review.adminResponse && (
                    <div className="mt-3 pl-4 pt-3" style={{ borderLeft: '2px solid #a07010' }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: '#a07010' }}>Store Response</p>
                      <p className="text-sm" style={{ color: 'rgba(13,44,7,0.65)' }}>{review.adminResponse}</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 rounded-3xl" style={{ background: 'rgba(255,252,245,0.60)', border: '1px solid rgba(26,82,16,0.08)' }}>
              <p className="text-sm" style={{ color: 'rgba(46,66,37,0.40)' }}>No reviews yet — be the first!</p>
            </div>
          )}
        </div>

        {/* ── Related products ───────────────────────────────────── */}
        {relatedProducts && relatedProducts.filter((p) => p._id !== product._id).length > 0 && (
          <div className="mt-24">
            <p style={{ fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(46,66,37,0.40)', fontFamily: 'monospace', marginBottom: 10 }}>
              Discover more
            </p>
            <h2 className="font-display text-2xl font-bold mb-8" style={{ color: '#0b1c08' }}>You May Also Like</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {relatedProducts
                .filter((p) => p._id !== product._id)
                .slice(0, 4)
                .map((p, index) => (
                  <PremiumProductCard key={p._id} product={p} index={index} compact />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
