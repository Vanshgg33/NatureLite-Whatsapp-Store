'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Check, ChevronLeft, ChevronRight, Star, ExternalLink } from 'lucide-react';
import { useCartStore, CartItem } from '@/lib/cart-store';
import { getProductTotalStock } from '@/lib/utils';
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
  const [showSuccess, setShowSuccess] = useState(false);

  const addItem = useCartStore((state) => state.addItem);
  const { toast } = useToast();

  useEffect(() => {
    if (!product) return;
    setSelectedImageIndex(0);
    setQuantity(1);
    setShowSuccess(false);
    setSelectedVariant(product.variants?.length > 0 ? product.variants[0].sku : null);
  }, [product?._id]);

  if (!product) return null;

  const selectedVariantData = selectedVariant
    ? product.variants.find((v) => v.sku === selectedVariant) ?? null
    : null;

  const currentPrice = selectedVariantData?.price ?? product.price;
  const comparePrice = selectedVariantData?.compareAtPrice ?? product.compareAtPrice;
  const discount = comparePrice && comparePrice > currentPrice
    ? Math.round(((comparePrice - currentPrice) / comparePrice) * 100)
    : 0;

  const totalStock = getProductTotalStock(product);
  const selectedStock = selectedVariantData ? (selectedVariantData.stock ?? 0) : totalStock;
  const isOutOfStock = selectedStock <= 0;

  const handleAddToCart = async () => {
    if (isAddingToCart || isOutOfStock) return;
    setIsAddingToCart(true);

    const cartItem: Omit<CartItem, 'quantity'> = {
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] || '',
      price: currentPrice,
      compareAtPrice: comparePrice,
      variantSku: selectedVariant || undefined,
      variantName: selectedVariantData?.name,
      gstPercentage: product.gstPercentage || 5,
    };

    try {
      await addItem(cartItem, quantity);
      setShowSuccess(true);
      toast({ title: 'Added to cart', description: `${product.name} added.` });
      setTimeout(() => { setShowSuccess(false); onClose(); }, 1200);
    } catch {
      toast({ title: 'Error', description: 'Failed to add item to cart.', variant: 'destructive' });
    } finally {
      setIsAddingToCart(false);
    }
  };

  const images = product.images?.length > 0 ? product.images : [];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(10,20,6,0.72)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-3 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:max-h-[88vh] z-50 overflow-hidden flex flex-col rounded-3xl"
            style={{
              background: '#faf5ec',
              boxShadow: '0 32px 80px -16px rgba(10,20,6,0.48), 0 2px 0 rgba(200,150,12,0.18)',
              border: '1px solid rgba(200,150,12,0.18)',
            }}
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: 'rgba(26,40,16,0.08)', color: '#1a2810' }}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col md:flex-row h-full overflow-auto">

              {/* ── Image panel ─────────────────────────────────── */}
              <div
                className="relative w-full md:w-[44%] flex-shrink-0"
                style={{ background: 'radial-gradient(ellipse at 50% 40%, #fff 0%, #ede4d0 100%)' }}
              >
                <div className="relative aspect-square">
                  {images[selectedImageIndex] ? (
                    <Image
                      src={images[selectedImageIndex]}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="(max-width:768px) 100vw, 44vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span style={{ fontSize: '5rem', color: 'rgba(200,150,12,0.10)', fontWeight: 900 }}>
                        {product.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {discount > 0 && (
                    <span
                      className="absolute top-4 left-4 px-3 py-1 rounded-xl text-xs font-black"
                      style={{ background: '#1a2810', color: '#e8c84a' }}
                    >
                      {discount}% OFF
                    </span>
                  )}

                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setSelectedImageIndex((i) => (i === 0 ? images.length - 1 : i - 1))}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                        style={{ background: 'rgba(255,252,246,0.90)', color: '#1a2810', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSelectedImageIndex((i) => (i === images.length - 1 ? 0 : i + 1))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                        style={{ background: 'rgba(255,252,246,0.90)', color: '#1a2810', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex gap-2 p-3 overflow-x-auto">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedImageIndex(i)}
                        className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 transition-all"
                        style={{
                          border: `2px solid ${i === selectedImageIndex ? '#c8960c' : 'rgba(200,150,12,0.12)'}`,
                          background: 'rgba(255,252,246,0.80)',
                          boxShadow: i === selectedImageIndex ? '0 3px 10px rgba(200,150,12,0.28)' : 'none',
                          transform: i === selectedImageIndex ? 'scale(1.08)' : 'scale(1)',
                        }}
                      >
                        <Image src={img} alt="" fill className="object-cover" sizes="56px" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Content panel ───────────────────────────────── */}
              <div className="flex-1 overflow-y-auto p-5 md:p-7 flex flex-col gap-4">

                {/* Category + name */}
                <div>
                  {typeof product.category === 'object' && product.category?.name && (
                    <span
                      className="inline-block text-[10px] font-black uppercase tracking-[0.20em] px-2.5 py-1 rounded-full mb-2"
                      style={{ background: 'rgba(200,150,12,0.10)', color: '#7a5500', border: '1px solid rgba(200,150,12,0.22)' }}
                    >
                      {product.category.name}
                    </span>
                  )}
                  <h2
                    className="font-bold leading-tight"
                    style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.3rem, 3vw, 1.75rem)', color: '#1a2810', letterSpacing: '-0.02em' }}
                  >
                    {product.name}
                  </h2>
                </div>

                {/* Stars */}
                <div className="flex items-center gap-1.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} style={{ width: 13, height: 13, fill: i < 4 ? '#c8960c' : 'transparent', color: i < 4 ? '#c8960c' : 'rgba(26,40,16,0.18)' }} />
                  ))}
                  <span className="text-[12px]" style={{ color: 'rgba(26,40,16,0.38)' }}>({product.totalSold} sold)</span>
                </div>

                {/* Price */}
                <div
                  className="rounded-2xl px-4 py-3 flex items-end gap-3 flex-wrap"
                  style={{ background: 'rgba(255,252,246,0.85)', border: '1px solid rgba(200,150,12,0.14)' }}
                >
                  <span
                    className="font-black leading-none"
                    style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 4vw, 2.4rem)', color: '#1a2810', letterSpacing: '-0.03em' }}
                  >
                    ₹{currentPrice.toLocaleString()}
                  </span>
                  {comparePrice && comparePrice > currentPrice && (
                    <>
                      <span className="text-base line-through pb-0.5" style={{ color: 'rgba(26,40,16,0.30)' }}>
                        ₹{comparePrice.toLocaleString()}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-xs font-black pb-0.5" style={{ background: '#1a2810', color: '#e8c84a' }}>
                        {discount}% OFF
                      </span>
                    </>
                  )}
                </div>

                {/* Short description */}
                {product.shortDescription && (
                  <p className="text-[13.5px] leading-relaxed" style={{ color: 'rgba(26,40,16,0.55)' }}>
                    {product.shortDescription}
                  </p>
                )}

                {/* ── Variant selector ── */}
                {product.variants && product.variants.length > 0 && (
                  <div
                    className="rounded-2xl p-4"
                    style={{ background: 'rgba(255,252,246,0.70)', border: '1px solid rgba(200,150,12,0.14)' }}
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.20em] mb-3" style={{ color: 'rgba(26,40,16,0.40)' }}>
                      Select Option
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {product.variants.map((variant) => {
                        const isSelected = selectedVariant === variant.sku;
                        const isOOS = (variant.stock ?? 0) === 0;
                        return (
                          <motion.button
                            key={variant.sku}
                            onClick={() => !isOOS && setSelectedVariant(variant.sku)}
                            disabled={isOOS}
                            whileTap={{ scale: isOOS ? 1 : 0.95 }}
                            className="relative px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                            style={{
                              border: `2px solid ${isSelected ? '#c8960c' : isOOS ? 'rgba(26,40,16,0.08)' : 'rgba(26,40,16,0.16)'}`,
                              background: isSelected
                                ? 'linear-gradient(135deg,rgba(200,150,12,0.16),rgba(200,150,12,0.08))'
                                : isOOS ? 'rgba(26,40,16,0.03)' : 'rgba(255,252,246,0.90)',
                              color: isSelected ? '#7a5500' : isOOS ? 'rgba(26,40,16,0.22)' : 'rgba(26,40,16,0.65)',
                              boxShadow: isSelected ? '0 0 0 3px rgba(200,150,12,0.14)' : 'none',
                              cursor: isOOS ? 'not-allowed' : 'pointer',
                              textDecoration: isOOS ? 'line-through' : 'none',
                            }}
                          >
                            {variant.name}
                            {variant.price && variant.price !== product.price && (
                              <span className="ml-1.5 text-[11px] opacity-55">· ₹{variant.price.toLocaleString()}</span>
                            )}
                            {isSelected && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                                style={{ background: '#c8960c' }}
                              >
                                <Check style={{ width: 8, height: 8, color: '#fff' }} />
                              </motion.span>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Quantity ── */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.20em] mb-2" style={{ color: 'rgba(26,40,16,0.40)' }}>
                    Quantity
                  </p>
                  <div
                    className="inline-flex items-center rounded-xl overflow-hidden"
                    style={{ border: '1.5px solid rgba(26,40,16,0.14)' }}
                  >
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-11 h-11 flex items-center justify-center text-lg font-bold transition-colors hover:bg-amber-50"
                      style={{ color: '#1a2810' }}
                    >
                      −
                    </button>
                    <span
                      className="w-12 text-center font-bold text-sm"
                      style={{ color: '#1a2810', borderLeft: '1px solid rgba(26,40,16,0.10)', borderRight: '1px solid rgba(26,40,16,0.10)' }}
                    >
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(selectedStock > 0 ? selectedStock : 10, q + 1))}
                      className="w-11 h-11 flex items-center justify-center text-lg font-bold transition-colors hover:bg-amber-50"
                      style={{ color: '#1a2810' }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* ── Add to Cart ── */}
                <motion.button
                  onClick={handleAddToCart}
                  disabled={isAddingToCart || isOutOfStock}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-bold disabled:opacity-50"
                  style={{
                    padding: '15px 24px',
                    fontSize: 14,
                    background: showSuccess
                      ? 'linear-gradient(135deg,#0d6b0a,#1a9b14)'
                      : isOutOfStock
                      ? 'rgba(26,40,16,0.08)'
                      : 'linear-gradient(135deg,#7a5500 0%,#c8960c 55%,#d4a017 100%)',
                    color: isOutOfStock ? 'rgba(26,40,16,0.30)' : '#fffaed',
                    boxShadow: isOutOfStock || showSuccess
                      ? 'none'
                      : '0 10px 32px -8px rgba(200,150,12,0.60)',
                  }}
                  whileHover={{ scale: isOutOfStock ? 1 : 1.015, y: isOutOfStock ? 0 : -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isAddingToCart ? (
                    <motion.div
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
                    />
                  ) : showSuccess ? (
                    <><Check className="w-5 h-5" /> Added to Cart!</>
                  ) : isOutOfStock ? (
                    'Out of Stock'
                  ) : (
                    <><ShoppingBag className="w-5 h-5" /> Add to Cart — ₹{(currentPrice * quantity).toLocaleString()}</>
                  )}
                </motion.button>

                {/* View full details */}
                <Link
                  href={`/products/${product.slug}`}
                  onClick={onClose}
                  className="flex items-center justify-center gap-1.5 text-[12px] font-semibold transition-colors hover:opacity-70"
                  style={{ color: 'rgba(26,40,16,0.40)' }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Full Details
                </Link>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
