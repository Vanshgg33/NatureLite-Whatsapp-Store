'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ShoppingBag, X, ArrowRight } from 'lucide-react';
import { useWishlistStore } from '@/lib/wishlist-store';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { useCustomerStore } from '@/lib/customer-store';
import { api } from '@/lib/api';

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

export default function WishlistPage() {
  const items         = useWishlistStore((s) => s.items);
  const remove        = useWishlistStore((s) => s.remove);
  const clear         = useWishlistStore((s) => s.clear);
  const setItems      = useWishlistStore((s) => s.setItems);
  const addItem       = useCartStore((s) => s.addItem);
  const { toast }     = useToast();
  const isAuthenticated = useCustomerStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const wishlist = await api.getWishlist();
        setItems(wishlist.items.map((item) => ({ productId: item.productId, slug: item.slug, name: item.name, image: item.image, price: item.price })));
      } catch { /* fail silently */ }
    })();
  }, [isAuthenticated, setItems]);

  const handleMoveToCart = (productId: string) => {
    const item = items.find((i) => i.productId === productId);
    if (!item) return;
    addItem({ productId: item.productId, name: item.name, slug: item.slug, image: item.image || '/images/products/placeholder.jpg', price: item.price, gstPercentage: 5 }, 1);
    remove(productId);
    toast({ title: 'Moved to cart', description: `${item.name} added to your cart.` });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center" style={{ background: '#f2ece0' }}>
        <motion.div
          className="text-center max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(160,112,16,0.10)', border: '1px solid rgba(160,112,16,0.20)' }}
          >
            <Heart className="w-10 h-10" style={{ color: 'rgba(160,112,16,0.55)' }} />
          </div>
          <h1 className="font-display text-2xl font-bold mb-3" style={{ color: '#0b1c08' }}>
            Sign in to see your wishlist
          </h1>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: 'rgba(46,66,37,0.50)' }}>
            Save products you love and access them from any device.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
              style={{ background: '#a07010', color: '#fff', boxShadow: '0 4px 20px -4px rgba(160,112,16,0.40)' }}
            >
              Sign In <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
              style={{ border: '1px solid rgba(26,82,16,0.20)', color: '#0b1c08', background: 'transparent' }}
            >
              Browse Products
            </Link>
          </div>
        </motion.div>
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
          <div
            className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(160,112,16,0.10)', border: '1px solid rgba(160,112,16,0.20)' }}
          >
            <Heart className="w-10 h-10" style={{ color: 'rgba(160,112,16,0.55)' }} />
          </div>
          <h1 className="font-display text-2xl font-bold mb-3" style={{ color: '#0b1c08' }}>
            Your wishlist is empty
          </h1>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: 'rgba(46,66,37,0.50)' }}>
            Save products you love and come back to them anytime.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: '#a07010', color: '#fff', boxShadow: '0 4px 20px -4px rgba(160,112,16,0.40)' }}
          >
            Browse Products <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24" style={{ background: '#f2ece0' }}>
      {/* Page header */}
      <div className="relative overflow-hidden pb-8 pt-4" style={{ borderBottom: '1px solid rgba(26,82,16,0.08)' }}>
        <div
          className="pointer-events-none absolute top-0 left-1/3 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(26,82,16,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <p style={{ fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(46,66,37,0.40)', fontFamily: 'monospace', marginBottom: 8 }}>
                Saved for later
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold" style={{ color: '#0b1c08', letterSpacing: '-0.02em' }}>
                My Wishlist
              </h1>
              <p className="mt-1 text-sm" style={{ color: 'rgba(46,66,37,0.45)' }}>
                {items.length} {items.length === 1 ? 'item' : 'items'} saved
              </p>
            </div>
            <button
              onClick={clear}
              className="text-sm font-medium transition-colors duration-200 pb-1"
              style={{ color: 'rgba(46,66,37,0.45)', borderBottom: '1px solid rgba(46,66,37,0.20)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#a07010')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(46,66,37,0.45)')}
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <AnimatePresence>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {items.map((item, index) => (
              <motion.div
                key={item.productId}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className="group relative flex flex-col rounded-3xl overflow-hidden"
                style={{ background: 'rgba(255,252,245,0.92)', border: '1px solid rgba(26,82,16,0.10)', boxShadow: '0 2px 16px -4px rgba(13,44,7,0.07)' }}
              >
                {/* Image */}
                <Link href={`/products/${item.slug}`} className="relative block aspect-square overflow-hidden" style={{ background: 'rgba(242,236,224,0.60)' }}>
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-contain transition-transform duration-500 group-hover:scale-105"
                      style={{ padding: '8%' }}
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-display font-black" style={{ fontSize: '4rem', color: 'rgba(160,112,16,0.15)', letterSpacing: '-0.04em' }}>
                        {(item.name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    onClick={(e) => { e.preventDefault(); remove(item.productId); }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 sm:opacity-0 sm:group-hover:opacity-100"
                    style={{ background: 'rgba(255,252,245,0.88)', backdropFilter: 'blur(8px)', border: '1px solid rgba(26,82,16,0.15)' }}
                  >
                    <X className="w-3.5 h-3.5" style={{ color: 'rgba(46,66,37,0.60)' }} />
                  </button>
                </Link>

                {/* Info */}
                <div className="p-4 flex-1 flex flex-col">
                  <Link href={`/products/${item.slug}`}>
                    <h2
                      className="font-display text-base font-semibold line-clamp-1 mb-1 transition-colors duration-200"
                      style={{ color: '#0b1c08' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#a07010')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#0b1c08')}
                    >
                      {item.name}
                    </h2>
                  </Link>
                  <p className="text-base font-bold mb-4" style={{ color: '#0b1c08' }}>
                    {formatPrice(item.price)}
                  </p>
                  <button
                    onClick={() => handleMoveToCart(item.productId)}
                    className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                    style={{ background: '#0b1c08', color: '#fff8f0' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#a07010')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#0b1c08')}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Move to Cart
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </div>
    </div>
  );
}
