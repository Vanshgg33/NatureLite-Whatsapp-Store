'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShoppingBag, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CartItem } from '@/components/ecommerce/cart-item';
import { CartSummary } from '@/components/ecommerce/cart-summary';
import { PremiumProductCardCompact } from '@/components/ecommerce/premium-product-card';
import { useCartStore, useSyncCartOnAuth } from '@/lib/cart-store';
import { api } from '@/lib/api';
import { Product, Category } from '@/types';

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const syncCart = useSyncCartOnAuth();
  const [mounted, setMounted] = useState(false);
  const [crossSellProducts, setCrossSellProducts] = useState<Product[]>([]);

  // Handle hydration mismatch with Zustand persist
  useEffect(() => {
    setMounted(true);
  }, []);

  // Always sync cart from server when page mounts (for logged-in users)
  useEffect(() => {
    syncCart();
  }, [syncCart]);

  // Fetch cross-sell products (category-aware, only when cart has items)
  const itemCount = items.length;
  useEffect(() => {
    if (!mounted || itemCount === 0) return;

    const fetchCrossSell = async () => {
      try {
        const cartProductIds = items.map((i) => i.productId);
        const firstItem = items[0];
        let categoryId: string | undefined;

        // Try to infer category from the first cart product
        try {
          const product = await api.getProduct(firstItem.productId);
          if (typeof product.category === 'string') {
            categoryId = product.category;
          } else if (product.category && typeof product.category === 'object') {
            categoryId = (product.category as Category)._id;
          }
        } catch {
          // Fallback: ignore category and use generic top sellers
        }

        const res = await api.getProducts({
          limit: 12,
          sortBy: 'totalSold',
          sortOrder: 'desc',
          isActive: true,
          category: categoryId,
        });

        const filtered = res.items.filter((p: Product) => !cartProductIds.includes(p._id));
        setCrossSellProducts(filtered.slice(0, 4));
      } catch {
        // Ignore cross-sell errors
      }
    };

    fetchCrossSell();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, itemCount]);

  if (!mounted) {
    return (
      <div className="min-h-screen pt-20 bg-brand-cream">
        <div className="brand-container py-12">
          <div className="animate-pulse">
            <div className="h-8 bg-brand-sand rounded w-48 mb-8" />
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-brand-sand rounded-xl" />
                ))}
              </div>
              <div className="h-96 bg-brand-sand rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-20 bg-brand-cream">
        <div className="brand-container py-24">
          <motion.div
            className="max-w-md mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-brand-sand flex items-center justify-center">
              <ShoppingBag className="w-10 h-10 text-brand-muted" />
            </div>
            <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-3">
              Your cart is empty
            </h1>
            <p className="font-body text-brand-muted mb-8">
              Looks like you haven&apos;t added anything to your cart yet.
              Explore our collection of pure, traditional products.
            </p>
            <Link href="/products">
              <Button className="bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-full px-8">
                Start Shopping
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <div className="brand-container py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 font-body text-sm text-brand-muted hover:text-brand-charcoal mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Continue Shopping
            </Link>
            <h1 className="font-display text-3xl font-bold text-brand-charcoal">
              Shopping Cart
            </h1>
            <p className="font-body text-brand-muted mt-1">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
        </div>

        {/* Cart Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <motion.div
              className="bg-white rounded-2xl p-6 shadow-brand-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {items.map((item, index) => (
                <motion.div
                  key={`${item.productId}-${item.variantSku || ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <CartItem item={item} />
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="sticky top-28"
            >
              <CartSummary />
            </motion.div>
          </div>
        </div>

        {/* Frequently Bought Together */}
        {crossSellProducts.length > 0 && (
          <motion.div
            className="mt-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-brand-mustard" />
              <h2 className="font-display text-xl font-semibold text-brand-charcoal">
                Frequently Bought Together
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {crossSellProducts.map((product, index) => (
                <PremiumProductCardCompact
                  key={product._id}
                  product={product}
                  index={index}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
