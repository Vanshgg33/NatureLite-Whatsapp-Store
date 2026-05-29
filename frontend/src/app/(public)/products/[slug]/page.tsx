'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Star, Truck, ShieldCheck, Leaf, Heart, Check,
  ChevronLeft, ChevronRight, Minus, Plus,
} from 'lucide-react';
import { QuantitySelector } from '@/components/ecommerce/quantity-selector';
import { useAddToCartAnimation } from '@/components/ecommerce/add-to-cart-animation';
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
import { ProductVideoSection } from '@/components/ecommerce/product-video-section';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

// Break emoji-bulleted plain text into spaced paragraphs; pass HTML through unchanged
const formatDescription = (desc: string): string => {
  if (!desc) return '';
  if (/<[a-z]/i.test(desc)) return desc;
  // Split before common emoji code points (surrogate pairs in JS: 🌀 range etc.)
  // Use a simple approach: split on characters in the high-surrogate emoji range
  const parts = desc
    .replace(/([\uD800-\uDBFF][\uDC00-\uDFFF]|[☀-➿])/g, '\n$1')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return `<p>${desc}</p>`;
  return parts.map((s) => `<p>${s}</p>`).join('');
};

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: '#f7f1e8' }}>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        <div className="h-4 w-28 rounded-full bg-amber-100 animate-pulse mb-10" />
        <div className="grid lg:grid-cols-[55%_1fr] gap-10 lg:gap-16">
          <div className="rounded-3xl bg-amber-50 animate-pulse" style={{ minHeight: 560 }} />
          <div className="space-y-6 pt-2">
            <div className="h-3 w-20 rounded-full bg-amber-100 animate-pulse" />
            <div className="space-y-3">
              <div className="h-10 w-full rounded-xl bg-amber-100 animate-pulse" />
              <div className="h-10 w-4/5 rounded-xl bg-amber-100 animate-pulse" />
            </div>
            <div className="h-16 w-40 rounded-xl bg-amber-100 animate-pulse" />
            <div className="h-14 rounded-2xl bg-amber-100 animate-pulse" />
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
  const flyAnimation      = useAddToCartAnimation();
  const ctaBtnRef         = useRef<HTMLButtonElement>(null);
  const [ctaPulse,        setCtaPulse]         = useState(false);

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
      setCtaPulse(true);
      setTimeout(() => setCtaPulse(false), 700);
      if (flyAnimation && ctaBtnRef.current && product.images[0]) {
        flyAnimation.triggerFlyAnimation(product.images[0], ctaBtnRef.current.getBoundingClientRect());
      }
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
      <div className="min-h-screen pt-24 flex items-center justify-center" style={{ background: '#f7f1e8' }}>
        <div className="text-center">
          <p className="text-3xl font-bold mb-2" style={{ color: '#1a2810', fontFamily: 'Georgia, serif' }}>
            Product not found
          </p>
          <p className="text-sm mb-8" style={{ color: 'rgba(26,40,16,0.45)' }}>
            This product may have been removed or the link is incorrect.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg,#8a6200,#c8960c)', color: '#fff8e8', boxShadow: '0 8px 28px rgba(200,150,12,0.38)' }}
          >
            <ArrowLeft className="w-4 h-4" /> Browse Products
          </Link>
        </div>
      </div>
    );
  }

  const images     = product.images.length > 0 ? product.images : [null];
  const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL;
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
    <div style={{ background: '#f7f1e8', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />

      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <div className="pt-24 pb-3 px-4 sm:px-6 lg:px-8 max-w-screen-xl mx-auto">
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium group"
          style={{ color: 'rgba(26,40,16,0.38)' }}
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
          <span className="group-hover:text-[#8a6200] transition-colors">All Products</span>
          {typeof product.category === 'object' && product.category?.name && (
            <>
              <span className="mx-1" style={{ color: 'rgba(26,40,16,0.22)' }}>/</span>
              <span className="group-hover:text-[#8a6200] transition-colors">{product.category.name}</span>
            </>
          )}
        </Link>
      </div>

      {/* ── Main grid ─────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid lg:grid-cols-[55%_45%] gap-0 lg:gap-12 items-start">

          {/* ════ LEFT: Gallery ════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="lg:sticky lg:top-20 mb-6 lg:mb-0"
          >
            {/* Main image container */}
            <div
              className="relative overflow-hidden rounded-[28px]"
              style={{
                background: 'radial-gradient(ellipse at 50% 35%, #ffffff 0%, #ede4d0 100%)',
                border: '1px solid rgba(200,150,12,0.15)',
                boxShadow: '0 20px 60px -16px rgba(26,40,16,0.16), inset 0 1px 0 rgba(255,255,255,0.85)',
                minHeight: 480,
                height: 'clamp(480px, 68vh, 720px)',
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedImageIndex}
                  initial={{ opacity: 0, scale: 1.03 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="absolute inset-0"
                >
                  {images[selectedImageIndex] ? (
                    <Image
                      src={images[selectedImageIndex]!}
                      alt={product.name}
                      fill
                      className="object-contain"
                      style={{ padding: '7%' }}
                      priority
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span
                        style={{
                          fontSize: 'clamp(7rem, 25vw, 14rem)',
                          color: 'rgba(200,150,12,0.06)',
                          fontFamily: 'Georgia, serif',
                          fontWeight: 900,
                          letterSpacing: '-0.05em',
                          userSelect: 'none',
                        }}
                      >
                        {(product.name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Discount badge */}
              {discount > 0 && (
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.25, type: 'spring', stiffness: 340, damping: 22 }}
                  className="absolute top-5 left-5 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-black text-sm"
                  style={{
                    background: 'linear-gradient(135deg,#1a2810,#243818)',
                    color: '#e8c84a',
                    boxShadow: '0 8px 24px rgba(26,40,16,0.38)',
                    letterSpacing: '0.01em',
                    fontSize: 13,
                  }}
                >
                  {discount}% OFF
                </motion.div>
              )}

              {/* Wishlist button */}
              <motion.button
                onClick={handleWishlist}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.88 }}
                className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(255,252,246,0.92)',
                  backdropFilter: 'blur(12px)',
                  border: `1.5px solid ${isInWishlist ? 'rgba(200,150,12,0.50)' : 'rgba(26,40,16,0.10)'}`,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  color: isInWishlist ? '#c8960c' : 'rgba(26,40,16,0.35)',
                }}
              >
                <Heart style={{ width: 16, height: 16, fill: isInWishlist ? 'currentColor' : 'none' }} />
              </motion.button>

              {/* Nav arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setSelectedImageIndex((i) => (i === 0 ? images.length - 1 : i - 1))}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    style={{ background: 'rgba(255,252,246,0.90)', backdropFilter: 'blur(10px)', border: '1px solid rgba(200,150,12,0.12)', color: '#1a2810', boxShadow: '0 3px 14px rgba(0,0,0,0.09)' }}
                  >
                    <ChevronLeft className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => setSelectedImageIndex((i) => (i === images.length - 1 ? 0 : i + 1))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    style={{ background: 'rgba(255,252,246,0.90)', backdropFilter: 'blur(10px)', border: '1px solid rgba(200,150,12,0.12)', color: '#1a2810', boxShadow: '0 3px 14px rgba(0,0,0,0.09)' }}
                  >
                    <ChevronRight className="w-4.5 h-4.5" />
                  </button>
                </>
              )}

              {/* Dot indicators */}
              {images.length > 1 && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImageIndex(i)}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: i === selectedImageIndex ? 20 : 6,
                        height: 6,
                        background: i === selectedImageIndex ? '#c8960c' : 'rgba(200,150,12,0.30)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-3 mt-4 overflow-x-auto pb-1 px-0.5">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className="relative flex-shrink-0 rounded-2xl overflow-hidden transition-all duration-200"
                    style={{
                      width: 76, height: 76,
                      border: `2px solid ${selectedImageIndex === index ? '#c8960c' : 'rgba(200,150,12,0.12)'}`,
                      background: 'radial-gradient(ellipse at 50% 40%,#fff 0%,#ede4d0 100%)',
                      boxShadow: selectedImageIndex === index ? '0 6px 18px rgba(200,150,12,0.30)' : '0 1px 4px rgba(0,0,0,0.04)',
                      transform: selectedImageIndex === index ? 'scale(1.07)' : 'scale(1)',
                    }}
                  >
                    {image ? (
                      <Image src={image} alt="" fill className="object-contain" style={{ padding: 7 }} sizes="76px" />
                    ) : (
                      <div className="w-full h-full" style={{ background: 'rgba(200,150,12,0.05)' }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* ════ RIGHT: Product info ══════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col pt-2 lg:pt-4"
          >
            {/* Category pill */}
            {typeof product.category === 'object' && product.category?.name && (
              <div className="mb-4">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-[0.20em] uppercase"
                  style={{ background: 'rgba(200,150,12,0.10)', color: '#7a5500', border: '1px solid rgba(200,150,12,0.22)' }}
                >
                  <Leaf className="w-2.5 h-2.5" />
                  {product.category.name}
                </span>
              </div>
            )}

            {/* Product name */}
            <h1
              className="font-bold mb-4"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 'clamp(1.75rem, 2.8vw, 2.8rem)',
                letterSpacing: '-0.025em',
                lineHeight: 1.08,
                color: '#1a2810',
              }}
            >
              {product.name}
            </h1>

            {/* Ratings */}
            <div className="flex items-center gap-2.5 mb-5">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    style={{
                      width: 14, height: 14,
                      color: i < Math.round(avgRating) ? '#c8960c' : 'rgba(26,40,16,0.13)',
                      fill: i < Math.round(avgRating) ? '#c8960c' : 'rgba(26,40,16,0.13)',
                    }}
                  />
                ))}
              </div>
              <span className="text-[13px]" style={{ color: 'rgba(26,40,16,0.40)' }}>
                {reviews?.length
                  ? `${avgRating.toFixed(1)} · ${reviews.length} review${reviews.length !== 1 ? 's' : ''}`
                  : 'No reviews yet'}
              </span>
            </div>

            {/* Divider */}
            <div
              className="mb-6"
              style={{ height: 1, background: 'linear-gradient(90deg,rgba(200,150,12,0.40) 0%,rgba(200,150,12,0.04) 100%)' }}
            />

            {/* ── Price block ── */}
            <div
              className="rounded-2xl p-5 mb-6"
              style={{
                background: 'linear-gradient(135deg,rgba(255,252,246,0.95),rgba(249,243,228,0.80))',
                border: '1px solid rgba(200,150,12,0.18)',
                boxShadow: '0 2px 16px rgba(200,150,12,0.07)',
              }}
            >
              <div className="flex items-end gap-4 flex-wrap mb-2">
                <span
                  className="font-black leading-none"
                  style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: 'clamp(2.6rem, 5vw, 3.6rem)',
                    color: '#1a2810',
                    letterSpacing: '-0.035em',
                  }}
                >
                  {formatPrice(currentPrice)}
                </span>
                {comparePrice && comparePrice > currentPrice && (
                  <div className="flex items-center gap-2 pb-1">
                    <span
                      className="text-lg line-through"
                      style={{ color: 'rgba(26,40,16,0.28)', fontWeight: 400 }}
                    >
                      {formatPrice(comparePrice)}
                    </span>
                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-black tracking-wide"
                      style={{ background: '#1a2810', color: '#e8c84a' }}
                    >
                      {discount}% OFF
                    </span>
                  </div>
                )}
              </div>
              {comparePrice && comparePrice > currentPrice && (
                <p className="text-sm font-semibold mb-1.5" style={{ color: '#1a6b0a' }}>
                  You save {formatPrice(comparePrice - currentPrice)}
                </p>
              )}
              <p className="text-[12px]" style={{ color: 'rgba(26,40,16,0.38)' }}>
                Inclusive of all taxes · Free delivery above ₹999
              </p>
            </div>

            {/* Short description */}
            {product.shortDescription && (
              <p
                className="text-[14.5px] leading-[1.80] mb-6"
                style={{ color: 'rgba(26,40,16,0.58)' }}
              >
                {product.shortDescription}
              </p>
            )}

            {/* Batch + Purity + Stock */}
            {product.batchInfo && (
              <div className="space-y-3 mb-5">
                <BatchStoryCard info={product.batchInfo} />
                {product.batchInfo.purityClaims && product.batchInfo.purityClaims.length > 0 && (
                  <PurityMeter claims={product.batchInfo.purityClaims} />
                )}
              </div>
            )}
            <div className="mb-5">
              <StockContextBanner
                stock={totalStock}
                threshold={product.lowStockThreshold ?? 5}
                nextBatchDays={product.batchInfo?.nextBatchDays}
                batchNumber={product.batchInfo?.batchNumber}
              />
            </div>

            {/* ── Variant selector ── */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-6">
                <p className="text-[11px] font-black uppercase tracking-[0.20em] mb-3" style={{ color: 'rgba(26,40,16,0.36)' }}>
                  Size / Variant
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {product.variants.map((variant) => {
                    const isSelected = selectedVariant === variant.sku;
                    const oos = variant.stock === 0;
                    return (
                      <motion.button
                        key={variant.sku}
                        onClick={() => setSelectedVariant(variant.sku)}
                        disabled={oos}
                        whileHover={{ scale: oos ? 1 : 1.03 }}
                        whileTap={{ scale: 0.96 }}
                        className={cn('relative px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200', oos && 'opacity-30 cursor-not-allowed')}
                        style={{
                          border: `2px solid ${isSelected ? '#c8960c' : 'rgba(26,40,16,0.14)'}`,
                          background: isSelected
                            ? 'linear-gradient(135deg,rgba(200,150,12,0.14),rgba(200,150,12,0.07))'
                            : 'rgba(255,252,246,0.85)',
                          color: isSelected ? '#7a5500' : 'rgba(26,40,16,0.55)',
                          boxShadow: isSelected
                            ? '0 0 0 3px rgba(200,150,12,0.12), 0 3px 10px rgba(200,150,12,0.15)'
                            : '0 1px 3px rgba(0,0,0,0.04)',
                        }}
                      >
                        {variant.name}
                        {variant.price && variant.price !== product.price && (
                          <span className="ml-2 text-[11px] opacity-50">· {formatPrice(variant.price)}</span>
                        )}
                        {isSelected && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: '#c8960c', boxShadow: '0 2px 8px rgba(200,150,12,0.50)' }}
                          >
                            <Check style={{ width: 10, height: 10, color: '#fff' }} />
                          </motion.span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Quantity + CTA ── */}
            <div className="mb-6">
              <p className="text-[11px] font-black uppercase tracking-[0.20em] mb-3" style={{ color: 'rgba(26,40,16,0.36)' }}>
                Quantity
              </p>
              <div className="mb-4">
                <QuantitySelector value={quantity} onChange={setQuantity} min={1} max={currentStock} size="lg" />
              </div>

            <div className="relative">
              <AnimatePresence>
                {ctaPulse && (
                  <motion.div
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    initial={{ opacity: 0.9, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.10 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                    style={{ border: '2.5px solid rgba(200,150,12,0.75)' }}
                  />
                )}
              </AnimatePresence>
              <motion.button
                ref={ctaBtnRef}
                onClick={handleAddToCart}
                disabled={currentStock === 0 || isAddingToCart}
                className="w-full flex items-center justify-center gap-3 rounded-2xl font-bold disabled:opacity-50"
                style={{
                  padding: '18px 28px',
                  fontSize: 15,
                  letterSpacing: '-0.01em',
                  background: showCartSuccess
                    ? 'linear-gradient(135deg,#0d6b0a,#1a9b14)'
                    : currentStock === 0
                    ? 'rgba(26,40,16,0.08)'
                    : 'linear-gradient(135deg,#7a5500 0%,#c8960c 55%,#d4a017 100%)',
                  color: currentStock === 0 ? 'rgba(26,40,16,0.30)' : '#fffaed',
                  boxShadow: currentStock === 0 || showCartSuccess
                    ? 'none'
                    : '0 12px 40px -10px rgba(200,150,12,0.65), 0 3px 12px rgba(200,150,12,0.22)',
                }}
                whileHover={{ scale: currentStock === 0 ? 1 : 1.014, y: currentStock === 0 ? 0 : -2 }}
                whileTap={{ scale: 0.98 }}
              >
                {isAddingToCart ? (
                  <motion.div
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
                  />
                ) : showCartSuccess ? (
                  <><Check style={{ width: 19, height: 19 }} /> Added to Cart!</>
                ) : currentStock === 0 ? (
                  'Currently Out of Stock'
                ) : (
                  <>Add to Cart — {formatPrice(currentPrice * quantity)}</>
                )}
              </motion.button>
            </div>
            </div>

            {/* ── Trust badges ── */}
            <div className="grid grid-cols-2 gap-2 mb-7">
              {([
                { icon: Truck,       label: 'Free Shipping',    sub: 'Orders ₹999+'          },
                { icon: ShieldCheck, label: '100% Pure',        sub: 'Zero additives'         },
                { icon: Leaf,        label: 'Wood Pressed',     sub: 'Kachi Ghani method'     },
                { icon: ShieldCheck, label: 'FSSAI Certified',  sub: 'Quality guaranteed'     },
              ] as const).map(({ icon: Icon, label, sub }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 px-3.5 py-3.5 rounded-xl"
                  style={{
                    background: 'rgba(255,252,246,0.70)',
                    border: '1px solid rgba(26,40,16,0.07)',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,rgba(200,150,12,0.16),rgba(200,150,12,0.07))' }}
                  >
                    <Icon style={{ width: 15, height: 15, color: '#8a6200' }} />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold leading-tight" style={{ color: '#1a2810' }}>{label}</p>
                    <p className="text-[10px] leading-snug mt-0.5" style={{ color: 'rgba(26,40,16,0.40)' }}>{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Full description ── */}
            {product.description && (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(26,40,16,0.08)' }}
              >
                <div
                  className="px-5 py-3.5 flex items-center gap-2"
                  style={{ background: 'rgba(26,40,16,0.03)', borderBottom: '1px solid rgba(26,40,16,0.06)' }}
                >
                  <Leaf style={{ width: 13, height: 13, color: '#8a6200' }} />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: '#1a2810' }}>
                    About this Product
                  </h3>
                </div>
                <div className="px-5 py-5" style={{ background: 'rgba(255,252,246,0.60)' }}>
                  <div
                    className="product-description text-[13.5px] leading-relaxed"
                    style={{ color: 'rgba(26,40,16,0.60)' }}
                    dangerouslySetInnerHTML={{ __html: formatDescription(product.description) }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── Bilona Process ──────────────────────────────────────── */}
      {isBilonaGheeProduct(product) && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <BilonaProcessSection />
        </motion.div>
      )}

      {/* ── Product Videos ─────────────────────────────────────── */}
      {product.videos && product.videos.length > 0 && (
        <ProductVideoSection videos={product.videos} />
      )}

      {/* ── Reviews ────────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Section header */}
        <div className="flex flex-wrap items-start justify-between gap-5 mb-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.30em] mb-2" style={{ color: 'rgba(26,40,16,0.30)' }}>
              Customer Stories
            </p>
            <h2
              className="text-3xl font-bold"
              style={{ fontFamily: 'Georgia, serif', color: '#1a2810', letterSpacing: '-0.022em' }}
            >
              What People Say
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {!!reviews?.length && (
              <div
                className="hidden sm:flex items-center gap-4 px-5 py-4 rounded-2xl"
                style={{ background: 'rgba(255,252,246,0.90)', border: '1px solid rgba(200,150,12,0.18)' }}
              >
                <div className="text-center">
                  <p
                    className="font-black leading-none"
                    style={{ fontFamily: 'Georgia, serif', fontSize: '2.4rem', color: '#1a2810', letterSpacing: '-0.03em' }}
                  >
                    {avgRating.toFixed(1)}
                  </p>
                  <div className="flex items-center gap-0.5 mt-1.5 justify-center">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        style={{ width: 11, height: 11, color: i < Math.round(avgRating) ? '#c8960c' : 'rgba(26,40,16,0.13)', fill: i < Math.round(avgRating) ? '#c8960c' : 'rgba(26,40,16,0.13)' }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(26,40,16,0.38)' }}>
                    {reviews.length} review{reviews.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}

            {isAuthenticated && !showReviewForm && (
              <button
                onClick={() => setShowReviewForm(true)}
                className="px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:bg-[#1a2810] hover:text-[#e8c84a] hover:border-[#1a2810]"
                style={{ border: '1.5px solid rgba(26,40,16,0.20)', color: '#1a2810', background: 'transparent' }}
              >
                + Write a Review
              </button>
            )}
          </div>
        </div>

        {/* Review form */}
        <AnimatePresence>
          {showReviewForm && (
            <motion.div
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="rounded-3xl p-7 mb-10"
              style={{
                background: 'rgba(255,252,246,0.92)',
                border: '1px solid rgba(200,150,12,0.20)',
                boxShadow: '0 6px 28px rgba(0,0,0,0.05)',
              }}
            >
              <h3
                className="text-xl font-bold mb-6"
                style={{ fontFamily: 'Georgia, serif', color: '#1a2810' }}
              >
                Share Your Experience
              </h3>
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-black mb-3 uppercase tracking-[0.16em]" style={{ color: 'rgba(26,40,16,0.40)' }}>
                    Your Rating
                  </p>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} type="button" onClick={() => setReviewRating(star)} className="p-0.5 transition-transform hover:scale-115 active:scale-95">
                        <Star
                          style={{
                            width: 28, height: 28,
                            color: star <= reviewRating ? '#c8960c' : 'rgba(26,40,16,0.15)',
                            fill: star <= reviewRating ? '#c8960c' : 'transparent',
                            transition: 'color 0.15s, fill 0.15s',
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-black mb-2 uppercase tracking-[0.16em]" style={{ color: 'rgba(26,40,16,0.40)' }}>
                    Your Review
                  </p>
                  <textarea
                    className="w-full min-h-[110px] rounded-2xl px-5 py-4 text-sm outline-none resize-none transition-all"
                    style={{
                      background: 'rgba(255,252,246,0.75)',
                      border: '1.5px solid rgba(26,40,16,0.10)',
                      color: '#1a2810',
                      fontFamily: 'inherit',
                    }}
                    placeholder="What did you love about this product?"
                    value={reviewMessage}
                    onChange={(e) => setReviewMessage(e.target.value)}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(200,150,12,0.48)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(26,40,16,0.10)')}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSubmitReview}
                    disabled={submittingReview || !reviewMessage.trim()}
                    className="px-7 py-3 rounded-full text-sm font-bold transition-all disabled:opacity-40 hover:scale-105"
                    style={{ background: 'linear-gradient(135deg,#8a6200,#c8960c)', color: '#fff8e0', boxShadow: '0 5px 18px rgba(200,150,12,0.38)' }}
                  >
                    {submittingReview ? 'Submitting…' : 'Submit Review'}
                  </button>
                  <button
                    onClick={() => setShowReviewForm(false)}
                    className="px-7 py-3 rounded-full text-sm font-medium transition-all"
                    style={{ border: '1.5px solid rgba(26,40,16,0.14)', color: 'rgba(26,40,16,0.48)', background: 'transparent' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reviews grid */}
        {reviews?.length ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {reviews.map((review: ProductReview, idx: number) => (
              <motion.div
                key={review._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl p-6"
                style={{
                  background: 'rgba(255,252,246,0.80)',
                  border: '1px solid rgba(26,40,16,0.07)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-sm font-bold" style={{ color: '#1a2810' }}>
                      {review.user?.name ?? review.userId?.name ?? 'Customer'}
                    </span>
                    <div className="flex items-center gap-0.5 mt-1.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          style={{
                            width: 12, height: 12,
                            color: i < (review.rating || 0) ? '#c8960c' : 'rgba(26,40,16,0.13)',
                            fill: i < (review.rating || 0) ? '#c8960c' : 'rgba(26,40,16,0.13)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-[11px]" style={{ color: 'rgba(26,40,16,0.30)' }}>
                    {new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <p className="text-[13.5px] leading-[1.72]" style={{ color: 'rgba(26,40,16,0.60)' }}>
                  {review.message}
                </p>
                {review.adminResponse && (
                  <div className="mt-4 pl-4 pt-3" style={{ borderLeft: '2.5px solid rgba(200,150,12,0.48)' }}>
                    <p className="text-[10px] font-black mb-1 uppercase tracking-widest" style={{ color: '#8a6200' }}>
                      Store Response
                    </p>
                    <p className="text-[13px]" style={{ color: 'rgba(26,40,16,0.55)' }}>{review.adminResponse}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div
            className="text-center py-16 rounded-3xl"
            style={{ background: 'rgba(255,252,246,0.50)', border: '1px dashed rgba(200,150,12,0.26)' }}
          >
            <Star style={{ width: 30, height: 30, color: 'rgba(200,150,12,0.22)', margin: '0 auto 12px' }} />
            <p className="text-lg font-bold mb-2" style={{ fontFamily: 'Georgia, serif', color: '#1a2810' }}>
              No reviews yet
            </p>
            <p className="text-sm" style={{ color: 'rgba(26,40,16,0.38)' }}>
              Be the first to share your experience
            </p>
          </div>
        )}
      </div>

      {/* ── Related products ────────────────────────────────────── */}
      {relatedProducts && relatedProducts.filter((p) => p._id !== product._id).length > 0 && (
        <div style={{ background: 'linear-gradient(180deg,transparent,rgba(26,40,16,0.025) 50%,transparent)' }}>
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
            <div className="mb-8">
              <p className="text-[10px] font-black uppercase tracking-[0.30em] mb-2" style={{ color: 'rgba(26,40,16,0.30)' }}>
                From Our Range
              </p>
              <h2 className="text-3xl font-bold" style={{ fontFamily: 'Georgia, serif', color: '#1a2810', letterSpacing: '-0.022em' }}>
                You May Also Like
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {relatedProducts
                .filter((p) => p._id !== product._id)
                .slice(0, 4)
                .map((p, index) => (
                  <PremiumProductCard key={p._id} product={p} index={index} compact />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
