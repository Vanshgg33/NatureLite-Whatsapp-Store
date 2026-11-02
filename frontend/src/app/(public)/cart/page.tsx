'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ArrowLeft, ArrowRight, Sparkles, ShoppingCart } from 'lucide-react';
import { CartItem } from '@/components/ecommerce/cart-item';
import { CartSummary } from '@/components/ecommerce/cart-summary';
import { PremiumProductCardCompact } from '@/components/ecommerce/premium-product-card';
import { useCartStore, useSyncCartOnAuth } from '@/lib/cart-store';
import { api } from '@/lib/api';
import { Product, Category } from '@/types';

export default function CartPage() {
  const items    = useCartStore((s) => s.items);
  const syncCart = useSyncCartOnAuth();
  const [mounted, setMounted]             = useState(false);
  const [crossSellProducts, setCrossSellProducts] = useState<Product[]>([]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { syncCart(); }, [syncCart]);

  const itemCount = items.length;

  useEffect(() => {
    if (!mounted || itemCount === 0) return;
    const fetchCrossSell = async () => {
      try {
        const cartProductIds = items.map((i) => i.productId);
        const firstItem      = items[0];
        let categoryId: string | undefined;
        try {
          const product = await api.getProduct(firstItem.productId);
          if (typeof product.category === 'string') categoryId = product.category;
          else if (product.category && typeof product.category === 'object')
            categoryId = (product.category as Category)._id;
        } catch { /* ignore */ }
        const res = await api.getProducts({ limit: 12, sortBy: 'totalSold', sortOrder: 'desc', isActive: true, category: categoryId });
        setCrossSellProducts(res.items.filter((p: Product) => !cartProductIds.includes(p._id)).slice(0, 4));
      } catch { /* ignore */ }
    };
    fetchCrossSell();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, itemCount]);

  /* ─── Loading skeleton ─────────────────────────────────────────────────── */
  if (!mounted) {
    return (
      <div className="min-h-screen pt-24" style={{ background: '#f2ece0' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-6 w-40 rounded-full bg-amber-100" />
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-amber-100/60" />)}
              </div>
              <div className="h-80 rounded-2xl bg-amber-100/60" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Empty state ──────────────────────────────────────────────────────── */
  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center" style={{ background: '#f2ece0' }}>
        <motion.div
          className="text-center max-w-sm px-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(160,112,16,0.08)', border: '1px solid rgba(160,112,16,0.16)' }}
          >
            <ShoppingBag className="w-10 h-10" style={{ color: 'rgba(160,112,16,0.50)' }} />
          </div>
          <h1 className="font-display text-2xl font-bold mb-3" style={{ color: '#0b1c08' }}>
            Your cart is empty
          </h1>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: 'rgba(46,66,37,0.50)' }}>
            Looks like you haven&apos;t added anything yet. Explore our collection of pure, traditional products.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: '#a07010', color: '#fff', boxShadow: '0 4px 20px -4px rgba(160,112,16,0.40)' }}
          >
            Start Shopping <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    );
  }

  /* ─── Cart page ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen pt-24 pb-[72px] lg:pb-0" style={{ background: '#f2ece0' }}>

      {/* ── Hero bar ─────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden pb-8 pt-4"
        style={{ borderBottom: '1px solid rgba(160,112,16,0.10)' }}
      >
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute top-0 right-1/4 w-80 h-80 rounded-full opacity-60"
          style={{ background: 'radial-gradient(circle, rgba(160,112,16,0.10) 0%, transparent 70%)', filter: 'blur(50px)' }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm font-medium mb-5 transition-colors duration-200"
            style={{ color: 'rgba(46,66,37,0.40)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#a07010')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(46,66,37,0.40)')}
          >
            <ArrowLeft className="w-4 h-4" /> Continue Shopping
          </Link>

          <div className="flex items-end gap-4">
            <div>
              <p
                className="font-body uppercase tracking-[0.22em] mb-1.5"
                style={{ fontSize: 10, color: 'rgba(160,112,16,0.60)', fontFamily: 'monospace' }}
              >
                Review &amp; Checkout
              </p>
              <h1
                className="font-display font-bold"
                style={{ fontSize: 'clamp(28px,5vw,40px)', color: '#0b1c08', letterSpacing: '-0.02em', lineHeight: 1.1 }}
              >
                Shopping Cart
              </h1>
              {/* Gold underline accent */}
              <div
                className="mt-2 rounded-full"
                style={{ height: 2, width: 48, background: 'linear-gradient(90deg, #a07010, rgba(160,112,16,0.30))' }}
              />
            </div>

            {/* Item count badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 400 }}
              className="mb-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(160,112,16,0.10)', border: '1px solid rgba(160,112,16,0.18)' }}
            >
              <span className="font-display font-bold text-sm" style={{ color: '#7a5300' }}>{itemCount}</span>
              <span className="font-body text-xs" style={{ color: 'rgba(107,68,0,0.65)' }}>
                {itemCount === 1 ? 'item' : 'items'}
              </span>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* ── Items column ───────────────────────────────────────────── */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                background: 'rgba(255,252,245,0.92)',
                border: '1px solid rgba(160,112,16,0.10)',
                boxShadow: '0 4px 28px -8px rgba(13,44,7,0.08)',
              }}
            >
              {/* Panel header */}
              <div
                className="flex items-center justify-between px-5 sm:px-6 py-4"
                style={{ borderBottom: '1px solid rgba(160,112,16,0.08)' }}
              >
                <div>
                  <p className="font-display font-semibold" style={{ fontSize: 15, color: '#0b1c08' }}>
                    Your Items
                  </p>
                  <p className="font-body text-xs mt-0.5" style={{ color: 'rgba(46,66,37,0.42)' }}>
                    {itemCount} {itemCount === 1 ? 'product' : 'products'}
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm"
                  style={{ background: 'rgba(160,112,16,0.10)', color: '#7a5300' }}
                >
                  {itemCount}
                </div>
              </div>

              {/* Items list */}
              <div className="px-5 sm:px-6">
                <AnimatePresence>
                  {items.map((item, index) => (
                    <motion.div
                      key={`${item.productId}-${item.variantSku || ''}`}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 16, height: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.28, delay: index * 0.05 }}
                      className="relative"
                    >
                      {/* Editorial item number */}
                      <span
                        className="absolute -left-5 sm:-left-6 top-6 hidden sm:block select-none font-mono font-bold"
                        style={{ fontSize: 10, color: 'rgba(160,112,16,0.22)', letterSpacing: '0.08em' }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <CartItem item={item} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* ── Summary column ─────────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="sticky top-28"
            >
              <CartSummary />
            </motion.div>
          </div>
        </div>

        {/* ── Cross-sell ───────────────────────────────────────────────── */}
        {crossSellProducts.length > 0 && (
          <motion.div
            className="mt-16"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <div className="mb-6 pb-4" style={{ borderBottom: '1px solid rgba(160,112,16,0.10)' }}>
              <p
                className="font-body uppercase mb-1.5"
                style={{ fontSize: 10, letterSpacing: '0.28em', color: 'rgba(46,66,37,0.38)', fontFamily: 'monospace' }}
              >
                Complete your order
              </p>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: '#a07010' }} />
                <h2 className="font-display text-xl font-bold" style={{ color: '#0b1c08' }}>
                  Frequently Bought Together
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {crossSellProducts.map((product, index) => (
                <PremiumProductCardCompact key={product._id} product={product} index={index} />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Mobile sticky bar ────────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-40"
        style={{
          background: 'rgba(247,241,232,0.97)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(160,112,16,0.12)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 10, color: 'rgba(46,66,37,0.45)' }}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
            <p className="font-display text-base font-bold" style={{ color: '#0b1c08' }}>
              Proceed to Checkout
            </p>
          </div>
          <Link
            href="/checkout"
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: '#a07010', color: '#fff', boxShadow: '0 4px 18px -4px rgba(160,112,16,0.45)' }}
          >
            <ShoppingCart className="w-4 h-4" />
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
