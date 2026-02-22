'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Heart, Star, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCartStore, CartItem } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { Product } from '@/types';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export function QuickViewModal({ product, isOpen, onClose }: QuickViewModalProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const { addItem } = useCartStore();
  const { toast } = useToast();

  if (!product) return null;

  const currentPrice = selectedVariant
    ? product.variants.find((v) => v.sku === selectedVariant)?.price || product.price
    : product.price;

  const comparePrice = selectedVariant
    ? product.variants.find((v) => v.sku === selectedVariant)?.compareAtPrice
    : product.compareAtPrice;

  const discount = comparePrice
    ? Math.round(((comparePrice - currentPrice) / comparePrice) * 100)
    : 0;

  const handleAddToCart = async () => {
    setIsAddingToCart(true);

    const variant = selectedVariant
      ? product.variants.find((v) => v.sku === selectedVariant)
      : null;

    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images[0] || '',
      price: currentPrice,
      compareAtPrice: comparePrice,
      variantSku: selectedVariant || undefined,
      variantName: variant?.name,
      gstPercentage: product.gstPercentage || 5,
    };

    try {
      await addItem(cartItem, quantity);
      toast({
        title: 'Added to cart',
        description: `${product.name} has been added to your cart.`,
      });
      onClose();
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

  const nextImage = () => {
    setSelectedImageIndex((prev) => (prev + 1) % product.images.length);
  };

  const prevImage = () => {
    setSelectedImageIndex(
      (prev) => (prev - 1 + product.images.length) % product.images.length
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-4xl md:max-h-[90vh] bg-white rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-colors shadow-md"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col md:flex-row h-full overflow-auto">
              {/* Image Section */}
              <div className="relative w-full md:w-1/2 bg-brand-cream">
                {/* Main Image */}
                <div className="relative aspect-square">
                  <Image
                    src={product.images[selectedImageIndex] || '/images/placeholder-product.jpg'}
                    alt={product.name}
                    fill
                    className="object-cover"
                  />

                  {/* Badges */}
                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    {discount > 0 && (
                      <span className="px-3 py-1 bg-brand-terracotta text-white text-sm font-medium rounded-full">
                        -{discount}%
                      </span>
                    )}
                  </div>

                  {/* Navigation Arrows */}
                  {product.images.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-colors shadow-md"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-colors shadow-md"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Thumbnail Gallery */}
                {product.images.length > 1 && (
                  <div className="flex gap-2 p-4 overflow-x-auto">
                    {product.images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className={`relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-colors ${
                          index === selectedImageIndex
                            ? 'border-brand-charcoal'
                            : 'border-transparent hover:border-brand-border'
                        }`}
                      >
                        <Image
                          src={image}
                          alt={`${product.name} ${index + 1}`}
                          fill
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Content Section */}
              <div className="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto">
                {/* Category */}
                {typeof product.category === 'object' && product.category?.name && (
                  <span className="text-sm text-brand-muted uppercase tracking-wider">
                    {product.category.name}
                  </span>
                )}

                {/* Title */}
                <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-charcoal mt-2 mb-3">
                  {product.name}
                </h2>

                {/* Rating */}
                <div className="flex items-center gap-2 mb-4">
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
                  <span className="text-sm text-brand-muted">
                    ({product.totalSold} sold)
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-center gap-3 mb-6">
                  <span className="font-display text-3xl font-bold text-brand-charcoal">
                    ₹{currentPrice.toLocaleString()}
                  </span>
                  {comparePrice && comparePrice > currentPrice && (
                    <span className="text-lg text-brand-muted line-through">
                      ₹{comparePrice.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Description */}
                {product.shortDescription && (
                  <p className="text-brand-muted mb-6 leading-relaxed">
                    {product.shortDescription}
                  </p>
                )}

                {/* Variants */}
                {product.variants && product.variants.length > 0 && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-brand-charcoal mb-3">
                      Select Variant
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {product.variants.map((variant) => (
                        <button
                          key={variant.sku}
                          onClick={() => setSelectedVariant(variant.sku)}
                          disabled={variant.stock === 0}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                            selectedVariant === variant.sku
                              ? 'bg-brand-charcoal text-white'
                              : variant.stock === 0
                              ? 'bg-brand-cream text-brand-muted cursor-not-allowed'
                              : 'bg-brand-cream text-brand-charcoal hover:bg-brand-sand'
                          }`}
                        >
                          {variant.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantity */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-brand-charcoal mb-3">
                    Quantity
                  </label>
                  <div className="inline-flex items-center border border-brand-border rounded-xl">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-12 h-12 flex items-center justify-center text-brand-charcoal hover:bg-brand-cream transition-colors rounded-l-xl"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-16 text-center font-medium text-brand-charcoal">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                      className="w-12 h-12 flex items-center justify-center text-brand-charcoal hover:bg-brand-cream transition-colors rounded-r-xl"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <motion.button
                    onClick={handleAddToCart}
                    disabled={isAddingToCart || product.stock === 0}
                    className="flex-1 py-4 bg-brand-charcoal text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-brand-green transition-colors disabled:opacity-50"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isAddingToCart ? (
                      <motion.div
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        Add to Cart
                      </>
                    )}
                  </motion.button>

                  <motion.button
                    className="w-14 h-14 rounded-xl border border-brand-border flex items-center justify-center text-brand-charcoal hover:bg-brand-cream hover:border-brand-terracotta hover:text-brand-terracotta transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Heart className="w-5 h-5" />
                  </motion.button>
                </div>

                {/* View Full Details */}
                <Link
                  href={`/products/${product.slug}`}
                  onClick={onClose}
                  className="block text-center text-sm text-brand-muted hover:text-brand-charcoal mt-6 underline underline-offset-4"
                >
                  View Full Product Details
                </Link>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
