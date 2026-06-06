'use client';

import { useMemo, useState, useRef, type MouseEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PremiumProductCard } from '@/components/ecommerce/premium-product-card';
import { QuickViewModal } from '@/components/ecommerce/quick-view-modal';
import { Product, Category } from '@/types';
import { api } from '@/lib/api';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Magnetic } from '@/components/ui/magnetic';

const WOOD_PRESSED_SLUGS  = new Set(['wood-pressed-oils', 'wood-pressed-oil', 'cold-pressed-oils', 'cold-pressed-oil']);
const BILONA_GHEE_SLUGS   = new Set(['bilona-ghee', 'bilona-cow-ghee', 'a2-bilona-ghee', 'ghee']);
const FLOURS_PULSES_SLUGS = new Set(['flours-and-pulses', 'flours-pulses', 'flour-and-pulses', 'flour-pulses', 'flours', 'pulses', 'atta', 'dal']);
const SPICES_SLUGS        = new Set(['spices', 'spice', 'masale', 'indian-spices', 'masala']);
const SWEETENER_SLUGS     = new Set(['natural-sweetener', 'natural-sweeteners', 'sweeteners', 'sweetener', 'jaggery', 'honey', 'mishri']);

// ─── 3D Tilt Card ─────────────────────────────────────────────────────────────

function TiltCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r  = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width  - 0.5;
    const py = (e.clientY - r.top)  / r.height - 0.5;
    el.style.transform = `perspective(1100px) rotateX(${-py * 8}deg) rotateY(${px * 8}deg) translateZ(12px)`;
    el.style.setProperty('--glare-x', `${(px + 0.5) * 100}%`);
    el.style.setProperty('--glare-y', `${(py + 0.5) * 100}%`);
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="nl-tilt-card relative flex flex-col min-w-0"
    >
      {children}
      {/* Forest-green glare overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 [.nl-tilt-card:hover_&]:opacity-100"
        style={{
          background: 'radial-gradient(380px circle at var(--glare-x,50%) var(--glare-y,50%), rgba(26,82,16,0.12), transparent 55%)',
          mixBlendMode: 'overlay',
          borderRadius: 'inherit',
        }}
      />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PillKey = 'best' | 'new' | 'under499' | 'deals';

const PILLS: { key: PillKey; label: string }[] = [
  { key: 'best',     label: 'Best Sellers' },
  { key: 'new',      label: 'New Arrivals' },
  { key: 'under499', label: 'Under ₹499'   },
  { key: 'deals',    label: 'Deals'        },
];

function getCategoryId(cat: Category | string): string | null {
  return typeof cat === 'string' ? cat : (cat._id ?? null);
}

function sortByPill(products: Product[], pill: PillKey): Product[] {
  switch (pill) {
    case 'best':     return [...products].sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0));
    case 'new':      return [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case 'under499': return products.filter((p) => p.price <= 499);
    case 'deals':    return products.filter((p) => p.compareAtPrice != null && p.compareAtPrice > p.price);
    default:         return products;
  }
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface HomeShopSectionProps {
  products: Product[];
  categories?: Category[];
}

const PAGE_SIZE = 10;
const INITIAL   = 15;

export default function HomeShopSection({ products, categories = [] }: HomeShopSectionProps) {
  // Drop any category or product whose populated category object has a null _id
  // (happens when a category document is deleted but the reference lingers).
  const safeCategories = useMemo(() => categories.filter((c) => c._id != null), [categories]);
  const safeProducts   = useMemo(() => products.filter((p) => {
    if (typeof p.category === 'string') return true;
    return (p.category as Category | null)?._id != null;
  }), [products]);

  const [selectedCatId,    setSelectedCatId]    = useState<string | null>(null);
  const [selectedPill,     setSelectedPill]     = useState<PillKey>('best');
  const [visibleCount,     setVisibleCount]     = useState(INITIAL);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  const { data: categoryData, isLoading: catLoading } = useQuery({
    queryKey: ['home-category-products', selectedCatId],
    queryFn: () => api.getProducts({ category: selectedCatId!, limit: 100, sortBy: 'totalSold', sortOrder: 'desc' }),
    enabled: !!selectedCatId,
    staleTime: 60_000,
  });

  const allFiltered = useMemo(() => {
    const base = selectedCatId
      ? (categoryData?.items ?? [])
      : safeProducts;
    return sortByPill(base, selectedPill);
  }, [safeProducts, selectedCatId, categoryData, selectedPill]);

  const filtered = useMemo(() => allFiltered.slice(0, visibleCount), [allFiltered, visibleCount]);

  const hasMore = visibleCount < allFiltered.length;

  // Reset visible count whenever filter/pill changes
  const handleCatChange = (id: string | null) => { setSelectedCatId(id); setVisibleCount(INITIAL); };
  const handlePillChange = (key: PillKey) => { setSelectedPill(key); setVisibleCount(INITIAL); };

  if (safeProducts.length === 0) return null;

  const activePool    = selectedCatId ? (categoryData?.items ?? []) : safeProducts;
  const under499Count = activePool.filter((p) => p.price <= 499).length;
  const dealsCount    = activePool.filter((p) => p.compareAtPrice != null && p.compareAtPrice > p.price).length;

  return (
    <section className="relative py-6 sm:py-10" style={{ background: '#f2ece0' }}>

      {/* Subtle top transition from dark hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 inset-x-0 h-16"
        style={{ background: 'linear-gradient(to bottom, rgba(8,31,4,0.06), transparent)' }}
      />

      <div className="relative max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6">

        {/* ── Section header ──────────────────────────────────── */}
        <ScrollReveal className="text-center mb-4">
          <p style={{
            fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase',
            color: '#a07010', fontFamily: 'monospace', marginBottom: 6,
          }}>
            Curated for you
          </p>
          <h2
            className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold"
            style={{ color: '#0b1c08', letterSpacing: '-0.02em' }}
          >
            Shop Our Collection
          </h2>
          <div style={{ width: 48, height: 2.5, background: 'linear-gradient(90deg,#1a5210,#a07010)', margin: '8px auto 0', borderRadius: 2 }} />
        </ScrollReveal>

        {/* ── Category chips ──────────────────────────────────── */}
        {safeCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2 mb-2 justify-start sm:justify-center">
            <button
              onClick={() => handleCatChange(null)}
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200"
              style={!selectedCatId
                ? { background: '#1a5210', color: '#fff', boxShadow: '0 2px 12px -2px rgba(26,82,16,0.40)' }
                : { background: '#fff', color: '#2e4225', border: '1.5px solid rgba(26,82,16,0.14)' }
              }
            >
              All Products
            </button>
            {safeCategories.map((cat) => {
              const active = selectedCatId === cat._id;
              if (WOOD_PRESSED_SLUGS.has(cat.slug)) {
                return (
                  <button
                    key={cat._id}
                    onClick={() => handleCatChange(active ? null : cat._id)}
                    className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2.5 px-3 sm:pr-5 sm:pl-2 py-2 rounded-2xl text-sm font-semibold transition-all duration-200"
                    style={active
                      ? { background: '#78340f', color: '#fef3c7', boxShadow: '0 4px 18px -3px rgba(120,52,15,0.55)', border: '1.5px solid rgba(251,191,36,0.45)' }
                      : { background: '#fffbf5', color: '#78340f', border: '1.5px solid rgba(120,52,15,0.22)', boxShadow: '0 2px 8px -2px rgba(120,52,15,0.10)' }
                    }
                  >
                    <span className="hidden sm:flex items-center -space-x-2 flex-shrink-0">
                      <span className="relative w-9 h-9 rounded-xl overflow-hidden ring-2 ring-white flex-shrink-0" style={{ background: '#451a03' }}>
                        <Image src="/images/wood-press-machine.png" alt="Ghani machine" fill className="object-cover object-center" sizes="36px" />
                      </span>
                      <span className="relative w-9 h-9 rounded-xl overflow-hidden ring-2 ring-white flex-shrink-0" style={{ background: '#451a03' }}>
                        <Image src="/images/wood-pressed-oil-bottle.png" alt="Wood pressed oil" fill className="object-cover object-center" sizes="36px" />
                      </span>
                    </span>
                    <span className="sm:hidden text-base">🫙</span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-sm font-bold">{cat.name.trim()}</span>
                      <span className="hidden sm:block text-[10px] font-medium opacity-60 tracking-wide">Pure · Natural</span>
                    </span>
                  </button>
                );
              }
              if (BILONA_GHEE_SLUGS.has(cat.slug)) {
                return (
                  <button
                    key={cat._id}
                    onClick={() => handleCatChange(active ? null : cat._id)}
                    className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2.5 px-3 sm:pr-5 sm:pl-2 py-2 rounded-2xl text-sm font-semibold transition-all duration-200"
                    style={active
                      ? { background: '#7c2d12', color: '#fef3c7', boxShadow: '0 4px 18px -3px rgba(124,45,18,0.55)', border: '1.5px solid rgba(251,191,36,0.45)' }
                      : { background: '#fffaf0', color: '#7c2d12', border: '1.5px solid rgba(124,45,18,0.22)', boxShadow: '0 2px 8px -2px rgba(124,45,18,0.10)' }
                    }
                  >
                    <span className="hidden sm:block relative w-9 h-9 rounded-xl overflow-hidden ring-2 ring-white flex-shrink-0" style={{ background: '#7c2d12' }}>
                      <Image src="/images/bilona-method.png" alt="Bilona method" fill className="object-cover object-left" sizes="36px" />
                    </span>
                    <span className="sm:hidden text-base">🧈</span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-sm font-bold">{cat.name.trim()}</span>
                      <span className="hidden sm:block text-[10px] font-medium opacity-60 tracking-wide">Hand-Churned · A2</span>
                    </span>
                  </button>
                );
              }
              if (FLOURS_PULSES_SLUGS.has(cat.slug)) {
                return (
                  <button
                    key={cat._id}
                    onClick={() => handleCatChange(active ? null : cat._id)}
                    className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2.5 px-3 sm:pr-5 sm:pl-2 py-2 rounded-2xl text-sm font-semibold transition-all duration-200"
                    style={active
                      ? { background: '#78400a', color: '#fef3c7', boxShadow: '0 4px 18px -3px rgba(120,64,10,0.55)', border: '1.5px solid rgba(251,191,36,0.45)' }
                      : { background: '#fffbf0', color: '#78400a', border: '1.5px solid rgba(120,64,10,0.20)', boxShadow: '0 2px 8px -2px rgba(120,64,10,0.10)' }
                    }
                  >
                    <span className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ring-2 ring-white" style={{ background: active ? 'rgba(255,255,255,0.15)' : '#fef3c7', fontSize: 20 }}>🌾</span>
                    <span className="sm:hidden text-base">🌾</span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-sm font-bold">{cat.name.trim()}</span>
                      <span className="hidden sm:block text-[10px] font-medium opacity-60 tracking-wide">Stone-ground · Pure</span>
                    </span>
                  </button>
                );
              }
              if (SPICES_SLUGS.has(cat.slug)) {
                return (
                  <button
                    key={cat._id}
                    onClick={() => handleCatChange(active ? null : cat._id)}
                    className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2.5 px-3 sm:pr-5 sm:pl-2 py-2 rounded-2xl text-sm font-semibold transition-all duration-200"
                    style={active
                      ? { background: '#7f1d1d', color: '#fef2f2', boxShadow: '0 4px 18px -3px rgba(127,29,29,0.55)', border: '1.5px solid rgba(254,202,202,0.45)' }
                      : { background: '#fff5f5', color: '#7f1d1d', border: '1.5px solid rgba(127,29,29,0.18)', boxShadow: '0 2px 8px -2px rgba(127,29,29,0.10)' }
                    }
                  >
                    <span className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ring-2 ring-white" style={{ background: active ? 'rgba(255,255,255,0.15)' : '#fee2e2', fontSize: 20 }}>🌶️</span>
                    <span className="sm:hidden text-base">🌶️</span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-sm font-bold">{cat.name.trim()}</span>
                      <span className="hidden sm:block text-[10px] font-medium opacity-60 tracking-wide">Farm Fresh · Aromatic</span>
                    </span>
                  </button>
                );
              }
              if (SWEETENER_SLUGS.has(cat.slug)) {
                return (
                  <button
                    key={cat._id}
                    onClick={() => handleCatChange(active ? null : cat._id)}
                    className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2.5 px-3 sm:pr-5 sm:pl-2 py-2 rounded-2xl text-sm font-semibold transition-all duration-200"
                    style={active
                      ? { background: '#92400e', color: '#fffbeb', boxShadow: '0 4px 18px -3px rgba(146,64,14,0.55)', border: '1.5px solid rgba(253,230,138,0.45)' }
                      : { background: '#fffbeb', color: '#92400e', border: '1.5px solid rgba(146,64,14,0.18)', boxShadow: '0 2px 8px -2px rgba(146,64,14,0.10)' }
                    }
                  >
                    <span className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ring-2 ring-white" style={{ background: active ? 'rgba(255,255,255,0.15)' : '#fef3c7', fontSize: 20 }}>🍯</span>
                    <span className="sm:hidden text-base">🍯</span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-sm font-bold">{cat.name.trim()}</span>
                      <span className="hidden sm:block text-[10px] font-medium opacity-60 tracking-wide">Raw · Unrefined</span>
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={cat._id}
                  onClick={() => handleCatChange(active ? null : cat._id)}
                  className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200"
                  style={active
                    ? { background: '#1a5210', color: '#fff', boxShadow: '0 2px 12px -2px rgba(26,82,16,0.40)' }
                    : { background: '#fff', color: '#2e4225', border: '1.5px solid rgba(26,82,16,0.14)' }
                  }
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Sort pills ──────────────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {PILLS.map(({ key, label }) => {
            const badge = key === 'under499' ? under499Count : key === 'deals' ? dealsCount : null;
            const isActive = selectedPill === key;
            return (
              <button
                key={key}
                onClick={() => handlePillChange(key)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200"
                style={isActive
                  ? { background: '#0d2c07', color: '#fff', boxShadow: '0 2px 10px -2px rgba(13,44,7,0.35)' }
                  : { background: 'rgba(255,255,255,0.70)', color: '#2e4225', border: '1.5px solid rgba(26,82,16,0.12)' }
                }
              >
                {label}
                {badge !== null && badge > 0 && (
                  <span className="ml-1.5 text-xs opacity-65">({badge})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Product grid ─────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {catLoading ? (
            <motion.div
              key="skeleton"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              {[...Array(5)].map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden bg-white animate-pulse">
                  <div className="aspect-[4/3] bg-gradient-to-br from-amber-50 to-amber-100/60" />
                  <div className="p-3 space-y-2">
                    <div className="h-2.5 bg-amber-100 rounded w-16" />
                    <div className="h-4 bg-amber-100 rounded w-3/4" />
                    <div className="h-5 bg-amber-100 rounded w-1/3 mt-2" />
                  </div>
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key={`${selectedCatId ?? 'all'}-${selectedPill}`}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28 }}
            >
              {filtered.length > 0 ? (
                filtered.map((product, index) => (
                  <TiltCard key={product._id}>
                    <PremiumProductCard
                      product={product}
                      index={index}
                      showMostPopular={index === 0 && selectedPill === 'best' && !selectedCatId}
                      compact
                      onQuickView={product.variants?.length > 0 ? setQuickViewProduct : undefined}
                    />
                  </TiltCard>
                ))
              ) : (
                <div className="col-span-full text-center py-12 text-sm" style={{ color: 'rgba(46,66,37,0.50)' }}>
                  No products found in this category.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Show more + View all ──────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          {hasMore && (
            <motion.button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-semibold text-sm transition-all duration-200"
              style={{ background: '#1a5210', color: '#fff', boxShadow: '0 2px 14px -3px rgba(26,82,16,0.38)' }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#0d2c07'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#1a5210'; }}
            >
              Show More
              <span style={{ fontSize: 11, opacity: 0.70 }}>
                ({Math.min(PAGE_SIZE, allFiltered.length - visibleCount)} more)
              </span>
            </motion.button>
          )}
          <Magnetic strength={0.25}>
            <Link
              href="/products"
              data-cursor="VIEW"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5"
              style={{ border: '2px solid rgba(26,82,16,0.22)', color: '#1a5210', background: 'transparent' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#1a5210';
                (e.currentTarget as HTMLElement).style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = '#1a5210';
              }}
            >
              View All Products
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Magnetic>
        </div>
      </div>

      <QuickViewModal
        product={quickViewProduct}
        isOpen={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
    </section>
  );
}
