'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, Loader2, Minus, Plus, CheckCircle2, Package, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { Product } from '@/types';
import { WhatsAppOrderModal } from '@/components/ecommerce/whatsapp-order-modal';

// ─── Icons ────────────────────────────────────────────────────────────────────
function WaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="currentColor" />
      <path d="M12.004 2C6.478 2 2 6.478 2 12.004c0 1.77.46 3.435 1.268 4.888L2 22l5.265-1.383A9.96 9.96 0 0012.004 22C17.53 22 22 17.523 22 12.004 22 6.478 17.53 2 12.004 2zm0 18.18a8.163 8.163 0 01-4.148-1.132l-.297-.176-3.124.82.835-3.042-.193-.313A8.18 8.18 0 013.82 12.004c0-4.512 3.672-8.184 8.184-8.184 4.512 0 8.18 3.672 8.18 8.184 0 4.511-3.668 8.176-8.18 8.176z" fill="currentColor" />
    </svg>
  );
}

const fmt = (p: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p);

// ─── Slot-machine number ──────────────────────────────────────────────────────
function SlotNumber({ value }: { value: number }) {
  const prevRef = useRef(value);
  const dir = value > prevRef.current ? 1 : -1;
  useEffect(() => { prevRef.current = value; }, [value]);
  return (
    <div style={{ overflow: 'hidden', height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={value} initial={{ opacity: 0, y: dir * 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -dir * 14 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} style={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────
function Stepper({ qty, stock, onDecrement, onIncrement, size = 'md' }: {
  qty: number; stock: number; onDecrement: () => void; onIncrement: () => void; size?: 'sm' | 'md';
}) {
  const btnH = size === 'sm' ? 34 : 32;
  const iconS = 12;
  const numW  = size === 'sm' ? 34 : 32;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 3, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(11,28,8,0.10)', borderRadius: 14, boxShadow: '0 1px 4px rgba(11,28,8,0.06)' }}>
      <motion.button whileTap={{ scale: 0.9 }} onClick={onDecrement} disabled={qty === 0}
        style={{ width: btnH, height: btnH, borderRadius: 11, border: 'none', cursor: qty === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: qty > 0 ? 'rgba(160,112,16,0.10)' : 'transparent', color: qty === 0 ? 'rgba(11,28,8,0.18)' : '#7a5008', transition: 'all 0.15s', flexShrink: 0 }}>
        <Minus size={iconS} strokeWidth={2.5} />
      </motion.button>
      <div style={{ width: numW, textAlign: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, color: '#0b1c08' }}>
        <SlotNumber value={qty} />
      </div>
      <motion.button whileTap={{ scale: 0.9 }} onClick={onIncrement} disabled={qty >= stock}
        style={{ width: btnH, height: btnH, borderRadius: 11, border: 'none', cursor: qty >= stock ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: qty < stock ? '#0b1c08' : 'transparent', color: qty < stock ? '#fff' : 'rgba(11,28,8,0.18)', transition: 'all 0.15s', flexShrink: 0 }}>
        <Plus size={iconS} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}

// ─── Stock badge ─────────────────────────────────────────────────────────────
function StockBadge({ isOOS, isLow, stock }: { isOOS: boolean; isLow: boolean; stock: number }) {
  if (isOOS) return <span style={{ padding: '3px 9px', borderRadius: 100, background: 'rgba(220,38,38,0.08)', color: '#b91c1c', fontSize: 10, fontWeight: 600 }}>Out of Stock</span>;
  if (isLow) return (
    <div className="flex items-center gap-1.5">
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#d97706', animation: 'qo-pulse 2s ease-in-out infinite', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: '#92400e' }}>Only {stock} left</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: '#15803d' }}>In Stock</span>
    </div>
  );
}

// ─── How-it-works steps ───────────────────────────────────────────────────────
type StepIcon = { size?: number; style?: React.CSSProperties; className?: string };
const STEPS: Array<{ Icon: React.ComponentType<StepIcon>; num: string; title: string; desc: string }> = [
  { Icon: Package as React.ComponentType<StepIcon>,     num: '01', title: 'Pick products',     desc: 'Set quantities across our full catalogue in one place.' },
  { Icon: WaIcon,                                       num: '02', title: 'Send via WhatsApp', desc: 'We receive your exact order instantly on WhatsApp.' },
  { Icon: CheckCircle2 as React.ComponentType<StepIcon>, num: '03', title: 'Delivered to you', desc: 'Confirm details, pay & get fresh delivery at your door.' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function QuickOrderPage() {
  const { toast } = useToast();
  const addItem = useCartStore((s) => s.addItem);

  const [search,        setSearch]        = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [quantities,    setQuantities]    = useState<Record<string, number>>({});
  const [addingToCart,  setAddingToCart]  = useState(false);
  const [showWaModal,   setShowWaModal]   = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const { data: productsData, isLoading } = useQuery({
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
      const catId = typeof p.category === 'object' && p.category ? (p.category._id || '') : String(p.category || '');
      if (p.variants?.length > 0) {
        p.variants.forEach((v) => {
          if (!v.isActive) return;
          list.push({ id: `${p._id}-${v.sku}`, productId: p._id, product: p, name: p.name, slug: p.slug, variantName: v.name, variantSku: v.sku, sku: v.sku, price: v.price, compareAtPrice: v.compareAtPrice, stock: v.stock, image: (v.images && v.images.length > 0) ? v.images[0] : p.images[0], category: catId });
        });
      } else {
        list.push({ id: p._id, productId: p._id, product: p, name: p.name, slug: p.slug, sku: p.sku, price: p.price, compareAtPrice: p.compareAtPrice, stock: p.stock, image: p.images[0], category: catId });
      }
    });
    return list;
  }, [products]);

  const filteredRows = useMemo(() => catalogRows.filter((item) => {
    const q = search.toLowerCase();
    return (item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q) || (item.variantName?.toLowerCase().includes(q) ?? false)) && (activeCategory === 'all' || item.category === activeCategory);
  }), [catalogRows, search, activeCategory]);

  const allSelectedItems = useMemo(() => catalogRows.map((r) => ({ ...r, quantity: quantities[r.id] ?? 0 })).filter((i) => i.quantity > 0), [catalogRows, quantities]);
  const selectedCount = allSelectedItems.reduce((a, i) => a + i.quantity, 0);
  const totalAmount   = allSelectedItems.reduce((a, i) => a + i.price * i.quantity, 0);

  const handleQty = (id: string, delta: number, stock: number) => {
    const next = Math.max(0, (quantities[id] ?? 0) + delta);
    if (next > stock) { toast({ title: 'Insufficient Stock', description: `Only ${stock} in stock.`, variant: 'destructive' }); return; }
    setQuantities((prev) => ({ ...prev, [id]: next }));
  };

  const handleAddToCart = async () => {
    if (!allSelectedItems.length) return;
    setAddingToCart(true);
    try {
      for (const item of allSelectedItems) {
        await addItem({ productId: item.productId, name: item.name, slug: item.slug, image: item.image || '/images/products/placeholder.jpg', price: item.price, compareAtPrice: item.compareAtPrice, variantSku: item.variantSku, variantName: item.variantName, gstPercentage: item.product.gstPercentage ?? 5 }, item.quantity);
      }
      toast({ title: 'Added to cart!', description: `${selectedCount} items added.` });
      setQuantities({});
    } catch { toast({ title: 'Error', description: 'Failed to add items.', variant: 'destructive' }); }
    finally { setAddingToCart(false); }
  };

  const rowVars = {
    hidden: {},
    show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
  };
  const itemVar = {
    hidden: { opacity: 0, y: 14 },
    show:   { opacity: 1, y: 0, transition: { ease: [0.23, 1, 0.32, 1], duration: 0.42 } },
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes qo-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes qo-spin   { to { transform: rotate(360deg); } }
        .qo-hscroll { overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; -ms-overflow-style:none; }
        .qo-hscroll::-webkit-scrollbar { display:none; }
        .qo-card:hover .qo-img { transform: scale(1.05); }
      `}} />

      <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#f8f3ea 0%,#f2ece0 100%)', paddingBottom: selectedCount > 0 ? 'calc(env(safe-area-inset-bottom) + 136px)' : '64px', transition: 'padding-bottom 0.3s ease' }}>

        {/* ══════ HERO ══════ */}
        <div className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg,#040e02 0%,#0b2206 55%,#061504 100%)' }}>

          {/* Grain */}
          <div aria-hidden className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", opacity: 0.6, mixBlendMode: 'overlay' as const }} />
          {/* Amber glow top-left */}
          <div aria-hidden className="pointer-events-none absolute" style={{ top: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(160,112,16,0.18) 0%,transparent 65%)', filter: 'blur(60px)' }} />
          {/* Green glow bottom-right */}
          <div aria-hidden className="pointer-events-none absolute" style={{ bottom: '-30%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(37,211,102,0.10) 0%,transparent 65%)', filter: 'blur(70px)' }} />

          <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-14 sm:pb-20">

            {/* Eyebrow badge */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full" style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)', color: '#4ade80' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'qo-pulse 2s ease-in-out infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>WhatsApp Quick Order</span>
              </div>
            </motion.div>

            {/* Title */}
            <div className="text-center mb-5">
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
                className="font-display font-bold leading-[1.0] text-white"
                style={{ fontSize: 'clamp(2.4rem, 9vw, 5.5rem)', letterSpacing: '-0.02em' }}>
                Order in 60&nbsp;Seconds
              </motion.h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.6 }}
                className="font-display italic mt-3"
                style={{ fontSize: 'clamp(1rem, 2.6vw, 1.35rem)', color: 'rgba(255,255,255,0.40)' }}>
                Pick products · WhatsApp us · Get delivered
              </motion.p>
            </div>

            {/* Divider line */}
            <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1], delay: 0.3 }}
              style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(160,112,16,0.45),transparent)', margin: '0 auto 28px', width: '60%', maxWidth: 320, transformOrigin: 'center' }} />

            {/* How it works */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.6 }}
              className="grid grid-cols-3 gap-3 sm:gap-6 max-w-2xl mx-auto">
              {STEPS.map((step, i) => (
                <div key={i} className="text-center">
                  <div className="flex justify-center mb-2.5">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center" style={{ background: i === 1 ? 'rgba(37,211,102,0.15)' : 'rgba(160,112,16,0.12)', border: `1px solid ${i === 1 ? 'rgba(37,211,102,0.25)' : 'rgba(160,112,16,0.22)'}` }}>
                      <step.Icon size={i === 1 ? 18 : 16} style={{ color: i === 1 ? '#4ade80' : '#c8920a' }} />
                    </div>
                  </div>
                  <p style={{ fontSize: 'clamp(9px,2.2vw,11px)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.50)', marginBottom: 3 }}>
                    {step.num}
                  </p>
                  <p className="font-semibold text-white" style={{ fontSize: 'clamp(11px,2.8vw,13px)', lineHeight: 1.25 }}>
                    {step.title}
                  </p>
                  <p className="hidden sm:block mt-1" style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', lineHeight: 1.45 }}>
                    {step.desc}
                  </p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Bottom edge fade into page bg */}
          <div className="absolute bottom-0 inset-x-0 h-8" style={{ background: 'linear-gradient(to bottom,transparent,#f2ece0)' }} />
        </div>

        {/* ══════ CATALOG ══════ */}
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">

          {/* ── Filter bar ── */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-2xl overflow-hidden mb-5"
            style={{ background: 'rgba(255,253,248,0.92)', border: '1px solid rgba(160,112,16,0.12)', backdropFilter: 'blur(16px)', boxShadow: '0 4px 32px rgba(11,28,8,0.06),0 1px 0 rgba(255,255,255,0.7) inset' }}>

            {/* Search */}
            <div className="relative px-4 pt-3.5">
              <Search className="absolute left-7 top-1/2 -translate-y-[2px]" style={{ width: 14, height: 14, color: searchFocused ? '#a07010' : 'rgba(11,28,8,0.28)', transition: 'color 0.2s' }} />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-7 top-1/2 -translate-y-[2px] p-0.5 rounded-full" style={{ color: 'rgba(11,28,8,0.35)' }}>
                  <X size={13} />
                </button>
              )}
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                placeholder="Search products, SKU or variant…"
                className="w-full outline-none"
                style={{ padding: '10px 36px', fontSize: 13, background: 'rgba(11,28,8,0.03)', border: `1.5px solid ${searchFocused ? 'rgba(160,112,16,0.40)' : 'rgba(11,28,8,0.07)'}`, borderRadius: 12, color: '#0b1c08', transition: 'border-color 0.2s' }}
              />
            </div>

            {/* Category chips */}
            <div className="qo-hscroll px-4 py-3">
              <div className="flex gap-2" style={{ width: 'max-content' }}>
                {[{ _id: 'all', name: 'All' }, ...(categories ?? [])].map((cat) => {
                  const active = activeCategory === cat._id;
                  return (
                    <button key={cat._id} onClick={() => setActiveCategory(cat._id)}
                      className="rounded-full font-semibold transition-all duration-200 whitespace-nowrap"
                      style={{ padding: '6px 16px', fontSize: 12, color: active ? '#fff' : 'rgba(11,28,8,0.55)', background: active ? '#0b1c08' : 'rgba(11,28,8,0.05)', border: `1px solid ${active ? 'transparent' : 'rgba(11,28,8,0.08)'}`, boxShadow: active ? '0 2px 10px rgba(11,28,8,0.18)' : 'none', cursor: 'pointer', minHeight: 36 }}>
                      {cat._id === 'all' ? 'All products' : cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Count */}
          <AnimatePresence>
            {!isLoading && filteredRows.length > 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mb-3 px-1" style={{ fontSize: 11, color: 'rgba(11,28,8,0.35)', letterSpacing: '0.04em' }}>
                {filteredRows.length} {filteredRows.length === 1 ? 'product' : 'products'}
                {search && <> matching <strong style={{ color: '#a07010' }}>"{search}"</strong></>}
              </motion.p>
            )}
          </AnimatePresence>

          {/* ── Loading ── */}
          {isLoading && (
            <div className="py-32 flex flex-col items-center gap-4">
              <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(160,112,16,0.15)', borderTopColor: '#a07010', animation: 'qo-spin 1.2s linear infinite' }} />
              <p className="font-display italic" style={{ fontSize: 14, color: 'rgba(46,66,37,0.45)' }}>Loading catalogue…</p>
            </div>
          )}

          {/* ── Empty ── */}
          {!isLoading && filteredRows.length === 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="py-24 text-center rounded-2xl" style={{ border: '1.5px dashed rgba(160,112,16,0.20)', background: 'rgba(255,253,248,0.5)' }}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>🔍</p>
              <p className="font-semibold text-sm text-[#0b1c08] mb-1">No products found</p>
              <p className="text-xs text-[#2e4225]/45 max-w-xs mx-auto">Try a different search term or category.</p>
              {search && <button onClick={() => setSearch('')} className="mt-4 text-xs font-semibold underline" style={{ color: '#a07010' }}>Clear search</button>}
            </motion.div>
          )}

          {/* ══════ DESKTOP TABLE ══════ */}
          {!isLoading && filteredRows.length > 0 && (
            <>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className="hidden md:block rounded-2xl overflow-hidden mb-6"
                style={{ background: 'rgba(255,253,248,0.92)', border: '1px solid rgba(160,112,16,0.10)', backdropFilter: 'blur(16px)', boxShadow: '0 4px 40px rgba(11,28,8,0.05),0 1px 0 rgba(255,255,255,0.7) inset' }}>

                {/* Table header */}
                <div className="grid items-center px-6 py-3.5"
                  style={{ gridTemplateColumns: '1fr 100px 100px 148px 110px', borderBottom: '1px solid rgba(11,28,8,0.06)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(11,28,8,0.30)', fontWeight: 600 }}>
                  <span>Product</span>
                  <span>Stock</span>
                  <span style={{ textAlign: 'right' }}>Price</span>
                  <span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Subtotal</span>
                </div>

                <motion.div variants={rowVars} initial="hidden" animate="show">
                  {filteredRows.map((item, idx) => {
                    const qty = quantities[item.id] ?? 0;
                    const isOOS = item.stock <= 0;
                    const isLow = !isOOS && item.stock <= (item.product.lowStockThreshold ?? 5);
                    const isSelected = qty > 0;
                    return (
                      <motion.div key={item.id} variants={itemVar}
                        className="grid items-center px-6 py-3.5 group relative"
                        style={{ gridTemplateColumns: '1fr 100px 100px 148px 110px', borderBottom: idx < filteredRows.length - 1 ? '1px solid rgba(11,28,8,0.04)' : 'none', background: isSelected ? 'linear-gradient(90deg,rgba(160,112,16,0.055),rgba(160,112,16,0.02) 60%,transparent)' : 'transparent', transition: 'background 0.25s' }}>

                        {/* Selection stripe */}
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }} transition={{ duration: 0.22 }}
                              style={{ position: 'absolute', left: 0, top: '12%', bottom: '12%', width: 3, background: 'linear-gradient(180deg,#d4a820,#a07010)', borderRadius: '0 3px 3px 0', transformOrigin: 'center' }} />
                          )}
                        </AnimatePresence>

                        {/* Product */}
                        <div className="flex items-center gap-3.5 min-w-0">
                          <Link href={`/products/${item.slug}`}
                            className="relative shrink-0 overflow-hidden rounded-xl qo-card"
                            style={{ width: 72, height: 72, border: `1.5px solid ${isSelected ? 'rgba(160,112,16,0.22)' : 'rgba(11,28,8,0.07)'}`, background: '#faf6ee', transition: 'border-color 0.25s,box-shadow 0.25s', boxShadow: isSelected ? '0 4px 14px rgba(160,112,16,0.14)' : '0 1px 4px rgba(11,28,8,0.05)' }}>
                            {item.image
                              ? <div className="absolute inset-[8%] overflow-hidden"><Image src={item.image} alt={item.name} fill className="object-contain qo-img" style={{ transition: 'transform 0.4s ease' }} /></div>
                              : <div className="absolute inset-0 flex items-center justify-center font-display font-black text-amber-800/20 text-2xl">{item.name.charAt(0)}</div>}
                          </Link>
                          <div className="min-w-0">
                            <Link href={`/products/${item.slug}`} className="font-semibold text-[13.5px] text-[#0b1c08] hover:text-[#a07010] transition-colors block truncate max-w-[200px]">{item.name}</Link>
                            {item.variantName && (
                              <span className="inline-block mt-0.5" style={{ padding: '2px 8px', borderRadius: 100, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(160,112,16,0.08)', color: '#92680a', border: '1px solid rgba(160,112,16,0.15)', fontWeight: 700 }}>
                                {item.variantName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stock */}
                        <StockBadge isOOS={isOOS} isLow={isLow} stock={item.stock} />

                        {/* Price */}
                        <div style={{ textAlign: 'right' }}>
                          <span className="font-bold text-sm text-[#0b1c08]">{fmt(item.price)}</span>
                          {item.compareAtPrice && item.compareAtPrice > item.price && (
                            <span className="block" style={{ fontSize: 10, textDecoration: 'line-through', color: 'rgba(11,28,8,0.28)', marginTop: 1 }}>{fmt(item.compareAtPrice)}</span>
                          )}
                        </div>

                        {/* Qty */}
                        <div className="flex justify-center">
                          {isOOS
                            ? <span style={{ fontSize: 10, color: '#b91c1c', fontWeight: 500 }}>—</span>
                            : <Stepper qty={qty} stock={item.stock} onDecrement={() => handleQty(item.id, -1, item.stock)} onIncrement={() => handleQty(item.id, 1, item.stock)} />
                          }
                        </div>

                        {/* Subtotal */}
                        <div style={{ textAlign: 'right' }}>
                          <AnimatePresence mode="wait" initial={false}>
                            {qty > 0
                              ? <motion.span key="amt" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="font-black text-sm" style={{ color: '#a07010' }}>{fmt(item.price * qty)}</motion.span>
                              : <motion.span key="dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'rgba(11,28,8,0.16)', fontSize: 14 }}>—</motion.span>
                            }
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </motion.div>

              {/* ══════ MOBILE CARDS ══════ */}
              <motion.div className="md:hidden space-y-3" variants={rowVars} initial="hidden" animate="show">
                {filteredRows.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  const isOOS = item.stock <= 0;
                  const isLow = !isOOS && item.stock <= (item.product.lowStockThreshold ?? 5);
                  const isSelected = qty > 0;
                  const discount = item.compareAtPrice && item.compareAtPrice > item.price
                    ? Math.round((1 - item.price / item.compareAtPrice) * 100) : null;

                  return (
                    <motion.div key={item.id} variants={itemVar}
                      style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: isSelected ? 'rgba(255,252,244,0.98)' : 'rgba(255,253,248,0.80)', border: `1.5px solid ${isSelected ? 'rgba(160,112,16,0.24)' : 'rgba(11,28,8,0.07)'}`, backdropFilter: 'blur(12px)', boxShadow: isSelected ? '0 8px 32px rgba(160,112,16,0.12)' : '0 1px 8px rgba(11,28,8,0.05)', transition: 'border-color 0.25s,box-shadow 0.25s,background 0.25s' }}>

                      {/* Selection stripe */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }} transition={{ duration: 0.22 }}
                            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3.5, background: 'linear-gradient(180deg,#e8c84a,#a07010)', transformOrigin: 'center' }} />
                        )}
                      </AnimatePresence>

                      <div className="flex gap-3.5 p-4">
                        {/* Image */}
                        <Link href={`/products/${item.slug}`}
                          className="relative shrink-0 overflow-hidden"
                          style={{ width: 90, height: 90, borderRadius: 14, background: '#faf6ee', border: `1.5px solid ${isSelected ? 'rgba(160,112,16,0.20)' : 'rgba(11,28,8,0.07)'}`, boxShadow: isSelected ? '0 4px 16px rgba(160,112,16,0.12)' : '0 1px 4px rgba(11,28,8,0.06)', flexShrink: 0 }}>
                          {item.image
                            ? <div className="absolute inset-[8%]"><Image src={item.image} alt={item.name} fill className="object-contain" /></div>
                            : <div className="absolute inset-0 flex items-center justify-center text-amber-800/20 font-display font-black text-2xl">{item.name.charAt(0)}</div>}
                          {discount && (
                            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-white font-bold" style={{ fontSize: 8, background: '#dc2626', letterSpacing: '0.04em' }}>
                              -{discount}%
                            </div>
                          )}
                        </Link>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <Link href={`/products/${item.slug}`} className="font-semibold text-[#0b1c08] hover:text-[#a07010] transition-colors" style={{ fontSize: 13.5, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {item.name}
                          </Link>

                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {item.variantName && (
                              <span style={{ padding: '2px 8px', borderRadius: 100, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(160,112,16,0.08)', color: '#92680a', border: '1px solid rgba(160,112,16,0.15)', fontWeight: 700 }}>
                                {item.variantName}
                              </span>
                            )}
                            <StockBadge isOOS={isOOS} isLow={isLow} stock={item.stock} />
                          </div>

                          <div className="flex items-baseline gap-2 mt-2">
                            <span className="font-bold text-[#0b1c08]" style={{ fontSize: 16 }}>{fmt(item.price)}</span>
                            {item.compareAtPrice && item.compareAtPrice > item.price && (
                              <span style={{ fontSize: 11, textDecoration: 'line-through', color: 'rgba(11,28,8,0.30)' }}>{fmt(item.compareAtPrice)}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom action row */}
                      <div className="flex items-center justify-between mx-4 mb-4 mt-1 pt-3" style={{ borderTop: '1px solid rgba(11,28,8,0.06)' }}>
                        <AnimatePresence>
                          {qty > 0
                            ? <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(11,28,8,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total </span>
                                <span className="font-black" style={{ fontSize: 14, color: '#a07010' }}>{fmt(item.price * qty)}</span>
                              </motion.div>
                            : <span style={{ fontSize: 11, color: 'rgba(11,28,8,0.28)' }}>Set quantity →</span>
                          }
                        </AnimatePresence>
                        {isOOS
                          ? <span style={{ padding: '6px 14px', borderRadius: 100, background: 'rgba(220,38,38,0.07)', color: '#b91c1c', fontSize: 10, fontWeight: 600 }}>Out of stock</span>
                          : <Stepper qty={qty} stock={item.stock} size="sm" onDecrement={() => handleQty(item.id, -1, item.stock)} onIncrement={() => handleQty(item.id, 1, item.stock)} />
                        }
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>

              {/* Bottom nudge */}
              {filteredRows.length > 4 && selectedCount === 0 && (
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                  className="text-center mt-8 mb-2" style={{ fontSize: 12, color: 'rgba(11,28,8,0.30)', fontStyle: 'italic' }}>
                  Add quantities above · then tap WhatsApp or Add to Cart
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* ══════ STICKY CHECKOUT BAR ══════ */}
        <AnimatePresence>
          {selectedCount > 0 && (
            <motion.div initial={{ opacity: 0, y: 96 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 96 }}
              transition={{ type: 'spring', stiffness: 440, damping: 34 }}
              className="fixed bottom-0 inset-x-0 z-50"
              style={{ background: 'rgba(6,18,4,0.98)', borderTop: '1px solid rgba(255,255,255,0.04)', backdropFilter: 'blur(28px)', boxShadow: '0 -28px 70px rgba(0,0,0,0.35)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

              {/* Gold top edge */}
              <div style={{ height: 1.5, background: 'linear-gradient(90deg,transparent,rgba(212,168,32,0.6),transparent)' }} />

              <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
                <div className="flex items-center justify-between gap-4">

                  {/* Summary */}
                  <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                    <div className="shrink-0">
                      <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 3 }}>Items</p>
                      <div className="flex items-center gap-1.5">
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', animation: 'qo-pulse 2s ease-in-out infinite' }} />
                        <span className="font-semibold text-white" style={{ fontSize: 13 }}>{selectedCount} item{selectedCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
                    <div className="min-w-0">
                      <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 2 }}>Subtotal</p>
                      <p className="font-display font-bold" style={{ fontSize: 'clamp(17px,4vw,22px)', letterSpacing: '-0.01em', background: 'linear-gradient(135deg,#f0d060,#c8920a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1 }}>
                        {fmt(totalAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => setShowWaModal(true)}
                      className="inline-flex items-center justify-center gap-2 font-bold"
                      style={{ padding: '11px clamp(12px,3vw,20px)', borderRadius: 13, fontSize: 'clamp(11px,3vw,13px)', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#25d366,#1aab54)', color: '#fff', boxShadow: '0 4px 20px rgba(37,211,102,0.30)' }}>
                      <WaIcon size={15} />
                      <span className="hidden xs:inline sm:inline">WhatsApp</span>
                    </motion.button>

                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} disabled={addingToCart} onClick={handleAddToCart}
                      className="inline-flex items-center justify-center gap-2 font-bold"
                      style={{ padding: '11px clamp(12px,3vw,20px)', borderRadius: 13, fontSize: 'clamp(11px,3vw,13px)', border: 'none', cursor: addingToCart ? 'default' : 'pointer', background: addingToCart ? 'rgba(212,168,32,0.4)' : 'linear-gradient(135deg,#f0d060,#c8920a)', color: '#0b1c08', boxShadow: '0 4px 20px rgba(160,112,16,0.28)', transition: 'background 0.2s' }}>
                      {addingToCart
                        ? <Loader2 style={{ width: 14, height: 14, animation: 'qo-spin 1s linear infinite' }} />
                        : <ShoppingCart style={{ width: 14, height: 14 }} />
                      }
                      <span>{addingToCart ? 'Adding…' : 'Add to Cart'}</span>
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* WA modal */}
        {showWaModal && (
          <WhatsAppOrderModal
            items={allSelectedItems.map((it) => ({ productId: it.productId, variantSku: it.variantSku, variantName: it.variantName, name: it.name, quantity: it.quantity, price: it.price }))}
            total={totalAmount}
            onClose={() => setShowWaModal(false)}
          />
        )}
      </div>
    </>
  );
}
