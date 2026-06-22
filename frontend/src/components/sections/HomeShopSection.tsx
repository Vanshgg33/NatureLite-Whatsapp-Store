'use client';

import { useMemo, useState, useRef, type MouseEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PremiumProductCard } from '@/components/ecommerce/premium-product-card';
import { QuickViewModal } from '@/components/ecommerce/quick-view-modal';
import { Product, Category } from '@/types';
import { api } from '@/lib/api';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Magnetic } from '@/components/ui/magnetic';

// ─── Category image carousel ──────────────────────────────────────────────────

const CAT_PALETTES = [
  { bg: 'linear-gradient(145deg,#fef3e2,#fde5b8)', ring: '#f59e0b' },
  { bg: 'linear-gradient(145deg,#e8f5e2,#c8e6c0)', ring: '#22c55e' },
  { bg: 'linear-gradient(145deg,#fce8e8,#fbc8c8)', ring: '#ef4444' },
  { bg: 'linear-gradient(145deg,#e8f0fe,#c5d5fb)', ring: '#6366f1' },
  { bg: 'linear-gradient(145deg,#fef9e2,#fdf0b0)', ring: '#eab308' },
  { bg: 'linear-gradient(145deg,#fce8f4,#f9c6e8)', ring: '#ec4899' },
  { bg: 'linear-gradient(145deg,#e2f6fe,#b8e8fb)', ring: '#0ea5e9' },
  { bg: 'linear-gradient(145deg,#f0fce8,#d4f5c0)', ring: '#84cc16' },
];

function CategoryCarousel({
  categories,
  selectedCatId,
  onSelect,
}: {
  categories: Category[];
  selectedCatId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    rowRef.current?.scrollBy({ left: dir === 'left' ? -340 : 340, behavior: 'smooth' });
  };

  return (
    <div className="relative mb-8">
      {/* Left fade */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10"
        style={{ background: 'linear-gradient(to right,#f2ece0 30%,transparent)' }} />
      {/* Right fade */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10"
        style={{ background: 'linear-gradient(to left,#f2ece0 30%,transparent)' }} />

      {/* Left arrow */}
      <button
        onClick={() => scroll('left')}
        aria-label="Scroll left"
        className="absolute left-1 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 hover:scale-110 active:scale-95 top-[55px]"
        style={{
          background: '#fff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
          color: '#1a3a14',
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
      </button>

      {/* Scrollable track */}
      <div
        ref={rowRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto px-8 py-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {/* ALL tile */}
        <button
          onClick={() => onSelect(null)}
          className="flex-shrink-0 flex flex-col items-center gap-2.5 group outline-none"
        >
          <div
            className="relative flex items-center justify-center transition-all duration-200 group-hover:-translate-y-2"
            style={{
              width: 100, height: 100, borderRadius: 24,
              background: !selectedCatId
                ? 'linear-gradient(145deg,#1a5210,#2d7a1e)'
                : '#fff',
              boxShadow: !selectedCatId
                ? '0 8px 28px rgba(26,82,16,0.40), 0 2px 6px rgba(26,82,16,0.20)'
                : '0 4px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
              border: !selectedCatId ? 'none' : '1.5px solid rgba(0,0,0,0.07)',
            }}
          >
            <span style={{ fontSize: 40, lineHeight: 1, filter: !selectedCatId ? 'brightness(1.2)' : 'none' }}>🛒</span>
          </div>
          <span style={{
            fontSize: 12.5, fontWeight: !selectedCatId ? 700 : 500,
            color: !selectedCatId ? '#1a5210' : '#3d3d3d',
            letterSpacing: '-0.01em', lineHeight: 1,
          }}>
            All
          </span>
        </button>

        {/* Category tiles */}
        {categories.map((cat, idx) => {
          const active = selectedCatId === cat._id;
          const palette = CAT_PALETTES[idx % CAT_PALETTES.length];
          return (
            <button
              key={cat._id}
              onClick={() => onSelect(active ? null : cat._id)}
              className="flex-shrink-0 flex flex-col items-center gap-2.5 group outline-none"
            >
              {/* Image card */}
              <div
                className="relative overflow-hidden transition-all duration-200 group-hover:-translate-y-2"
                style={{
                  width: 100, height: 100, borderRadius: 24,
                  background: cat.image ? 'transparent' : palette.bg,
                  boxShadow: active
                    ? `0 8px 28px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10), 0 0 0 3px ${palette.ring}`
                    : '0 4px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
                  border: active ? 'none' : '1.5px solid rgba(0,0,0,0.07)',
                }}
              >
                {cat.image ? (
                  <>
                    {/* Warm bg behind image */}
                    <div className="absolute inset-0" style={{ background: palette.bg }} />
                    <Image
                      src={cat.image}
                      alt={cat.name}
                      fill
                      className="object-cover transition-transform duration-400 group-hover:scale-[1.08]"
                      sizes="100px"
                    />
                    {/* Subtle bottom gradient so name pops if ever overlaid */}
                    <div className="absolute inset-x-0 bottom-0 h-8 pointer-events-none"
                      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.12), transparent)' }} />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 36 }}>
                    🏪
                  </div>
                )}

                {/* Active checkmark badge */}
                {active && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: palette.ring, boxShadow: '0 1px 4px rgba(0,0,0,0.20)' }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Name */}
              <span style={{
                fontSize: 12.5, fontWeight: active ? 700 : 500,
                color: active ? '#111' : '#3d3d3d',
                textAlign: 'center', lineHeight: 1.25,
                maxWidth: 104, letterSpacing: '-0.01em',
              }}>
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scroll('right')}
        aria-label="Scroll right"
        className="absolute right-1 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 hover:scale-110 active:scale-95 top-[55px]"
        style={{
          background: '#fff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
          color: '#1a3a14',
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
      </button>

      <style>{`[ref] ::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

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
  const [quickViewVariantSku, setQuickViewVariantSku] = useState<string | undefined>(undefined);

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

        {/* ── Category image carousel ──────────────────────────── */}
        {safeCategories.length > 0 && (
          <CategoryCarousel
            categories={safeCategories}
            selectedCatId={selectedCatId}
            onSelect={handleCatChange}
          />
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
                className="px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200"
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
                      onQuickView={product.variants?.length > 0 ? (p, sku) => { setQuickViewProduct(p); setQuickViewVariantSku(sku); } : undefined}
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
        initialVariantSku={quickViewVariantSku}
        onClose={() => { setQuickViewProduct(null); setQuickViewVariantSku(undefined); }}
      />
    </section>
  );
}
