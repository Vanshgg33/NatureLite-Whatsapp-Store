'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Star, Truck, ShieldCheck, Leaf, Share2, Heart, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Box, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuantitySelector } from '@/components/ecommerce/quantity-selector';
import { ProductCard } from '@/components/ecommerce/product-card';
import { TrustBadgesCompact } from '@/components/story/trust-badges';
import { useCartStore, CartItem } from '@/lib/cart-store';
import { useCustomerStore } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { cn, getProductTotalStock } from '@/lib/utils';
import { useWishlistStore } from '@/lib/wishlist-store';
import dynamic from 'next/dynamic';

const Product3DViewer = dynamic(
  () => import('@/components/three/scenes/Product3DViewer').then((mod) => mod.Product3DViewer),
  { ssr: false },
);

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [show3D, setShow3D] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const isAuthenticated = useCustomerStore((state) => state.isAuthenticated);
  const [variantAutoSelected, setVariantAutoSelected] = useState(false);
  const { toast } = useToast();

  // Fetch product
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api.getProductBySlug(slug),
  });

  const wishlistToggle = useWishlistStore((state) => state.toggle);
  const isInWishlist = useWishlistStore((state) =>
    product ? state.isInWishlist(product._id) : false,
  );

  const isCustomerAuthenticated = useCustomerStore((state) => state.isAuthenticated);

  // Fetch related products (parallel — doesn't depend on product data)
  const { data: relatedProducts } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => api.getFeaturedProducts(4),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch product reviews (needs product ID — waits for product)
  const { data: reviews, refetch: refetchReviews } = useQuery({
    queryKey: ['product-reviews', product?._id],
    queryFn: () => api.getProductReviews(product!._id),
    enabled: !!product?._id,
  });

  // Auto-select first variant when product loads
  useEffect(() => {
    if (product && product.variants?.length > 0 && !variantAutoSelected) {
      setSelectedVariant(product.variants[0].sku);
      setVariantAutoSelected(true);
    }
  }, [product, variantAutoSelected]);

  // Compute current price/stock based on selected variant (same pattern as QuickViewModal)
  const selectedVariantData =
    product && selectedVariant ? product.variants.find((v) => v.sku === selectedVariant) : null;
  const currentPrice = selectedVariantData?.price || product?.price || 0;
  const comparePrice = selectedVariantData?.compareAtPrice || product?.compareAtPrice;
  const currentStock = selectedVariantData ? selectedVariantData.stock ?? 0 : product?.stock || 0;

  // Ensure quantity never exceeds available stock
  useEffect(() => {
    if (currentStock > 0 && quantity > currentStock) {
      setQuantity(currentStock);
    }
    if (currentStock === 0 && quantity !== 1) {
      setQuantity(1);
    }
  }, [currentStock, quantity]);

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewMessage, setReviewMessage] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const handleSubmitReview = async () => {
    if (!reviewMessage.trim()) return;
    setSubmittingReview(true);
    try {
      await api.createFeedback({
        type: 'product_review',
        productId: product!._id,
        rating: reviewRating,
        message: reviewMessage,
      });
      toast({ title: 'Review submitted!', description: 'Thank you for your feedback.' });
      setReviewMessage('');
      setReviewRating(5);
      setShowReviewForm(false);
      refetchReviews();
    } catch {
      toast({ title: 'Failed to submit review', variant: 'destructive' });
    } finally {
      setSubmittingReview(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleAddToCart = () => {
    if (!product) return;

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

    addItem(cartItem, quantity);
    toast({
      title: 'Added to cart',
      description: `${quantity} x ${product.name}${selectedVariantData ? ` (${selectedVariantData.name})` : ''} added to your cart.`,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 bg-brand-cream">
        <div className="brand-container py-12">
          <div className="animate-pulse">
            <div className="h-6 bg-brand-sand rounded w-32 mb-8" />
            <div className="grid lg:grid-cols-2 gap-12">
              <div className="aspect-square bg-brand-sand rounded-2xl" />
              <div className="space-y-4">
                <div className="h-8 bg-brand-sand rounded w-3/4" />
                <div className="h-6 bg-brand-sand rounded w-1/4" />
                <div className="h-24 bg-brand-sand rounded" />
                <div className="h-12 bg-brand-sand rounded w-1/2" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen pt-20 bg-brand-cream">
        <div className="brand-container py-24 text-center">
          <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-4">
            Product not found
          </h1>
          <Link href="/products">
            <Button className="bg-brand-mustard hover:bg-brand-mustard-dark text-white">
              Browse Products
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const discount = comparePrice
    ? Math.round(
        ((comparePrice - currentPrice) / comparePrice) * 100
      )
    : 0;

  const images = product.images.length > 0 ? product.images : [null];

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const productUrl = siteUrl ? `${siteUrl}/products/${product.slug}` : `/products/${product.slug}`;
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: images.filter(Boolean),
    description:
      product.shortDescription ||
      (typeof product.description === 'string'
        ? product.description.replace(/<[^>]+>/g, '').slice(0, 200)
        : undefined),
    sku: product.sku,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: currentPrice,
      availability:
        currentStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: productUrl,
    },
  };

  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <div className="brand-container py-12">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
        {/* Breadcrumb */}
        <Link
          href="/products"
          className="inline-flex items-center gap-2 font-body text-sm text-brand-muted hover:text-brand-charcoal mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Products
        </Link>

        {/* Product Content */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Image Gallery */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Main Image / 3D Viewer */}
            <div className="relative aspect-square bg-white rounded-2xl overflow-hidden shadow-brand-sm mb-4">
              {show3D ? (
                /* 3D Model Viewer */
                <Product3DViewer className="w-full h-full" />
              ) : (
                /* Image Gallery */
                <>
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
                        <div className="w-full h-full flex items-center justify-center bg-brand-sand">
                          <span className="font-display text-8xl text-brand-brown/20">
                            {(product.name || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {/* Navigation arrows */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() =>
                          setSelectedImageIndex((i) =>
                            i === 0 ? images.length - 1 : i - 1
                          )
                        }
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 shadow-sm flex items-center justify-center hover:bg-white transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5 text-brand-charcoal" />
                      </button>
                      <button
                        onClick={() =>
                          setSelectedImageIndex((i) =>
                            i === images.length - 1 ? 0 : i + 1
                          )
                        }
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 shadow-sm flex items-center justify-center hover:bg-white transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 text-brand-charcoal" />
                      </button>
                    </>
                  )}
                </>
              )}

              {/* View in 3D / Back to Photos toggle */}
              <button
                onClick={() => setShow3D(!show3D)}
                className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-sm rounded-full shadow-brand-sm text-sm font-medium text-brand-charcoal hover:bg-white transition-colors"
              >
                {show3D ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Photos
                  </>
                ) : (
                  <>
                    <Box className="w-4 h-4" />
                    View in 3D
                  </>
                )}
              </button>

              {/* Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
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
              </div>
            </div>

            {/* Thumbnail Gallery */}
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={cn(
                      'relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-colors',
                      selectedImageIndex === index
                        ? 'border-brand-mustard'
                        : 'border-transparent'
                    )}
                  >
                    {image ? (
                      <Image
                        src={image}
                        alt={`${product.name} ${index + 1}`}
                        fill
                        className="object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-brand-sand" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Product Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Category */}
            {typeof product.category === 'object' && product.category && (
              <span className="text-sm font-body text-brand-muted uppercase tracking-wide">
                {product.category.name}
              </span>
            )}

            {/* Title */}
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-charcoal mt-2 mb-3">
              {product.name}
            </h1>

            {/* Rating */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => {
                  const avgRating = reviews && reviews.length > 0
                    ? reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length
                    : 0;
                  return (
                    <Star
                      key={i}
                      className={cn(
                        'w-5 h-5',
                        i < Math.round(avgRating)
                          ? 'fill-brand-mustard text-brand-mustard'
                          : 'fill-brand-sand text-brand-sand'
                      )}
                    />
                  );
                })}
              </div>
              <span className="font-body text-sm text-brand-muted">
                {reviews && reviews.length > 0
                  ? `${(reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)} (${reviews.length} review${reviews.length !== 1 ? 's' : ''})`
                  : 'No reviews yet'}
              </span>
            </div>

            {/* Price */}
            <div className="flex items-center gap-3 mb-6">
              <span className="font-display text-3xl font-bold text-brand-charcoal">
                {formatPrice(currentPrice)}
              </span>
              {comparePrice && comparePrice > currentPrice && (
                <>
                  <span className="font-body text-lg text-brand-muted line-through">
                    {formatPrice(comparePrice)}
                  </span>
                  <span className="px-2 py-1 bg-brand-green/10 text-brand-green text-sm font-body font-medium rounded">
                    Save {formatPrice(comparePrice - currentPrice)}
                  </span>
                </>
              )}
            </div>

            {/* Short Description */}
            {product.shortDescription && (
              <p className="font-body text-lg text-brand-text leading-relaxed mb-6">
                {product.shortDescription}
              </p>
            )}

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-6">
                <label className="font-body text-sm font-medium text-brand-charcoal mb-3 block">
                  Size
                </label>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.sku}
                      onClick={() => setSelectedVariant(variant.sku)}
                      disabled={variant.stock === 0}
                      className={cn(
                        'px-4 py-2 rounded-xl border font-body text-sm transition-colors',
                        selectedVariant === variant.sku
                          ? 'border-brand-mustard bg-brand-mustard/10 text-brand-mustard'
                          : 'border-brand-border text-brand-text hover:border-brand-charcoal',
                        variant.stock === 0 && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {variant.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity & Add to Cart */}
            <div className="flex items-center gap-4 mb-8">
              <QuantitySelector
                value={quantity}
                onChange={setQuantity}
                min={1}
                max={currentStock}
                size="lg"
              />
              <Button
                size="lg"
                className="flex-1 bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-xl py-6"
                onClick={handleAddToCart}
                disabled={currentStock === 0}
              >
                {currentStock === 0 ? 'Out of Stock' : 'Add to Cart'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-xl py-6"
                aria-label="Add to wishlist"
                onClick={() => {
                  (async () => {
                    try {
                      const nextInWishlist = !isInWishlist;

                      wishlistToggle({
                        productId: product._id,
                        slug: product.slug,
                        name: product.name,
                        image: product.images[0],
                        price: currentPrice,
                      });

                      if (isCustomerAuthenticated) {
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
                    'w-5 h-5',
                    isInWishlist ? 'text-brand-mustard fill-brand-mustard' : 'text-brand-charcoal',
                  )}
                />
              </Button>
            </div>

            {/* Stock Status */}
            {(() => {
              const totalStock = getProductTotalStock(product);
              return totalStock > 0 && totalStock <= (product.lowStockThreshold ?? 5) ? (
                <p className="font-body text-sm text-brand-terracotta mb-6">
                  Only {totalStock} left in stock!
                </p>
              ) : null;
            })()}

            {/* Trust Badges */}
            <TrustBadgesCompact />

            {/* Features */}
            <div className="mt-8 space-y-3">
              {[
                { icon: Truck, text: 'Free shipping on orders above ₹999' },
                { icon: ShieldCheck, text: '100% pure, no additives' },
                { icon: Leaf, text: 'Traditional wood-pressed extraction' },
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-sand flex items-center justify-center">
                    <feature.icon className="w-5 h-5 text-brand-brown" />
                  </div>
                  <span className="font-body text-sm text-brand-text">
                    {feature.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Description */}
            {product.description && (
              <div className="mt-10 pt-10 border-t border-brand-border">
                <h3 className="font-display text-xl font-semibold text-brand-charcoal mb-4">
                  About this product
                </h3>
                <div
                  className="font-body text-brand-text leading-relaxed prose prose-brand"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}
          </motion.div>
        </div>

        {/* Customer Reviews */}
        <div className="mt-20">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-display text-2xl font-bold text-brand-charcoal">
              Customer Reviews
              {reviews && reviews.length > 0 && (
                <span className="text-lg font-normal text-brand-muted ml-2">
                  ({reviews.length})
                </span>
              )}
            </h2>
            {isAuthenticated && !showReviewForm && (
              <Button
                variant="outline"
                onClick={() => setShowReviewForm(true)}
                className="rounded-xl"
              >
                Write a Review
              </Button>
            )}
          </div>

          {/* Review Form */}
          {showReviewForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-brand-sm mb-8"
            >
              <h3 className="font-display text-lg font-semibold text-brand-charcoal mb-4">
                Your Review
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="font-body text-sm text-brand-text mb-2 block">Rating</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className="p-0.5"
                      >
                        <Star
                          className={cn(
                            'w-6 h-6 transition-colors',
                            star <= reviewRating
                              ? 'fill-brand-mustard text-brand-mustard'
                              : 'text-brand-sand'
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="font-body text-sm text-brand-text mb-2 block">Your Review</label>
                  <textarea
                    className="w-full min-h-[100px] rounded-xl border border-brand-border bg-white px-4 py-3 font-body text-sm"
                    placeholder="Share your experience with this product..."
                    value={reviewMessage}
                    onChange={(e) => setReviewMessage(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleSubmitReview}
                    disabled={submittingReview || !reviewMessage.trim()}
                    className="bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-xl"
                  >
                    {submittingReview ? 'Submitting...' : 'Submit Review'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowReviewForm(false)}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Reviews List */}
          {reviews && reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.map((review: any) => (
                <div
                  key={review._id}
                  className="bg-white rounded-2xl p-6 shadow-brand-sm"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            'w-4 h-4',
                            i < (review.rating || 0)
                              ? 'fill-brand-mustard text-brand-mustard'
                              : 'text-brand-sand'
                          )}
                        />
                      ))}
                    </div>
                    <span className="font-body text-sm font-medium text-brand-charcoal">
                      {review.userId?.name || 'Customer'}
                    </span>
                    <span className="font-body text-xs text-brand-muted">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="font-body text-sm text-brand-text">{review.message}</p>
                  {review.adminResponse && (
                    <div className="mt-3 pl-4 border-l-2 border-brand-mustard">
                      <p className="font-body text-xs font-medium text-brand-mustard mb-1">
                        Store Response
                      </p>
                      <p className="font-body text-sm text-brand-text">
                        {review.adminResponse}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-2xl shadow-brand-sm">
              <p className="font-body text-brand-muted">
                No reviews yet. Be the first to review this product!
              </p>
            </div>
          )}
        </div>

        {/* Related Products */}
        {relatedProducts && relatedProducts.length > 0 && (
          <div className="mt-20">
            <h2 className="font-display text-2xl font-bold text-brand-charcoal mb-8">
              You May Also Like
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts
                .filter((p) => p._id !== product._id)
                .slice(0, 4)
                .map((p, index) => (
                  <ProductCard key={p._id} product={p} index={index} />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
