'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag } from 'lucide-react';

const DISMISS_KEY = 'social-proof-dismissed';
const SHOW_DELAY = 10000; // 10 seconds
const DISPLAY_DURATION = 4000; // Show for 4 seconds
const GAP_DURATION = 6000; // 6 seconds between popups

const recentPurchases = [
  { name: 'A2 Bilona Ghee', city: 'Mumbai', time: '3 min ago' },
  { name: 'Wood-Pressed Groundnut Oil', city: 'Delhi', time: '5 min ago' },
  { name: 'Organic Turmeric Powder', city: 'Bangalore', time: '8 min ago' },
  { name: 'Cold-Pressed Coconut Oil', city: 'Chennai', time: '12 min ago' },
  { name: 'Raw Forest Honey', city: 'Pune', time: '15 min ago' },
  { name: 'Immunity Combo Pack', city: 'Jaipur', time: '18 min ago' },
  { name: 'Organic Moringa Powder', city: 'Hyderabad', time: '22 min ago' },
  { name: 'Premium Dry Fruits Mix', city: 'Kolkata', time: '25 min ago' },
];

const buyerNames = ['Someone', 'A customer', 'A health enthusiast', 'A happy customer'];

export function SocialProofPopup() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Only show on homepage and product listing pages
  const shouldShow = pathname === '/' || pathname === '/products';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    setIsDismissed(!!dismissed);
  }, []);

  const showNext = useCallback(() => {
    setIsVisible(true);
    setTimeout(() => {
      setIsVisible(false);
    }, DISPLAY_DURATION);
  }, []);

  useEffect(() => {
    if (isDismissed || !shouldShow) return;

    // Initial delay
    const initialTimeout = setTimeout(() => {
      showNext();
    }, SHOW_DELAY);

    // Recurring cycle
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % recentPurchases.length);
      showNext();
    }, DISPLAY_DURATION + GAP_DURATION);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isDismissed, shouldShow, showNext]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  };

  if (isDismissed || !shouldShow) return null;

  const purchase = recentPurchases[currentIndex];
  const buyerName = buyerNames[currentIndex % buyerNames.length];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed bottom-6 left-6 z-50 max-w-sm"
          initial={{ opacity: 0, y: 20, x: -20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 20, x: -20 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="bg-white rounded-2xl shadow-brand-xl p-4 pr-10 border border-brand-border">
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-cream flex items-center justify-center text-brand-muted hover:text-brand-charcoal transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-brand-green" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand-charcoal truncate">
                  {buyerName} in {purchase.city}
                </p>
                <p className="text-xs text-brand-muted">
                  purchased <span className="font-medium text-brand-green">{purchase.name}</span>
                </p>
                <p className="text-xs text-brand-muted-light mt-0.5">{purchase.time}</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
