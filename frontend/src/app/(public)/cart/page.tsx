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
  const items     = useCartStore((s) => s.items);
  const syncCart  = useSyncCartOnAuth();
  const [mounted, setMounted] = useState(false);
  const [crossSellProducts, setCrossSellProducts] = useState<Product[]>([]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { syncCart(); }, [syncCart]);

  const itemCount = items.length;

  useEffect(() => {
    if (!mounted || itemCount === 0) return;

    const fetchCrossSell = async () => {
      try {
        const cartProductIds = items.map((i) => i.productId);
        const firstItem = items[0];
        let categoryId: string | undefined;
        try {
          const product = await api.getProduct(firstItem.productId);
          if (typeof product.category === 'string') categoryId = product.category;
          else if (product.category && typeof product.category === 'object') categoryId = (product.category as Category)._id;
        } catch { /* ignore */ }
        const res = await api.getProducts({ limit: 12, sortBy: 'totalSold', sortOrder: 'desc', isActive: true, category: categoryId });
        setCrossSellProducts(res.items.filter((p: Product) => !cartProductIds.includes(p._id)).slice(0, 4));
      } catch { /* ignore */ }
    };

    fetchCrossSell();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, itemCount]);

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

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center" style={{ background: '#f2ece0' }}>
        <motion.div
          className="text-center max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Empty state icon */}
          <div
            className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(160,112,16,0.10)', border: '1px solid rgba(160,112,16,0.20)' }}
          >
            <ShoppingBag className="w-10 h-10" style={{ color: 'rgba(160,112,16,0.60)' }} />
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

  return (
    <div className="min-h-screen pt-24 pb-[72px] lg:pb-0" style={{ background: '#f2ece0' }}>
      {/* Hero bar */}
      <div className="relative overflow-hidden pb-8 pt-4" style={{ borderBottom: '1px solid rgba(26,82,16,0.08)' }}>
        <div
          className="pointer-events-none absolute top-0 right-1/4 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(26,82,16,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-sm font-medium mb-4 transition-colors duration-200"
            style={{ color: 'rgba(46,66,37,0.45)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#a07010')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(46,66,37,0.45)')}
          >
            <ArrowLeft className="w-4 h-4" /> Continue Shopping
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl font-bold" style={{ color: '#0b1c08', letterSpacing: '-0.02em' }}>
            Shopping Cart
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'rgba(46,66,37,0.45)' }}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart items */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="rounded-3xl overflow-hidden"
              style={{ background: 'rgba(255,252,245,0.90)', border: '1px solid rgba(26,82,16,0.10)', boxShadow: '0 4px 24px -8px rgba(13,44,7,0.08)' }}
            >
              <div className="p-5 sm:p-6">
                <AnimatePresence>
                  {items.map((item, index) => (
                    <motion.div
                      key={`${item.productId}-${item.variantSku || ''}`}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 16, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      <CartItem item={item} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="sticky top-28"
            >
              <CartSummary />
            </motion.div>
          </div>
        </div>

        {/* Cross-sell */}
        {crossSellProducts.length > 0 && (
          <motion.div
            className="mt-16"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <div
              className="mb-6 pb-4"
              style={{ borderBottom: '1px solid rgba(26,82,16,0.10)' }}
            >
              <p style={{ fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(46,66,37,0.40)', fontFamily: 'monospace', marginBottom: 6 }}>
                You might also like
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

      {/* Mobile sticky checkout bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40" style={{ background: 'rgba(247,241,232,0.97)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(26,82,16,0.10)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px]" style={{ color: 'rgba(46,66,37,0.45)' }}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
            <p className="font-display text-base font-bold" style={{ color: '#0b1c08' }}>View Summary</p>
          </div>
          <Link
            href="/checkout"
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold"
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
