'use client';

import { useState, useRef, type MouseEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronDown, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { PremiumProductCard } from '@/components/ecommerce/premium-product-card';
import BilonaSideDecor from '@/components/ecommerce/BilonaSideDecor';
import { api } from '@/lib/api';
import { Product, Category } from '@/types';
import { cn } from '@/lib/utils';

type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'popular';

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'newest',     label: 'Newest first'        },
  { value: 'popular',   label: 'Most popular'         },
  { value: 'price-asc', label: 'Price: Low → High'    },
  { value: 'price-desc', label: 'Price: High → Low'   },
];

// ─── TiltCard (same pattern as HomeShopSection) ───────────────────────────────

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
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 [.nl-tilt-card:hover_&]:opacity-100"
        style={{
          background: 'radial-gradient(360px circle at var(--glare-x,50%) var(--glare-y,50%), rgba(212,165,116,0.18), transparent 55%)',
          mixBlendMode: 'overlay',
          borderRadius: 'inherit',
        }}
      />
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white animate-pulse">
      <div className="aspect-[4/3] bg-gradient-to-br from-amber-50 to-amber-100/60" />
      <div className="p-3 space-y-2">
        <div className="h-2.5 bg-amber-100 rounded w-16" />
        <div className="h-4 bg-amber-100 rounded w-3/4" />
        <div className="h-3.5 bg-amber-100 rounded w-1/2" />
        <div className="h-5 bg-amber-100 rounded w-1/3 mt-2" />
      </div>
    </div>
  );
}

// ─── Category tagline helper ──────────────────────────────────────────────────

function getCategoryTagline(name: string): string {
  if (/ghee|bilona/i.test(name))              return 'Traditional A2 Bilona · Wooden-churned · Slow-heated to gold';
  if (/wood.?pressed|pressed.?oil/i.test(name)) return 'Cold-pressed in stone ghani · Zero heat · Full nutrition';
  return 'Naturally crafted · Ethically sourced · Chemical-free';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [search,           setSearch]           = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy,           setSortBy]           = useState<SortOption>('newest');
  const [minPrice,         setMinPrice]         = useState<string>('');
  const [maxPrice,         setMaxPrice]         = useState<string>('');
  const [inStockOnly,      setInStockOnly]      = useState(false);
  const [showFilters,      setShowFilters]      = useState(false);
  const [showSortDrop,     setShowSortDrop]     = useState(false);
  const [page,             setPage]             = useState(1);

  const { data: categories } = useQuery({
    queryKey: ['categories', 'active'],
    queryFn: () => api.getActiveCategories(),
  });

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', page, search, selectedCategory, sortBy, minPrice, maxPrice, inStockOnly],
    queryFn: () => {
      let sortField: string | undefined;
      let sortOrder: 'asc' | 'desc' | undefined;
      if (sortBy === 'newest')     { sortField = 'createdAt'; sortOrder = 'desc'; }
      else if (sortBy === 'price-asc')  { sortField = 'price'; sortOrder = 'asc';  }
      else if (sortBy === 'price-desc') { sortField = 'price'; sortOrder = 'desc'; }
      else if (sortBy === 'popular')    { sortField = 'totalSold'; sortOrder = 'desc'; }

      return api.getProducts({
        page, limit: 12,
        search:    search || undefined,
        category:  selectedCategory || undefined,
        isActive:  true,
        inStock:   inStockOnly || undefined,
        minPrice:  minPrice ? Number(minPrice) : undefined,
        maxPrice:  maxPrice ? Number(maxPrice) : undefined,
        sortBy:    sortField,
        sortOrder,
      });
    },
  });

  const products   = productsData?.items || [];
  const totalPages = productsData?.totalPages || 1;

  const clearFilters = () => {
    setSearch(''); setSelectedCategory(null); setSortBy('newest');
    setMinPrice(''); setMaxPrice(''); setInStockOnly(false); setPage(1);
  };

  const hasActiveFilters =
    !!search || !!selectedCategory || sortBy !== 'newest' ||
    !!minPrice || !!maxPrice || inStockOnly;

  const activeFilterCount = [
    !!selectedCategory, sortBy !== 'newest', !!minPrice || !!maxPrice, inStockOnly,
  ].filter(Boolean).length;

  const selectedCatName = selectedCategory
    ? categories?.find((c: Category) => c._id === selectedCategory)?.name
    : null;

  const isGheeCategory        = !!(selectedCatName && /ghee|bilona/i.test(selectedCatName));
  const isWoodPressedCategory = !!(selectedCatName && /wood.?pressed|pressed.?oil/i.test(selectedCatName));

  const currentSortLabel = sortOptions.find((o) => o.value === sortBy)?.label ?? 'Sort';

  return (
    <div
      className="min-h-screen"
      style={{ background: '#f2ece0' }}
    >
      <BilonaSideDecor visible={isGheeCategory} />
      <BilonaSideDecor visible={isWoodPressedCategory} variant="woodpressed" />

      {/* ── Page hero bar ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden pt-28 pb-10"
        style={{ background: 'linear-gradient(160deg,#040e02 0%,#0d2c07 100%)' }}
      >
        {/* Grain overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            opacity: 0.5, mixBlendMode: 'overlay',
          }}
        />
        {/* Ambient gold glow */}
        <div
          className="pointer-events-none absolute top-0 right-1/4 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(160,112,16,0.10) 0%, transparent 70%)', filter: 'blur(80px)' }}
        />
        {/* Wave bottom edge */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-10"
          style={{ background: '#f2ece0', clipPath: 'ellipse(60% 100% at 50% 100%)' }} />

        {/* Decorative botanical sprig — right */}
        <svg viewBox="0 0 140 280" fill="none" xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none absolute right-6 bottom-0 hidden md:block"
          style={{ height: '90%', opacity: 0.09 }} aria-hidden>
          <path d="M70 280 C68 240 65 200 67 165 C69 130 73 105 70 70 C67 35 65 18 66 5" stroke="#b88a14" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M68 215 C45 203 28 180 32 157 C36 134 58 132 68 153" fill="#b88a14"/>
          <path d="M68 215 C91 203 108 180 104 157 C100 134 78 132 68 153" fill="#b88a14"/>
          <path d="M69 152 C48 139 33 116 37 93 C41 70 63 69 69 91" fill="#b88a14"/>
          <path d="M69 152 C90 139 105 116 101 93 C97 70 75 69 69 91" fill="#b88a14"/>
          <path d="M68 90 C50 78 37 58 41 40 C45 22 65 22 68 42" fill="#b88a14"/>
          <path d="M68 90 C86 78 99 58 95 40 C91 22 71 22 68 42" fill="#b88a14"/>
          <path d="M67 40 C56 30 50 17 54 8 C58 -1 68 1 67 16" fill="#b88a14" opacity="0.6"/>
          <path d="M67 40 C78 30 84 17 80 8 C76 -1 66 1 67 16" fill="#b88a14" opacity="0.6"/>
        </svg>
        {/* Secondary smaller sprig — far right */}
        <svg viewBox="0 0 80 200" fill="none" xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none absolute right-0 bottom-0 hidden lg:block"
          style={{ height: '65%', opacity: 0.055 }} aria-hidden>
          <path d="M40 200 C39 168 37 135 38 108 C39 81 42 62 40 35 C38 8 37 2 37 0" stroke="#b88a14" strokeWidth="2" strokeLinecap="round"/>
          <path d="M39 155 C25 146 14 130 17 114 C20 98 36 97 39 113" fill="#b88a14"/>
          <path d="M39 155 C53 146 64 130 61 114 C58 98 42 97 39 113" fill="#b88a14"/>
          <path d="M39 112 C26 103 16 87 19 72 C22 57 37 57 39 72" fill="#b88a14"/>
          <path d="M39 112 C52 103 62 87 59 72 C56 57 41 57 39 72" fill="#b88a14"/>
        </svg>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p style={{ fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(184,138,20,0.65)', fontFamily: 'monospace', marginBottom: 10 }}>
              Nature Lite Foods
            </p>
            <h1
              className="font-display font-bold"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', letterSpacing: '-0.025em', lineHeight: 1.1, color: '#fff' }}
            >
              Our Collection
            </h1>

            {/* Animated category sub-label */}
            <AnimatePresence>
              {selectedCatName && (
                <motion.div
                  key={selectedCatName}
                  className="mt-2 flex items-center gap-2.5"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div style={{ width: 22, height: 1, background: '#b88a14', opacity: 0.7, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#b88a14', letterSpacing: '0.06em', fontWeight: 600 }}>
                    {selectedCatName}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.p
                key={`tagline-${selectedCatName ?? '__all__'}`}
                className="mt-2 text-sm"
                style={{ color: selectedCatName ? 'rgba(184,138,20,0.72)' : 'rgba(255,255,255,0.38)', letterSpacing: '0.01em' }}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, delay: 0.06 }}
              >
                {selectedCatName
                  ? getCategoryTagline(selectedCatName)
                  : productsData?.total != null
                    ? `${productsData.total} products available · Free shipping ₹499+`
                    : 'Free shipping ₹499+'}
              </motion.p>
            </AnimatePresence>
            {selectedCatName && productsData?.total != null && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>
                {productsData.total} products · Free shipping ₹499+
              </p>
            )}
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">

        {/* ── Search + Sort + Filter toolbar ───────────────────────── */}
        <div
          className="sticky top-[100px] z-20 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4 py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
          style={{
            background: 'rgba(242,236,224,0.94)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(26,82,16,0.07)',
          }}
        >
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(46,66,37,0.40)' }} />
            <input
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-11 pr-10 py-3 rounded-2xl text-sm outline-none transition-all duration-200"
              style={{
                background: 'rgba(255,252,245,0.90)',
                border: '1px solid rgba(26,82,16,0.15)',
                color: '#0b1c08',
                boxShadow: '0 2px 12px -4px rgba(46,66,37,0.08)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(160,112,16,0.40)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(26,82,16,0.15)')}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-amber-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" style={{ color: 'rgba(46,66,37,0.50)' }} />
              </button>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortDrop((v) => !v)}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200"
              style={{
                background: 'rgba(255,252,245,0.90)',
                border: '1px solid rgba(26,82,16,0.15)',
                color: '#0b1c08',
                boxShadow: '0 2px 12px -4px rgba(46,66,37,0.08)',
              }}
            >
              <span>{currentSortLabel}</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showSortDrop ? 'rotate-180' : ''}`} style={{ color: 'rgba(46,66,37,0.45)' }} />
            </button>
            <AnimatePresence>
              {showSortDrop && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0,  scale: 1    }}
                  exit={{   opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  className="absolute right-0 top-full mt-2 z-30 rounded-2xl overflow-hidden py-1.5 min-w-[200px]"
                  style={{ background: 'rgba(255,252,245,0.97)', border: '1px solid rgba(26,82,16,0.15)', boxShadow: '0 12px 40px -8px rgba(61,46,31,0.16)' }}
                >
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortBy(opt.value); setPage(1); setShowSortDrop(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors duration-150"
                      style={{ color: sortBy === opt.value ? '#a07010' : '#0b1c08', background: sortBy === opt.value ? 'rgba(160,112,16,0.07)' : 'transparent', fontWeight: sortBy === opt.value ? 600 : 400 }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile filter button */}
          <button
            onClick={() => setShowFilters(true)}
            className="lg:hidden flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200"
            style={{
              background: hasActiveFilters ? 'rgba(160,112,16,0.12)' : 'rgba(255,252,245,0.90)',
              border: `1px solid ${hasActiveFilters ? 'rgba(160,112,16,0.35)' : 'rgba(26,82,16,0.15)'}`,
              color: hasActiveFilters ? '#a07010' : '#0b1c08',
              boxShadow: '0 2px 12px -4px rgba(46,66,37,0.08)',
            }}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full text-[10px] font-semibold flex items-center justify-center" style={{ background: '#a07010', color: '#fff' }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="hidden sm:flex items-center gap-1.5 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200"
              style={{ border: '1px solid rgba(26,82,16,0.15)', color: 'rgba(46,66,37,0.55)', background: 'transparent' }}
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* ── Active filter chips ───────────────────────────────────── */}
        {(selectedCatName || search) && (
          <div className="flex flex-wrap gap-2 mb-5">
            {search && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(160,112,16,0.10)', border: '1px solid rgba(160,112,16,0.25)', color: '#a07010' }}
              >
                &quot;{search}&quot;
                <button onClick={() => setSearch('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedCatName && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(160,112,16,0.10)', border: '1px solid rgba(160,112,16,0.25)', color: '#a07010' }}
              >
                {selectedCatName}
                <button onClick={() => { setSelectedCategory(null); setPage(1); }}><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}

        {/* ── Mobile filter drawer ──────────────────────────────────── */}
        <AnimatePresence>
          {showFilters && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 lg:hidden"
                style={{ background: 'rgba(19,11,5,0.45)' }}
                onClick={() => setShowFilters(false)}
              />
              <motion.div
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="fixed inset-y-0 left-0 z-50 w-80 overflow-y-auto lg:hidden"
                style={{ background: '#f2ece0', borderRight: '1px solid rgba(26,82,16,0.12)' }}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="font-display text-lg font-bold" style={{ color: '#0b1c08' }}>Filters</h3>
                    <button onClick={() => setShowFilters(false)} className="p-2 rounded-full hover:bg-amber-50 transition-colors">
                      <X className="w-5 h-5" style={{ color: 'rgba(46,66,37,0.50)' }} />
                    </button>
                  </div>

                  <FilterSidebar
                    categories={categories}
                    selectedCategory={selectedCategory}
                    minPrice={minPrice}
                    maxPrice={maxPrice}
                    inStockOnly={inStockOnly}
                    hasActiveFilters={hasActiveFilters}
                    onCategoryChange={(id) => { setSelectedCategory(id); setPage(1); setShowFilters(false); }}
                    onMinPriceChange={(v) => { setMinPrice(v); setPage(1); }}
                    onMaxPriceChange={(v) => { setMaxPrice(v); setPage(1); }}
                    onInStockChange={(v) => { setInStockOnly(v); setPage(1); }}
                    onClear={() => { clearFilters(); setShowFilters(false); }}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Main layout ───────────────────────────────────────────── */}
        <div className="flex gap-8">

          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <div
              className="sticky top-28 rounded-3xl overflow-hidden"
              style={{ background: 'rgba(255,252,245,0.92)', border: '1px solid rgba(26,82,16,0.12)', boxShadow: '0 8px 36px -10px rgba(61,46,31,0.14)' }}
            >
              {/* Gold shimmer accent bar */}
              <div style={{ height: 3, background: 'linear-gradient(90deg, #9a7008 0%, #c4960a 25%, #e8c040 50%, #c4960a 75%, #9a7008 100%)' }} />
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-0">
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#0b1c08' }}>Filters</span>
                <AnimatePresence>
                  {hasActiveFilters && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      onClick={clearFilters}
                      style={{ fontSize: 10, fontWeight: 600, color: '#a07010', letterSpacing: '0.04em' }}
                    >
                      Reset
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <div className="p-5 pt-4">
                <FilterSidebar
                  categories={categories}
                  selectedCategory={selectedCategory}
                  minPrice={minPrice}
                  maxPrice={maxPrice}
                  inStockOnly={inStockOnly}
                  hasActiveFilters={hasActiveFilters}
                  onCategoryChange={(id) => { setSelectedCategory(id); setPage(1); }}
                  onMinPriceChange={(v) => { setMinPrice(v); setPage(1); }}
                  onMaxPriceChange={(v) => { setMaxPrice(v); setPage(1); }}
                  onInStockChange={(v) => { setInStockOnly(v); setPage(1); }}
                  onClear={clearFilters}
                />
              </div>
            </div>
          </aside>

          {/* Product grid */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {[...Array(9)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : products.length === 0 ? (
              <motion.div
                className="text-center py-24"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <p className="font-display text-2xl font-bold mb-3" style={{ color: 'rgba(61,46,31,0.30)' }}>No products found</p>
                <p className="text-sm mb-6" style={{ color: 'rgba(46,66,37,0.40)' }}>Try adjusting your filters or search query</p>
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200"
                  style={{ background: '#0b1c08', color: '#fff8f0' }}
                >
                  Clear all filters
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              <>
                {/* Results bar */}
                <div className="flex items-center gap-2.5 mb-5 pb-3.5" style={{ borderBottom: '1px solid rgba(26,82,16,0.09)' }}>
                  <AnimatePresence>
                    {selectedCatName && (
                      <motion.span
                        key={selectedCatName}
                        initial={{ opacity: 0, scale: 0.88 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.88 }}
                        style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '3px 10px', borderRadius: 99, flexShrink: 0,
                          background: isGheeCategory
                            ? 'rgba(196,150,10,0.13)'
                            : isWoodPressedCategory
                            ? 'rgba(26,110,50,0.10)'
                            : 'rgba(46,66,37,0.07)',
                          color: isGheeCategory ? '#6b4200' : isWoodPressedCategory ? '#155c2c' : 'rgba(46,66,37,0.65)',
                          border: `1px solid ${isGheeCategory ? 'rgba(196,150,10,0.30)' : isWoodPressedCategory ? 'rgba(26,110,50,0.22)' : 'rgba(46,66,37,0.14)'}`,
                        }}
                      >
                        {selectedCatName}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <span style={{ fontSize: 12, color: 'rgba(46,66,37,0.40)', letterSpacing: '0.01em' }}>
                    {productsData?.total ?? products.length} product{(productsData?.total ?? products.length) !== 1 ? 's' : ''}
                  </span>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${selectedCategory ?? 'all'}-${sortBy}-${page}`}
                    className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {products.map((product: Product, index: number) => (
                      <TiltCard key={product._id}>
                        <PremiumProductCard product={product} index={index} compact />
                      </TiltCard>
                    ))}
                  </motion.div>
                </AnimatePresence>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-14">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 disabled:opacity-30"
                      style={{ border: '1px solid rgba(26,82,16,0.20)', color: '#0b1c08', background: 'transparent' }}
                    >
                      ← Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                        .reduce((acc: (number | '…')[], p, i, arr) => {
                          if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === '…' ? (
                            <span key={`ellipsis-${i}`} className="px-2 text-sm" style={{ color: 'rgba(46,66,37,0.35)' }}>…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setPage(p as number)}
                              className="w-9 h-9 rounded-full text-sm font-medium transition-all duration-200"
                              style={{
                                background: page === p ? '#0b1c08' : 'transparent',
                                color: page === p ? '#fff8f0' : '#0b1c08',
                                border: page === p ? 'none' : '1px solid rgba(26,82,16,0.20)',
                              }}
                            >
                              {p}
                            </button>
                          )
                        )}
                    </div>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 disabled:opacity-30"
                      style={{ border: '1px solid rgba(26,82,16,0.20)', color: '#0b1c08', background: 'transparent' }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Close sort dropdown on outside click */}
      {showSortDrop && (
        <div className="fixed inset-0 z-20" onClick={() => setShowSortDrop(false)} />
      )}
    </div>
  );
}

// ─── Filter sidebar (shared desktop + mobile) ─────────────────────────────────

interface FilterSidebarProps {
  categories?: Category[];
  selectedCategory: string | null;
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
  hasActiveFilters: boolean;
  onCategoryChange: (id: string | null) => void;
  onMinPriceChange: (v: string) => void;
  onMaxPriceChange: (v: string) => void;
  onInStockChange: (v: boolean) => void;
  onClear: () => void;
}

function FilterSidebar({
  categories,
  selectedCategory,
  minPrice,
  maxPrice,
  inStockOnly,
  hasActiveFilters,
  onCategoryChange,
  onMinPriceChange,
  onMaxPriceChange,
  onInStockChange,
  onClear,
}: FilterSidebarProps) {
  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cat-glow {
          0%, 100% { box-shadow: inset 4px 0 0 #c4960a, 3px 0 0 rgba(196,150,10,0); }
          50%       { box-shadow: inset 4px 0 0 #c4960a, 6px 0 20px rgba(196,150,10,0.34); }
        }
        .cat-active-item { animation: cat-glow 2.6s ease-in-out infinite; }
      ` }} />

      {/* ── Categories ─────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2.5">
          <span style={{ width: 3, height: 12, borderRadius: 2, background: '#b88a14', display: 'block', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(11,28,8,0.75)' }}>
            Category
          </span>
        </div>
        <div className="space-y-0.5">
          {[{ _id: null as null, name: 'All Products' }, ...(categories || [])].map((cat, idx) => {
            const id = cat._id as string | null;
            const active = selectedCategory === id;
            return (
              <motion.button
                key={id ?? '__all__'}
                onClick={() => onCategoryChange(id)}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: idx * 0.045 }}
                whileHover={active ? {} : { x: 2 }}
                className={cn(
                  'w-full text-left py-2.5 rounded-xl text-sm transition-colors duration-200',
                  active ? 'font-semibold cat-active-item' : 'font-normal hover:bg-amber-50/60'
                )}
                style={{
                  color: active ? '#5c3700' : 'rgba(61,46,31,0.65)',
                  background: active
                    ? 'linear-gradient(90deg, rgba(196,150,10,0.18) 0%, rgba(160,112,16,0.06) 60%, transparent 100%)'
                    : 'transparent',
                  paddingLeft: active ? 11 : 14,
                  paddingRight: 12,
                }}
              >
                {cat.name}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────── */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(26,82,16,0.14), rgba(26,82,16,0.04))', margin: '2px 0 18px' }} />

      {/* ── Price ────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2.5">
          <span style={{ width: 3, height: 12, borderRadius: 2, background: '#b88a14', display: 'block', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(11,28,8,0.75)' }}>
            Price Range
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            { placeholder: 'Min ₹', value: minPrice, onChange: onMinPriceChange },
            { placeholder: 'Max ₹', value: maxPrice, onChange: onMaxPriceChange },
          ] as const).map(({ placeholder, value, onChange }) => (
            <input
              key={placeholder}
              type="number"
              inputMode="numeric"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: 'rgba(255,252,245,0.80)',
                border: '1px solid rgba(26,82,16,0.16)',
                color: '#0b1c08',
                fontSize: 13,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(196,150,10,0.50)')}
              onBlur={(e)  => (e.currentTarget.style.borderColor = 'rgba(26,82,16,0.16)')}
            />
          ))}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────── */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(26,82,16,0.14), rgba(26,82,16,0.04))', margin: '2px 0 18px' }} />

      {/* ── In-stock toggle ──────────────────────────────── */}
      <div
        className="flex items-center justify-between cursor-pointer rounded-xl px-1 py-1 transition-colors hover:bg-amber-50/50"
        onClick={() => onInStockChange(!inStockOnly)}
      >
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#0b1c08', marginBottom: 1 }}>In stock only</p>
          <p style={{ fontSize: 10, color: 'rgba(46,66,37,0.45)' }}>Hide sold out items</p>
        </div>
        <div
          className="relative rounded-full transition-all duration-300 flex-shrink-0"
          style={{ background: inStockOnly ? '#a07010' : 'rgba(26,82,16,0.18)', height: 24, width: 44 }}
        >
          <div
            className="absolute top-[3px] rounded-full transition-all duration-300"
            style={{ width: 18, height: 18, background: '#fff', left: inStockOnly ? 23 : 3, boxShadow: '0 1px 5px rgba(0,0,0,0.18)' }}
          />
        </div>
      </div>
    </div>
  );
}
