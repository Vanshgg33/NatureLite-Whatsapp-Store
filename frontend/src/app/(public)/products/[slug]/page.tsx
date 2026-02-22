'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Star,
  Truck,
  ShieldCheck,
  Leaf,
  Share2,
  Heart,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuantitySelector } from '@/components/ecommerce/quantity-selector';
import { ProductCard } from '@/components/ecommerce/product-card';
import { TrustBadgesCompact } from '@/components/story/trust-badges';
import { useCartStore, CartItem } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const addItem = useCartStore((state) => state.addItem);
  const { toast } = useToast();

  // Fetch product
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api.getProductBySlug(slug),
  });

  // Fetch related products
  const { data: relatedProducts } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => api.getFeaturedProducts(4),
    enabled: !!product,
  });

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
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      gstPercentage: product.gstPercentage,
      variantSku: selectedVariant || undefined,
    };

    addItem(cartItem, quantity);
    toast({
      title: 'Added to cart',
      description: `${quantity} x ${product.name} added to your cart.`,
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

  const discount = product.compareAtPrice
    ? Math.round(
        ((product.compareAtPrice - product.price) / product.compareAtPrice) * 100
      )
    : 0;

  const images = product.images.length > 0 ? product.images : [null];

  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <div className="brand-container py-12">
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
            {/* Main Image */}
            <div className="relative aspect-square bg-white rounded-2xl overflow-hidden shadow-brand-sm mb-4">
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
                        {product.name[0]}
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
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'w-5 h-5',
                      i < 4
                        ? 'fill-brand-mustard text-brand-mustard'
                        : 'fill-brand-sand text-brand-sand'
                    )}
                  />
                ))}
              </div>
              <span className="font-body text-sm text-brand-muted">
                4.8 (128 reviews)
              </span>
            </div>

            {/* Price */}
            <div className="flex items-center gap-3 mb-6">
              <span className="font-display text-3xl font-bold text-brand-charcoal">
                {formatPrice(product.price)}
              </span>
              {product.compareAtPrice && (
                <>
                  <span className="font-body text-lg text-brand-muted line-through">
                    {formatPrice(product.compareAtPrice)}
                  </span>
                  <span className="px-2 py-1 bg-brand-green/10 text-brand-green text-sm font-body font-medium rounded">
                    Save {formatPrice(product.compareAtPrice - product.price)}
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
                max={product.stock}
                size="lg"
              />
              <Button
                size="lg"
                className="flex-1 bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-xl py-6"
                onClick={handleAddToCart}
                disabled={product.stock === 0}
              >
                {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-xl py-6"
                aria-label="Add to wishlist"
              >
                <Heart className="w-5 h-5" />
              </Button>
            </div>

            {/* Stock Status */}
            {product.stock > 0 && product.stock <= product.lowStockThreshold && (
              <p className="font-body text-sm text-brand-terracotta mb-6">
                Only {product.stock} left in stock!
              </p>
            )}

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
