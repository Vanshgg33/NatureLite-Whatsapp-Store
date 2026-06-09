'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const FREE_SHIPPING_DEFAULT = 499;

/**
 * Sticky bottom bar: cart summary + checkout CTA + free-shipping progress (psychology).
 * Shown when user has scrolled and/or has items in cart.
 */
export function StickyCartBar() {
  const pathname = usePathname();
  const [showBar, setShowBar] = useState(false);
  const { items, getSubtotal, getItemCount } = useCartStore();

  const { data: publicSettings } = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => api.getPublicSettings(),
    staleTime: 10 * 60 * 1000,
  });
  const freeShippingThreshold =
    (publicSettings?.store as { freeShippingThreshold?: number })?.freeShippingThreshold ??
    FREE_SHIPPING_DEFAULT;

  const subtotal = getSubtotal();
  const itemCount = getItemCount();
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const progressPercent = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  useEffect(() => {
    const handleScroll = () => {
      setShowBar(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const visible = showBar && pathname !== '/checkout' && pathname?.startsWith('/');
  const hasItems = itemCount > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="hidden sm:block fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-brand-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-brand-charcoal" />
                <span className="font-semibold text-brand-charcoal">
                  {hasItems ? (
                    <>
                      Cart: {itemCount} {itemCount === 1 ? 'item' : 'items'} · ₹{Math.round(subtotal)}
                    </>
                  ) : (
                    'Your cart is empty'
                  )}
                </span>
              </div>
              {hasItems && amountToFreeShipping > 0 && (
                <div className="hidden sm:block text-sm text-brand-muted">
                  <span className="text-brand-terracotta font-medium">
                    ₹{amountToFreeShipping} away
                  </span>
                  {' '}from free shipping
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hasItems && (
                <div className="hidden sm:block w-24 h-1.5 bg-brand-sand rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-brand-mustard rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              )}
              <Link
                href={hasItems ? '/cart' : '/products'}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-brand-charcoal text-white text-sm font-semibold rounded-full hover:bg-brand-brown"
                style={{ transition: 'background-color 0.1s' }}
              >
                {hasItems ? 'View cart' : 'Shop now'}
              </Link>
              {hasItems && (
                <Link
                  href="/checkout"
                  className="inline-flex items-center justify-center px-5 py-2.5 bg-brand-mustard text-white text-sm font-semibold rounded-full hover:opacity-90"
                  style={{ transition: 'opacity 0.1s' }}
                >
                  Checkout
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
