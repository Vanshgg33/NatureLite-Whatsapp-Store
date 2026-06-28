'use client';

import { useMemo, useState, useRef, useEffect, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Wheat, Cookie, MountainSnow, Candy, Flame, Bean, Sprout, Droplets, Leaf, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PremiumProductCard } from '@/components/ecommerce/premium-product-card';
import { QuickViewModal } from '@/components/ecommerce/quick-view-modal';
import { Product, Category } from '@/types';
import { api } from '@/lib/api';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Magnetic } from '@/components/ui/magnetic';


// ─── Circular Category Orbit ──────────────────────────────────────────────────

// Category → icon/color map
const CAT_STYLE_MAP: Record<string, { Icon: LucideIcon; bgGrad: string; ic: string }> = {
  'flours':              { Icon: Wheat,        bgGrad: 'linear-gradient(145deg,#f5f0e8,#e6ddc8)', ic: '#3a6e20' },
  'healthy snacks':      { Icon: Cookie,       bgGrad: 'linear-gradient(145deg,#faf0e0,#eedcc0)', ic: '#8B4513' },
  'himalayan pink salt': { Icon: MountainSnow, bgGrad: 'linear-gradient(145deg,#ffe8e2,#f8cec4)', ic: '#c2553a' },
  'natural sweeteners':  { Icon: Candy,        bgGrad: 'linear-gradient(145deg,#fefae0,#f8e8a0)', ic: '#a07010' },
  'spices':              { Icon: Flame,        bgGrad: 'linear-gradient(145deg,#fff0e4,#f8d8b8)', ic: '#c2553a' },
  'unpolished pulses':   { Icon: Bean,         bgGrad: 'linear-gradient(145deg,#f5f0e6,#e4d8b8)', ic: '#8B4513' },
  'a2 bilona ghee':      { Icon: Droplets,     bgGrad: 'linear-gradient(145deg,#fffae8,#faeab8)', ic: '#c8920a' },
  'seeds':               { Icon: Sprout,       bgGrad: 'linear-gradient(145deg,#f0f8e8,#d8ecc8)', ic: '#3a6e20' },
  'wood pressed oils':   { Icon: Droplets,     bgGrad: 'linear-gradient(145deg,#fffae4,#f8e8a0)', ic: '#c8920a' },
  'dry fruits':          { Icon: Leaf,         bgGrad: 'linear-gradient(145deg,#faf0e0,#eedcb8)', ic: '#8B4513' },
};
const DEFAULT_CAT_STYLE = { Icon: Leaf, bgGrad: 'linear-gradient(145deg,#f5f0e8,#e6ddc8)', ic: '#3a6e20' };
const getCatStyle = (name: string) => CAT_STYLE_MAP[name.toLowerCase().trim()] ?? DEFAULT_CAT_STYLE;

function CircularCategoryOrbit({
  categories,
  selectedCatId,
  onSelect,
}: {
  categories: Category[];
  selectedCatId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const N = categories.length;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ R: 105, tileSize: 52 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const pick = () => {
      const w = el.clientWidth;
      // Tile size as fraction of orbit radius — bigger ratio = chunkier tiles on mobile
      const ratio = w >= 700 ? 0.42 : w >= 540 ? 0.44 : w >= 420 ? 0.46 : 0.50;
      // containerW/2 = R + tileSize/2 + labelZone = R + tileSize*(0.5+0.72) = R*(1+ratio*1.22)
      // Solve for R so orbit always fits: R*(1+ratio*1.22) = w/2 - 10
      const R = Math.min(210, Math.max(65, Math.floor((w / 2 - 10) / (1 + ratio * 1.22))));
      setDims({ R, tileSize: Math.round(R * ratio) });
    };
    pick();
    window.addEventListener('resize', pick);
    return () => window.removeEventListener('resize', pick);
  }, []);

  if (N === 0) return null;

  const { R, tileSize } = dims;
  const labelZone  = Math.round(tileSize * 0.72);
  const containerW = (R + tileSize / 2 + labelZone) * 2;
  const containerH = containerW + 32;
  const cx         = containerW / 2;
  const cy         = containerH / 2 - 8;
  const iconSize   = Math.round(tileSize * 0.42);
  const hubSize    = Math.round(tileSize * 1.35);
  const labelW     = Math.round(tileSize * 1.6);
  const labelFs    = Math.max(9, Math.round(tileSize * 0.158));

  return (
    <div ref={wrapRef} style={{ width: '100%', marginBottom: 20 }}>
      {/* ── Dark premium card ── */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(160deg, #0d2507 0%, #0b1c08 55%, #041000 100%)',
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 28px 70px -14px rgba(3,10,2,0.65), 0 8px 24px -8px rgba(3,10,2,0.35)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>

        {/* Grain texture */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 0, opacity: 0.45, mixBlendMode: 'overlay',
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.80' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          pointerEvents: 'none',
        }} />

        {/* Ambient glows */}
        <div aria-hidden style={{
          position: 'absolute', top: '-15%', left: '-8%', width: '55%', height: '55%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(160,112,16,0.22) 0%, transparent 70%)',
          filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0,
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: '-20%', right: '-6%', width: '50%', height: '50%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(26,100,20,0.18) 0%, transparent 70%)',
          filter: 'blur(48px)', pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Decorative botanical SVG — wheat stalks + seeds at very low opacity */}
        <svg aria-hidden viewBox="0 0 800 520" preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, opacity: 0.07 }}>
          {/* Left wheat stalk */}
          <g stroke="rgba(212,180,80,1)" fill="none" strokeLinecap="round">
            <line x1="60" y1="480" x2="60" y2="60" strokeWidth="2.5"/>
            {[80,115,148,180,212,244,275,305,333].map((y, i) => (
              <g key={i}>
                <ellipse cx={60 + (i % 2 === 0 ? -22 : 22)} cy={y} rx="10" ry="20"
                  transform={`rotate(${i % 2 === 0 ? -28 : 28} ${60 + (i % 2 === 0 ? -22 : 22)} ${y})`}
                  strokeWidth="2" fill="rgba(212,180,80,0.6)" />
              </g>
            ))}
            {/* Ear tip */}
            {[-3,-1,1,3].map((dx, i) => (
              <ellipse key={i} cx={60+dx*4} cy={50-i*14} rx="5" ry="13" strokeWidth="1.5"
                fill="rgba(212,180,80,0.5)" />
            ))}
          </g>
          {/* Right wheat stalk */}
          <g stroke="rgba(200,170,70,1)" fill="none" strokeLinecap="round">
            <line x1="740" y1="480" x2="740" y2="60" strokeWidth="2.5"/>
            {[80,115,148,180,212,244,275,305,333].map((y, i) => (
              <g key={i}>
                <ellipse cx={740 + (i % 2 === 0 ? 22 : -22)} cy={y} rx="10" ry="20"
                  transform={`rotate(${i % 2 === 0 ? 28 : -28} ${740 + (i % 2 === 0 ? 22 : -22)} ${y})`}
                  strokeWidth="2" fill="rgba(212,180,80,0.6)" />
              </g>
            ))}
            {[-3,-1,1,3].map((dx, i) => (
              <ellipse key={i} cx={740+dx*4} cy={50-i*14} rx="5" ry="13" strokeWidth="1.5"
                fill="rgba(212,180,80,0.5)" />
            ))}
          </g>
          {/* Scattered seeds */}
          {[
            [130,90,12,18,15],[160,200,8,14,-20],[90,320,10,16,30],
            [670,100,9,15,-25],[710,250,11,17,18],[650,380,8,13,10],
            [200,450,7,12,-35],[600,430,9,14,22],[350,70,6,10,5],
            [450,480,8,13,-12],[120,420,7,11,40],[680,420,6,10,-30],
          ].map(([cx,cy,rx,ry,rot], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              transform={`rotate(${rot} ${cx} ${cy})`}
              fill="rgba(212,180,80,0.8)" stroke="none" />
          ))}
          {/* Corner leaf curves — top-left */}
          <path d="M 0 120 Q 80 40 160 90 Q 80 120 0 120 Z"
            fill="rgba(40,140,40,0.55)" stroke="none" />
          <path d="M 0 180 Q 100 80 200 140 Q 90 170 0 180 Z"
            fill="rgba(30,120,30,0.35)" stroke="none" />
          {/* Corner leaf curves — bottom-right */}
          <path d="M 800 400 Q 720 480 640 430 Q 720 400 800 400 Z"
            fill="rgba(40,140,40,0.55)" stroke="none" />
          <path d="M 800 340 Q 700 440 600 380 Q 710 340 800 340 Z"
            fill="rgba(30,120,30,0.35)" stroke="none" />
          {/* Concentric faint rings — orbit echo */}
          <circle cx="400" cy="270" r="280" stroke="rgba(200,160,40,0.18)" strokeWidth="1" fill="none"/>
          <circle cx="400" cy="270" r="340" stroke="rgba(200,160,40,0.10)" strokeWidth="1" fill="none" strokeDasharray="8 12"/>
          <circle cx="400" cy="270" r="400" stroke="rgba(200,160,40,0.06)" strokeWidth="1" fill="none" strokeDasharray="4 16"/>
        </svg>

        {/* ── Card header ── */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', paddingTop: 28, paddingBottom: 4 }}>
          <p style={{
            fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.30em',
            textTransform: 'uppercase', color: 'rgba(212,178,70,0.75)', marginBottom: 8,
          }}>
            Curated for you
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: 'clamp(1.35rem, 3.5vw, 2rem)',
            fontWeight: 700, letterSpacing: '-0.02em',
            color: 'rgba(255,248,220,0.96)', margin: 0,
          }}>
            Shop Our Collection
          </h2>
          <div style={{
            width: 44, height: 1.5, margin: '10px auto 0',
            background: 'linear-gradient(90deg, transparent, rgba(212,168,40,0.65), transparent)',
          }} />
          <p style={{
            fontSize: 11, color: 'rgba(255,255,255,0.30)',
            marginTop: 8, letterSpacing: '0.03em',
          }}>
            Tap a category to explore
          </p>
        </div>

        {/* ── Orbit canvas ── */}
        <div style={{ position: 'relative', zIndex: 1, width: containerW, height: containerH, margin: '0 auto' }}>

          {/* SVG rings */}
          <svg width={containerW} height={containerH}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
            {/* Outer dashed orbit guide */}
            <circle cx={cx} cy={cy} r={R}
              fill="none" stroke="rgba(255,255,255,0.10)"
              strokeWidth="1.5" strokeDasharray="5 8" />
            {/* Inner depth ring */}
            <circle cx={cx} cy={cy} r={R * 0.46}
              fill="none" stroke="rgba(200,146,10,0.14)" strokeWidth="1" />
          </svg>

          {/* Category tiles */}
          {categories.map((cat, i) => {
            const angle  = (-90 + i * (360 / N)) * (Math.PI / 180);
            const x      = cx + R * Math.cos(angle);
            const y      = cy + R * Math.sin(angle);
            const active = selectedCatId === cat._id;
            const s      = getCatStyle(cat.name);
            const Icon   = s.Icon;

            return (
              <motion.div
                key={cat._id}
                style={{ position: 'absolute', left: x, top: y, width: 0, height: 0 }}
                animate={{ y: active ? -12 : 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              >
                {/* Active glow halo — offset from 0,0 (tile center) using negative margin */}
                {active && (
                  <div aria-hidden style={{
                    position: 'absolute',
                    left: -(tileSize / 2 + 12), top: -(tileSize / 2 + 12),
                    width: tileSize + 24, height: tileSize + 24,
                    borderRadius: '50%',
                    background: 'rgba(255,210,40,0.28)',
                    filter: 'blur(10px)',
                    pointerEvents: 'none',
                  }} />
                )}

                {/* Centering wrapper — plain div, Framer Motion won't touch its transform */}
                <div style={{
                  position: 'absolute',
                  left: -(tileSize / 2), top: -(tileSize / 2),
                  width: tileSize, height: tileSize,
                }}>
                  {/* Scale wrapper — motion only handles scale here, no translate conflict */}
                  <motion.div
                    whileTap={{ scale: 0.88 }}
                    whileHover={!active ? { scale: 1.10 } : {}}
                    style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                  >
                    <button
                      onClick={() => onSelect(active ? null : cat._id)}
                      style={{
                        width: '100%', height: '100%', borderRadius: '50%',
                        border: active
                          ? '3px solid #ffd040'
                          : '2.5px solid rgba(255,255,255,0.82)',
                        background: cat.image ? '#f0ebe0' : s.bgGrad,
                        boxShadow: active
                          ? '0 12px 30px -6px rgba(255,200,20,0.40), 0 3px 10px rgba(0,0,0,0.25)'
                          : '0 4px 18px -4px rgba(0,0,0,0.40), 0 1px 4px rgba(0,0,0,0.20)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', overflow: 'hidden', padding: 0, outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                      }}
                    >
                      {cat.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cat.image} alt={cat.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Icon size={iconSize} color={s.ic} strokeWidth={1.7} />
                      )}
                    </button>
                  </motion.div>
                </div>

                {/* Label — anchored from 0,0 (tile center) */}
                <div style={{
                  position: 'absolute',
                  left: -(labelW / 2), top: tileSize / 2 + 9,
                  width: labelW, textAlign: 'center', pointerEvents: 'none',
                }}>
                  <span style={{
                    display: 'inline-block',
                    fontSize: labelFs,
                    fontWeight: active ? 700 : 500,
                    lineHeight: 1.25,
                    color: active ? '#ffd040' : 'rgba(238,222,182,0.82)',
                    background: active ? 'rgba(255,210,20,0.12)' : 'transparent',
                    padding: active ? '2px 6px' : '1px 3px',
                    borderRadius: 5,
                    whiteSpace: 'normal',
                    letterSpacing: '0.01em',
                  }}>
                    {cat.name}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {/* Center hub — static wrapper positions it, motion handles only scale */}
          <div style={{
            position: 'absolute',
            left: cx - hubSize / 2,
            top: cy - hubSize / 2,
            width: hubSize, height: hubSize,
          }}>
            <motion.div
              whileHover={{ scale: 1.09 }}
              whileTap={{ scale: 0.94 }}
              style={{ width: '100%', height: '100%', borderRadius: '50%' }}
            >
              <button
                onClick={() => onSelect(null)}
                style={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  border: !selectedCatId
                    ? '3px solid rgba(255,240,140,0.45)'
                    : '2px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                  background: !selectedCatId
                    ? 'linear-gradient(145deg, #ffe040 0%, #f0c010 45%, #c8920a 100%)'
                    : 'linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05))',
                  color: !selectedCatId ? '#2a1a00' : 'rgba(255,255,255,0.55)',
                  boxShadow: !selectedCatId
                    ? '0 18px 44px -8px rgba(220,165,10,0.65), 0 4px 12px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,200,0.45)'
                    : '0 4px 16px rgba(0,0,0,0.30)',
                  display: 'flex', flexDirection: 'column' as const,
                  alignItems: 'center', justifyContent: 'center',
                  gap: Math.round(hubSize * 0.05),
                  transition: 'background 0.30s, box-shadow 0.30s, border-color 0.30s',
                  outline: 'none',
                }}
              >
                <span style={{
                  fontSize: Math.round(hubSize * 0.175),
                  fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: '-0.01em',
                }}>
                  Shop All
                </span>
                <ArrowRight size={Math.round(hubSize * 0.24)} strokeWidth={2.5} />
              </button>
            </motion.div>
          </div>
        </div>

        {/* ── Card footer ── */}
        <p style={{
          position: 'relative', zIndex: 1,
          textAlign: 'center', paddingBottom: 20, paddingTop: 4,
          fontSize: 10, color: 'rgba(255,255,255,0.20)', letterSpacing: '0.04em',
        }}>
          {selectedCatId
            ? '↓ Showing filtered products below'
            : 'Select a category or scroll to browse all'}
        </p>
      </div>
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

        {/* ── Circular category orbit (header lives inside the card) ── */}
        {safeCategories.length > 0 && (
          <CircularCategoryOrbit
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
