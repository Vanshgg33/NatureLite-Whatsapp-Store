'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, Loader2, Minus, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { Product } from '@/types';
import { WhatsAppOrderModal } from '@/components/ecommerce/whatsapp-order-modal';

// ─── WA Icon ──────────────────────────────────────────────────────────────────
function WaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="currentColor" />
      <path d="M12.004 2C6.478 2 2 6.478 2 12.004c0 1.77.46 3.435 1.268 4.888L2 22l5.265-1.383A9.96 9.96 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.478 17.53 2 12.004 2zm0 18.18a8.163 8.163 0 01-4.148-1.132l-.297-.176-3.124.82.835-3.042-.193-.313A8.18 8.18 0 013.82 12.004c0-4.512 3.672-8.184 8.184-8.184 4.512 0 8.18 3.672 8.18 8.184 0 4.511-3.668 8.176-8.18 8.176z" fill="currentColor" />
    </svg>
  );
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

// ─── Slot-machine number ───────────────────────────────────────────────────────
function SlotNumber({ value }: { value: number }) {
  const prevRef = useRef(value);
  const dir = value > prevRef.current ? 1 : -1;

  useEffect(() => { prevRef.current = value; }, [value]);

  return (
    <div style={{ overflow: 'hidden', height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: dir * 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -dir * 14 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          style={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ─── Quantity Stepper (reusable) ───────────────────────────────────────────────
function Stepper({
  qty, stock, onDecrement, onIncrement, size = 'md',
}: {
  qty: number; stock: number;
  onDecrement: () => void; onIncrement: () => void;
  size?: 'sm' | 'md';
}) {
  const btnSize = size === 'sm' ? 36 : 30;
  const iconSize = size === 'sm' ? 13 : 12;
  const numWidth = size === 'sm' ? 36 : 34;

  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: 3,
        background: 'rgba(11,28,8,0.03)', border: '1px solid rgba(11,28,8,0.08)',
        borderRadius: size === 'sm' ? 13 : 12,
      }}
    >
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={onDecrement}
        disabled={qty === 0}
        style={{
          width: btnSize, height: btnSize, borderRadius: size === 'sm' ? 10 : 9,
          border: 'none', cursor: qty === 0 ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: qty > 0 ? 'rgba(160,112,16,0.09)' : 'transparent',
          color: qty === 0 ? 'rgba(11,28,8,0.18)' : '#0b1c08',
          transition: 'all 0.15s', flexShrink: 0,
        }}
      >
        <Minus size={iconSize} strokeWidth={2.5} />
      </motion.button>

      <div style={{ width: numWidth, textAlign: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
        <SlotNumber value={qty} />
      </div>

      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={onIncrement}
        disabled={qty >= stock}
        style={{
          width: btnSize, height: btnSize, borderRadius: size === 'sm' ? 10 : 9,
          border: 'none', cursor: qty >= stock ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: qty < stock ? '#0b1c08' : 'transparent',
          color: qty < stock ? '#fff' : 'rgba(11,28,8,0.18)',
          transition: 'all 0.15s', flexShrink: 0,
        }}
      >
        <Plus size={iconSize} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}

// ─── Background effects ────────────────────────────────────────────────────────
function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`,
        opacity: 0.03,
      }}
    />
  );
}

function AmbientOrbs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        animate={{ scale: [1, 1.18, 1], opacity: [0.24, 0.4, 0.24] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: '-10%', left: '-10%',
          width: 'min(640px, 90vw)', height: 'min(640px, 90vw)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(160,112,16,0.14) 0%, transparent 68%)',
          filter: 'blur(55px)',
        }}
      />
      <motion.div
        animate={{ scale: [1, 1.25, 1], opacity: [0.14, 0.26, 0.14] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        style={{
          position: 'absolute', bottom: '10%', right: '-12%',
          width: 'min(500px, 80vw)', height: 'min(500px, 80vw)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(11,28,8,0.1) 0%, transparent 70%)',
          filter: 'blur(70px)',
        }}
      />
    </div>
  );
}

// ─── Ornamental expanding line ─────────────────────────────────────────────────
function OrnamentLine({ delay = 0, reverse = false }: { delay?: number; reverse?: boolean }) {
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1], delay }}
      style={{
        transformOrigin: reverse ? 'right' : 'left',
        height: 1, flex: 1,
        background: reverse
          ? 'linear-gradient(90deg, transparent, rgba(160,112,16,0.35))'
          : 'linear-gradient(90deg, rgba(160,112,16,0.35), transparent)',
      }}
    />
  );
}

// ─── Stock Badge ──────────────────────────────────────────────────────────────
function StockBadge({ isOOS, isLow, stock }: { isOOS: boolean; isLow: boolean; stock: number }) {
  if (isOOS) return (
    <span style={{ padding: '3px 9px', borderRadius: 100, background: 'rgba(220,38,38,0.07)', color: '#b91c1c', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
      Out of Stock
    </span>
  );
  if (isLow) return (
    <div className="flex items-center gap-1.5">
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#d97706', animation: 'qo-pulse 2s ease-in-out infinite', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: '#b45309', whiteSpace: 'nowrap' }}>Low ({stock})</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: '#15803d' }}>In Stock</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function QuickOrderPage() {
  const { toast } = useToast();
  const addItem = useCartStore((s) => s.addItem);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addingToCart, setAddingToCart] = useState(false);
  const [showWaModal, setShowWaModal] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['quick-order-products-list'],
    queryFn: () => api.getProducts({ limit: 100, isActive: true }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories } = useQuery({
    queryKey: ['quick-order-categories'],
    queryFn: () => api.getActiveCategories(),
    staleTime: 10 * 60 * 1000,
  });

  const products = productsData?.items ?? [];

  const catalogRows = useMemo(() => {
    const list: Array<{
      id: string; productId: string; product: Product;
      name: string; slug: string; variantName?: string; variantSku?: string;
      sku: string; price: number; compareAtPrice?: number;
      stock: number; image: string; category: string;
    }> = [];

    products.forEach((p) => {
      if (!p.isActive) return;
      const catId = typeof p.category === 'object' && p.category
        ? (p.category._id || '') : String(p.category || '');

      if (p.variants && p.variants.length > 0) {
        p.variants.forEach((v) => {
          if (!v.isActive) return;
          list.push({
            id: `${p._id}-${v.sku}`, productId: p._id, product: p,
            name: p.name, slug: p.slug,
            variantName: v.name, variantSku: v.sku, sku: v.sku,
            price: v.price, compareAtPrice: v.compareAtPrice, stock: v.stock,
            image: (v.images && v.images.length > 0) ? v.images[0] : p.images[0],
            category: catId,
          });
        });
      } else {
        list.push({
          id: p._id, productId: p._id, product: p,
          name: p.name, slug: p.slug, sku: p.sku,
          price: p.price, compareAtPrice: p.compareAtPrice, stock: p.stock,
          image: p.images[0], category: catId,
        });
      }
    });
    return list;
  }, [products]);

  const filteredRows = useMemo(() => catalogRows.filter((item) => {
    const q = search.toLowerCase();
    return (
      (item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.variantName?.toLowerCase().includes(q) ?? false)) &&
      (activeCategory === 'all' || item.category === activeCategory)
    );
  }), [catalogRows, search, activeCategory]);

  const allSelectedItems = useMemo(() =>
    catalogRows
      .map((row) => ({ ...row, quantity: quantities[row.id] ?? 0 }))
      .filter((item) => item.quantity > 0),
    [catalogRows, quantities]
  );

  const selectedCount = allSelectedItems.reduce((acc, i) => acc + i.quantity, 0);
  const totalAmount = allSelectedItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

  const handleQuantityChange = (id: string, delta: number, stock: number) => {
    const next = Math.max(0, (quantities[id] ?? 0) + delta);
    if (next > stock) {
      toast({ title: 'Insufficient Stock', description: `Only ${stock} in stock.`, variant: 'destructive' });
      return;
    }
    setQuantities((prev) => ({ ...prev, [id]: next }));
  };

  const handleAddAllToCart = async () => {
    if (!allSelectedItems.length) return;
    setAddingToCart(true);
    try {
      for (const item of allSelectedItems) {
        await addItem({
          productId: item.productId, name: item.name, slug: item.slug,
          image: item.image || '/images/products/placeholder.jpg',
          price: item.price, compareAtPrice: item.compareAtPrice,
          variantSku: item.variantSku, variantName: item.variantName,
          gstPercentage: item.product.gstPercentage ?? 5,
        }, item.quantity);
      }
      toast({ title: 'Added to cart!', description: `${selectedCount} items added successfully.` });
      setQuantities({});
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to add items to cart.', variant: 'destructive' });
    } finally {
      setAddingToCart(false);
    }
  };

  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
  };
  const rowVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { ease: [0.23, 1, 0.32, 1], duration: 0.45 } },
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        .qo-mono { font-family: 'DM Mono', 'Courier New', monospace; }
        @keyframes qo-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .qo-hscroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .qo-hscroll::-webkit-scrollbar { display: none; }
        .qo-hscroll { scrollbar-width: none; -ms-overflow-style: none; }
      `}} />

      {/* Page adds extra padding-bottom only when sticky bar is visible */}
      <div
        className="min-h-screen"
        style={{
          background: '#f2ece0',
          paddingBottom: selectedCount > 0 ? 'calc(env(safe-area-inset-bottom) + 130px)' : '48px',
          transition: 'padding-bottom 0.3s ease',
        }}
      >
        <GrainOverlay />
        <AmbientOrbs />

        {/* ════════ HERO ════════ */}
        <div className="relative z-10 pt-20 sm:pt-28 pb-10 sm:pb-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">

            {/* Ornament + label row — hide label text below 380px to prevent overflow */}
            <div className="flex items-center gap-3 sm:gap-5 mb-6 sm:mb-8">
              <OrnamentLine delay={0.2} />
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="qo-mono shrink-0 hidden sm:block"
                style={{ fontSize: 9, letterSpacing: '0.36em', textTransform: 'uppercase', color: 'rgba(160,112,16,0.6)' }}
              >
                Frictionless Checkout
              </motion.div>
              <OrnamentLine delay={0.3} reverse />
            </div>

            {/* Title */}
            <div className="text-center">
              <div className="overflow-hidden">
                <motion.h1
                  initial={{ y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.85, ease: [0.23, 1, 0.32, 1], delay: 0.15 }}
                  className="font-display font-bold text-[#0b1c08] leading-none"
                  style={{ fontSize: 'clamp(2.2rem, 8vw, 5.5rem)', letterSpacing: '-0.02em' }}
                >
                  Quick Order Pad
                </motion.h1>
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.7 }}
                className="font-display italic mt-1.5"
                style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.3rem)', color: '#a07010' }}
              >
                — build your order, checkout instantly —
              </motion.p>

              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1], delay: 0.4 }}
                style={{
                  height: 1, margin: '16px auto 0', width: '70%', maxWidth: 380,
                  background: 'linear-gradient(90deg, transparent, rgba(160,112,16,0.4), transparent)',
                  transformOrigin: 'center',
                }}
              />

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.75, duration: 0.6 }}
                className="text-center mt-3 max-w-xs sm:max-w-md mx-auto leading-relaxed text-[#2e4225]/50"
                style={{ fontSize: 12, fontWeight: 300 }}
              >
                Set quantities across your favourite staples and checkout via cart or WhatsApp.
              </motion.p>
            </div>
          </div>
        </div>

        {/* ════════ FILTERS ════════ */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-col gap-2.5"
            style={{
              background: 'rgba(255,253,247,0.85)',
              border: '1px solid rgba(160,112,16,0.1)',
              borderRadius: 20,
              padding: '10px 12px',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 2px 24px rgba(11,28,8,0.04), 0 1px 0 rgba(255,255,255,0.6) inset',
            }}
          >
            {/* Category pills — horizontally scrollable on mobile */}
            <div className="qo-hscroll">
              <div className="flex items-center gap-1.5" style={{ width: 'max-content', minWidth: '100%' }}>
                {[{ _id: 'all', name: 'All' }, ...(categories ?? [])].map((cat) => {
                  const isActive = activeCategory === cat._id;
                  const label = cat._id === 'all' ? 'All Categories' : cat.name;
                  return (
                    <button
                      key={cat._id}
                      onClick={() => setActiveCategory(cat._id)}
                      className="rounded-full font-semibold transition-all duration-200 whitespace-nowrap"
                      style={{
                        padding: '6px 14px',
                        fontSize: 11,
                        color: isActive ? '#fff' : 'rgba(11,28,8,0.6)',
                        background: isActive ? '#0b1c08' : 'transparent',
                        boxShadow: isActive ? '0 2px 10px rgba(11,28,8,0.2)' : 'none',
                        border: 'none', cursor: 'pointer',
                        // 44px minimum touch target height via min-height
                        minHeight: 36,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <motion.div
                animate={{ opacity: searchFocused ? 1 : 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: 'absolute', inset: -1, borderRadius: 13,
                  border: '1.5px solid rgba(160,112,16,0.4)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search by product name or SKU..."
                className="w-full qo-mono outline-none transition-all duration-200"
                style={{
                  padding: '10px 14px 10px 36px',
                  fontSize: 12, letterSpacing: '0.02em',
                  background: 'rgba(11,28,8,0.03)',
                  border: '1px solid rgba(11,28,8,0.07)',
                  borderRadius: 12, color: '#0b1c08',
                }}
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
                style={{ width: 14, height: 14, color: searchFocused ? '#a07010' : 'rgba(11,28,8,0.28)' }}
              />
            </div>
          </motion.div>

          {/* Row count */}
          <AnimatePresence>
            {!productsLoading && filteredRows.length > 0 && (
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="qo-mono"
                style={{ fontSize: 10, color: 'rgba(11,28,8,0.3)', letterSpacing: '0.06em', paddingLeft: 4 }}
              >
                {filteredRows.length} {filteredRows.length === 1 ? 'product' : 'products'} listed
              </motion.p>
            )}
          </AnimatePresence>

          {/* ════════ LOADING ════════ */}
          {productsLoading && (
            <div className="py-32 flex flex-col items-center gap-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: '1.5px solid rgba(160,112,16,0.15)',
                  borderTopColor: '#a07010',
                }}
              />
              <p className="font-display italic" style={{ fontSize: 14, color: 'rgba(46,66,37,0.45)' }}>
                Loading catalog&hellip;
              </p>
            </div>
          )}

          {/* ════════ EMPTY ════════ */}
          {!productsLoading && filteredRows.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="py-20 text-center space-y-2"
              style={{ border: '1px dashed rgba(160,112,16,0.18)', borderRadius: 20 }}
            >
              <p className="font-display italic" style={{ fontSize: 38, color: 'rgba(11,28,8,0.1)' }}>∅</p>
              <p className="font-semibold text-sm text-[#0b1c08]">No products found</p>
              <p className="text-xs text-[#2e4225]/45 max-w-xs mx-auto leading-relaxed px-4">
                Try adjusting your search or selecting a different category.
              </p>
            </motion.div>
          )}

          {/* ════════ DESKTOP TABLE ════════ */}
          {!productsLoading && filteredRows.length > 0 && (
            <>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.72, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className="hidden md:block overflow-hidden"
                style={{
                  background: 'rgba(255,253,247,0.88)',
                  border: '1px solid rgba(160,112,16,0.09)',
                  borderRadius: 24,
                  backdropFilter: 'blur(14px)',
                  boxShadow: '0 4px 40px rgba(11,28,8,0.05), 0 1px 0 rgba(255,255,255,0.7) inset',
                }}
              >
                {/* Header */}
                <div
                  className="grid items-center px-6 py-3.5 qo-mono"
                  style={{
                    gridTemplateColumns: '1fr 110px 110px 168px 120px',
                    borderBottom: '1px solid rgba(11,28,8,0.055)',
                    fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: 'rgba(11,28,8,0.3)',
                  }}
                >
                  <span>Product</span>
                  <span>Stock</span>
                  <span style={{ textAlign: 'right' }}>Price</span>
                  <span style={{ textAlign: 'center' }}>Quantity</span>
                  <span style={{ textAlign: 'right' }}>Subtotal</span>
                </div>

                {/* Rows */}
                <motion.div variants={containerVariants} initial="hidden" animate="show">
                  {filteredRows.map((item, idx) => {
                    const qty = quantities[item.id] ?? 0;
                    const isOOS = item.stock <= 0;
                    const isLow = !isOOS && item.stock <= (item.product.lowStockThreshold ?? 5);
                    const isSelected = qty > 0;

                    return (
                      <motion.div
                        key={item.id}
                        variants={rowVariants}
                        className="grid items-center px-6 py-4 relative"
                        style={{
                          gridTemplateColumns: '1fr 110px 110px 168px 120px',
                          borderBottom: idx < filteredRows.length - 1 ? '1px solid rgba(11,28,8,0.04)' : 'none',
                          background: isSelected
                            ? 'linear-gradient(90deg, rgba(160,112,16,0.05), rgba(160,112,16,0.02))'
                            : 'transparent',
                          transition: 'background 0.25s ease',
                        }}
                      >
                        {/* Selection stripe */}
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ scaleY: 0, opacity: 0 }}
                              animate={{ scaleY: 1, opacity: 1 }}
                              exit={{ scaleY: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                              style={{
                                position: 'absolute', left: 0, top: '15%', bottom: '15%',
                                width: 3,
                                background: 'linear-gradient(180deg, #d4a820, #a07010)',
                                borderRadius: '0 3px 3px 0', transformOrigin: 'center',
                              }}
                            />
                          )}
                        </AnimatePresence>

                        {/* Product info */}
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className="relative shrink-0 overflow-hidden"
                            style={{
                              width: 80, height: 80, borderRadius: 14,
                              border: '1px solid rgba(160,112,16,0.11)', background: '#faf6ee',
                              boxShadow: isSelected ? '0 3px 12px rgba(160,112,16,0.12)' : '0 1px 4px rgba(11,28,8,0.05)',
                              transition: 'box-shadow 0.25s',
                            }}
                          >
                            {item.image
                              ? <><div className="absolute inset-[8%]"><Image src={item.image} alt={item.name} fill className="object-contain" /></div></>
                              : <div className="absolute inset-0 flex items-center justify-center font-display font-black text-amber-800/20 text-xl">{item.name.charAt(0)}</div>
                            }
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/products/${item.slug}`}
                              className="font-semibold text-sm text-[#0b1c08] hover:text-[#a07010] transition-colors block line-clamp-1"
                            >
                              {item.name}
                            </Link>
                            {item.variantName && (
                              <span className="qo-mono inline-block mt-0.5" style={{ padding: '2px 7px', borderRadius: 100, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(160,112,16,0.07)', color: '#a07010', border: '1px solid rgba(160,112,16,0.15)' }}>
                                {item.variantName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stock */}
                        <StockBadge isOOS={isOOS} isLow={isLow} stock={item.stock} />

                        {/* Price */}
                        <div style={{ textAlign: 'right' }}>
                          <span className="font-bold text-sm text-[#0b1c08]">{formatPrice(item.price)}</span>
                          {item.compareAtPrice && item.compareAtPrice > item.price && (
                            <span className="qo-mono block" style={{ fontSize: 9.5, textDecoration: 'line-through', color: 'rgba(11,28,8,0.28)' }}>
                              {formatPrice(item.compareAtPrice)}
                            </span>
                          )}
                        </div>

                        {/* Qty */}
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          {isOOS
                            ? <span style={{ fontSize: 10, color: '#e57373', fontWeight: 500 }}>Notify me</span>
                            : <Stepper qty={qty} stock={item.stock} onDecrement={() => handleQuantityChange(item.id, -1, item.stock)} onIncrement={() => handleQuantityChange(item.id, 1, item.stock)} />
                          }
                        </div>

                        {/* Subtotal */}
                        <div style={{ textAlign: 'right' }}>
                          <AnimatePresence mode="wait" initial={false}>
                            {qty > 0 ? (
                              <motion.span key="amt" initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.75 }} transition={{ duration: 0.2 }} className="font-black text-sm" style={{ color: '#a07010' }}>
                                {formatPrice(item.price * qty)}
                              </motion.span>
                            ) : (
                              <motion.span key="dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ color: 'rgba(11,28,8,0.18)', fontSize: 14 }}>—</motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </motion.div>

              {/* ════════ MOBILE CARDS ════════ */}
              <motion.div
                className="block md:hidden space-y-3"
                variants={containerVariants}
                initial="hidden"
                animate="show"
              >
                {filteredRows.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  const isOOS = item.stock <= 0;
                  const isLow = !isOOS && item.stock <= (item.product.lowStockThreshold ?? 5);
                  const isSelected = qty > 0;

                  return (
                    <motion.div
                      key={item.id}
                      variants={rowVariants}
                      // position:relative required for the absolute stripe child
                      style={{
                        position: 'relative',
                        background: isSelected ? 'rgba(255,253,247,0.97)' : 'rgba(255,253,247,0.72)',
                        border: `1px solid ${isSelected ? 'rgba(160,112,16,0.22)' : 'rgba(11,28,8,0.06)'}`,
                        borderRadius: 20,
                        padding: '14px 16px',
                        backdropFilter: 'blur(10px)',
                        transition: 'border-color 0.25s, box-shadow 0.25s, background 0.25s',
                        boxShadow: isSelected ? '0 6px 24px rgba(160,112,16,0.1)' : '0 1px 6px rgba(11,28,8,0.04)',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Left amber stripe */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ scaleY: 0, opacity: 0 }}
                            animate={{ scaleY: 1, opacity: 1 }}
                            exit={{ scaleY: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                            style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0,
                              width: 3,
                              background: 'linear-gradient(180deg, #d4a820, #a07010)',
                              transformOrigin: 'center',
                            }}
                          />
                        )}
                      </AnimatePresence>

                      {/* Product row */}
                      <div className="flex gap-3 items-start">
                        <div
                          className="relative shrink-0 overflow-hidden"
                          style={{
                            width: 80, height: 80, borderRadius: 16,
                            border: '1px solid rgba(160,112,16,0.1)', background: '#faf6ee',
                            boxShadow: isSelected ? '0 3px 12px rgba(160,112,16,0.1)' : 'none',
                            transition: 'box-shadow 0.25s',
                          }}
                        >
                          {item.image
                            ? <><div className="absolute inset-[8%]"><Image src={item.image} alt={item.name} fill className="object-contain" /></div></>
                            : <div className="absolute inset-0 flex items-center justify-center font-display font-black text-amber-800/20 text-xl">{item.name.charAt(0)}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <Link
                            href={`/products/${item.slug}`}
                            className="font-semibold text-sm text-[#0b1c08] hover:text-[#a07010] transition-colors block"
                            style={{ lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                          >
                            {item.name}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {item.variantName && (
                              <span className="qo-mono" style={{ padding: '2px 7px', borderRadius: 100, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(160,112,16,0.07)', color: '#a07010', border: '1px solid rgba(160,112,16,0.14)' }}>
                                {item.variantName}
                              </span>
                            )}
                            <StockBadge isOOS={isOOS} isLow={isLow} stock={item.stock} />
                          </div>
                        </div>
                      </div>

                      {/* Bottom row: price + stepper */}
                      <div
                        className="flex items-end justify-between mt-3 pt-3"
                        style={{ borderTop: '1px solid rgba(11,28,8,0.055)' }}
                      >
                        {/* Price block */}
                        <div>
                          <div className="qo-mono" style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(11,28,8,0.35)' }}>
                            Unit Price
                          </div>
                          <div className="font-bold mt-0.5 text-[#0b1c08]" style={{ fontSize: 15 }}>
                            {formatPrice(item.price)}
                          </div>
                          {/* Inline subtotal below price, only when qty > 0 */}
                          <AnimatePresence>
                            {qty > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 4 }}
                                transition={{ duration: 0.2 }}
                                className="qo-mono mt-0.5"
                                style={{ fontSize: 10, color: '#a07010', fontWeight: 600 }}
                              >
                                = {formatPrice(item.price * qty)} total
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Stepper or OOS */}
                        {isOOS ? (
                          <span style={{ padding: '5px 12px', borderRadius: 100, background: 'rgba(220,38,38,0.07)', color: '#b91c1c', fontSize: 10, fontWeight: 600 }}>
                            Out of Stock
                          </span>
                        ) : (
                          <Stepper
                            qty={qty} stock={item.stock} size="sm"
                            onDecrement={() => handleQuantityChange(item.id, -1, item.stock)}
                            onIncrement={() => handleQuantityChange(item.id, 1, item.stock)}
                          />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </>
          )}
        </div>

        {/* ════════ STICKY CHECKOUT BAR ════════ */}
        <AnimatePresence>
          {selectedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 90 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 90 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="fixed bottom-0 inset-x-0 z-50"
              style={{
                background: 'rgba(9,22,6,0.97)',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(24px)',
                boxShadow: '0 -24px 60px rgba(11,28,8,0.3)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
            >
              {/* Gold top accent line */}
              <div style={{ height: 1.5, background: 'linear-gradient(90deg, transparent, rgba(160,112,16,0.55), transparent)' }} />

              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">

                {/* Mobile layout: compact single row summary + full-width buttons below */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">

                  {/* Summary */}
                  <div className="flex items-center gap-4">
                    {/* Items */}
                    <div>
                      <div className="qo-mono" style={{ fontSize: 8, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
                        Items
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', flexShrink: 0, animation: 'qo-pulse 2s ease-in-out infinite' }} />
                        <span className="font-display italic" style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                          {selectedCount} {selectedCount === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

                    {/* Total */}
                    <div>
                      <div className="qo-mono" style={{ fontSize: 8, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
                        Subtotal
                      </div>
                      <div
                        className="font-display font-bold mt-0.5"
                        style={{
                          fontSize: 'clamp(16px, 4vw, 22px)', letterSpacing: '-0.01em',
                          background: 'linear-gradient(135deg, #e8c84a, #a07010)',
                          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                          lineHeight: 1.1,
                        }}
                      >
                        {formatPrice(totalAmount)}
                      </div>
                    </div>
                  </div>

                  {/* Buttons — full width grid on mobile, auto width on sm+ */}
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5">
                    <motion.button
                      whileHover={{ scale: 1.025 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setShowWaModal(true)}
                      className="inline-flex items-center justify-center gap-2 font-semibold"
                      style={{
                        padding: '11px 16px', borderRadius: 13, fontSize: 12.5,
                        border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #25d366, #128c7e)',
                        color: '#fff',
                        boxShadow: '0 4px 18px rgba(37,211,102,0.25)',
                      }}
                    >
                      <WaIcon size={15} />
                      <span>WhatsApp</span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.025 }}
                      whileTap={{ scale: 0.96 }}
                      disabled={addingToCart}
                      onClick={handleAddAllToCart}
                      className="inline-flex items-center justify-center gap-2 font-semibold"
                      style={{
                        padding: '11px 16px', borderRadius: 13, fontSize: 12.5,
                        border: 'none', cursor: addingToCart ? 'default' : 'pointer',
                        background: addingToCart ? 'rgba(160,112,16,0.45)' : 'linear-gradient(135deg, #e8c84a, #a07010)',
                        color: '#0b1c08',
                        boxShadow: '0 4px 18px rgba(160,112,16,0.28)',
                        transition: 'all 0.2s',
                      }}
                    >
                      {addingToCart
                        ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                        : <ShoppingCart style={{ width: 14, height: 14 }} />
                      }
                      <span>Add to Cart</span>
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* WhatsApp modal */}
        {showWaModal && (
          <WhatsAppOrderModal
            items={allSelectedItems.map((it) => ({
              productId: it.productId,
              variantSku: it.variantSku,
              variantName: it.variantName,
              name: it.name,
              quantity: it.quantity,
              price: it.price,
            }))}
            total={totalAmount}
            onClose={() => setShowWaModal(false)}
          />
        )}
      </div>
    </>
  );
}
