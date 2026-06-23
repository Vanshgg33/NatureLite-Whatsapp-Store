'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, ChevronLeft, ChevronRight, ShoppingCart, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Product, ProductVariant } from '@/types';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isVideoUrl = (u: string) =>
  /youtube\.com|youtu\.be|vimeo\.com|instagram\.com\/(reel|p|tv)/i.test(u);

interface ParsedVideo {
  url: string;
  embedUrl: string;
  thumbnail: string;
  type: 'youtube' | 'instagram' | 'vimeo' | 'other';
}

interface VideoEntry {
  parsed: ParsedVideo;
  product: Product;
}

function parseVideo(url: string): ParsedVideo {
  const ytWatch = url.match(/(?:youtube\.com\/(?:watch\?(?:[^&]*&)*v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytWatch) {
    const id = ytWatch[1];
    return { url, embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0&modestbranding=1`, thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, type: 'youtube' };
  }
  const ytShorts = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (ytShorts) {
    const id = ytShorts[1];
    return { url, embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0`, thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, type: 'youtube' };
  }
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { url, embedUrl: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&muted=1`, thumbnail: '', type: 'vimeo' };
  const ig = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  if (ig) return { url, embedUrl: `https://www.instagram.com/reel/${ig[1]}/embed/`, thumbnail: '', type: 'instagram' };
  return { url, embedUrl: url, thumbnail: '', type: 'other' };
}

const fmt = (p: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p);

// ─── Video Card ───────────────────────────────────────────────────────────────

function VideoCard({ entry, index, onClick }: { entry: VideoEntry; index: number; onClick: () => void }) {
  const { parsed, product } = entry;
  const { addItem } = useCartStore();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const image = product.images?.[0] ?? '';

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    try {
      await addItem({ productId: product._id, name: product.name, slug: product.slug, image, price: product.price, compareAtPrice: product.compareAtPrice, gstPercentage: product.gstPercentage ?? 0 });
      toast({ title: 'Added to cart', description: product.name });
    } catch { toast({ title: 'Could not add', variant: 'destructive' }); }
    finally { setAdding(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.23, 1, 0.32, 1] }}
      style={{ width: 'clamp(130px, 40vw, 160px)', borderRadius: 18, overflow: 'hidden', flexShrink: 0, position: 'relative', cursor: 'pointer' }}
    >
      {/* Clickable video area */}
      <div
        onClick={onClick}
        style={{ width: '100%', aspectRatio: '9/16', position: 'relative', display: 'block' }}
      >
        {parsed.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={parsed.thumbnail} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, hsl(${(index * 47 + 160) % 360},35%,28%), hsl(${(index * 47 + 200) % 360},40%,18%))` }} />
        )}
        {/* Gradient */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.04) 0%,rgba(0,0,0,0.42) 60%,rgba(0,0,0,0) 100%)' }} />
        {/* Play */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.35)', transition: 'transform 0.2s' }}
            className="group-hover:scale-110">
            <Play style={{ width: 18, height: 18, color: '#1a2810', marginLeft: 2 }} fill="#1a2810" />
          </div>
        </div>
        {/* Badge */}
        {parsed.type === 'instagram' && (
          <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.55)', borderRadius: 100, padding: '3px 8px', fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Reel</div>
        )}
      </div>

      {/* Product strip */}
      <div
        style={{ background: 'rgba(255,255,255,0.97)', borderTop: '1px solid rgba(0,0,0,0.06)', padding: '8px 10px 10px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {image && (
            <div style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
              <Image src={image} alt={product.name} width={26} height={26} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, color: '#1a2810', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.name}</p>
            <p style={{ fontSize: 9.5, fontWeight: 600, color: '#7a5500', marginTop: 1 }}>{fmt(product.price)}</p>
          </div>
        </div>
        <button
          onClick={handleAdd}
          disabled={adding}
          style={{ width: '100%', padding: '5px 0', background: adding ? '#5a7a3a' : '#2d4a1e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          <ShoppingCart style={{ width: 9, height: 9 }} />
          {adding ? 'Adding…' : 'Add to Cart'}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ entries, initialIndex, onClose }: { entries: VideoEntry[]; initialIndex: number; onClose: () => void }) {
  const [current, setCurrent] = useState(initialIndex);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + entries.length) % entries.length), [entries.length]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % entries.length), [entries.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, prev, next]);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  const { parsed, product } = entries[current];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: 'rgba(5,12,4,0.96)', backdropFilter: 'blur(18px)' }}
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-5 right-5 z-10 flex items-center justify-center rounded-full"
        style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}>
        <X size={18} />
      </button>
      <div className="absolute top-5 left-1/2 -translate-x-1/2" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
        {current + 1} / {entries.length}
      </div>

      <div className="relative flex items-center justify-center gap-4 w-full h-full px-4" onClick={(e) => e.stopPropagation()}>
        {/* Prev */}
        {entries.length > 1 && (
          <motion.button onClick={prev} whileTap={{ scale: 0.95 }} className="hidden sm:block relative flex-shrink-0"
            style={{ width: 90, aspectRatio: '9/16', borderRadius: 14, overflow: 'hidden', opacity: 0.4, transition: 'opacity 0.2s' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.65')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.4')}
          >
            {entries[(current - 1 + entries.length) % entries.length].parsed.thumbnail
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={entries[(current - 1 + entries.length) % entries.length].parsed.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#1a2810' }} />}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color="rgba(255,255,255,0.7)" /></div>
          </motion.button>
        )}

        {/* Main video */}
        <AnimatePresence mode="wait">
          <motion.div key={current} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            style={{ position: 'relative', flexShrink: 0, width: 'min(320px, calc(100vw - 48px))', aspectRatio: '9/16', borderRadius: 22, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <iframe src={parsed.embedUrl} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title={product.name} />
          </motion.div>
        </AnimatePresence>

        {/* Product panel — desktop */}
        <LightboxProductPanel product={product} />

        {/* Next */}
        {entries.length > 1 && (
          <motion.button onClick={next} whileTap={{ scale: 0.95 }} className="hidden xl:block relative flex-shrink-0"
            style={{ width: 90, aspectRatio: '9/16', borderRadius: 14, overflow: 'hidden', opacity: 0.4, transition: 'opacity 0.2s' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.65')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.4')}
          >
            {entries[(current + 1) % entries.length].parsed.thumbnail
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={entries[(current + 1) % entries.length].parsed.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#1a2810' }} />}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={22} color="rgba(255,255,255,0.7)" /></div>
          </motion.button>
        )}
      </div>

      {/* Mobile product bar */}
      <MobileBar product={product} onClose={onClose} />

      {/* Nav arrows (desktop sides) */}
      {entries.length > 1 && <>
        <button onClick={(e) => { e.stopPropagation(); prev(); }} className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
          <ChevronLeft size={18} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); next(); }} className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
          <ChevronRight size={18} />
        </button>
      </>}

      {/* Mobile dot nav */}
      {entries.length > 1 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:hidden" onClick={(e) => e.stopPropagation()}>
          <button onClick={prev} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><ChevronLeft size={16} /></button>
          <div className="flex items-center gap-1.5">
            {entries.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? 18 : 6, height: 6, borderRadius: 3, background: i === current ? '#a07010' : 'rgba(255,255,255,0.3)', border: 'none', cursor: 'pointer', transition: 'all 0.25s' }} />
            ))}
          </div>
          <button onClick={next} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><ChevronRight size={16} /></button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Lightbox product panel (desktop right side) ───────────────────────────────

function LightboxProductPanel({ product }: { product: Product }) {
  const { addItem } = useCartStore();
  const { toast } = useToast();
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    product.variants.length === 1 ? product.variants[0] : null
  );
  const [adding, setAdding] = useState(false);
  const price = selectedVariant?.price ?? product.price;
  const image = product.images?.[0] ?? '';

  const handleAdd = async () => {
    setAdding(true);
    try {
      await addItem({ productId: product._id, name: product.name, slug: product.slug, image, price, compareAtPrice: selectedVariant?.compareAtPrice ?? product.compareAtPrice, variantSku: selectedVariant?.sku, variantName: selectedVariant?.name, gstPercentage: product.gstPercentage ?? 0 });
      toast({ title: 'Added to cart', description: product.name });
    } catch { toast({ title: 'Could not add', variant: 'destructive' }); }
    finally { setAdding(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.32 }}
      className="hidden lg:flex flex-col"
      style={{ width: 272, flexShrink: 0, background: 'rgba(255,252,246,0.98)', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(200,150,12,0.15)', maxHeight: '80vh' }}>
      {image && (
        <div style={{ width: '100%', aspectRatio: '4/3', position: 'relative', background: '#f5efe4', flexShrink: 0 }}>
          <Image src={image} alt={product.name} fill style={{ objectFit: 'cover' }} />
        </div>
      )}
      <div className="flex flex-col flex-1 overflow-y-auto p-4 gap-3" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-start justify-between gap-2">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1a2810', lineHeight: 1.35, flex: 1 }}>{product.name}</p>
          <Link href={`/products/${product.slug}`} onClick={(e) => e.stopPropagation()}>
            <ExternalLink style={{ width: 13, height: 13, color: 'rgba(26,40,16,0.35)', flexShrink: 0, marginTop: 2 }} />
          </Link>
        </div>
        <div className="flex items-baseline gap-2">
          <span style={{ fontSize: 18, fontWeight: 800, color: '#2d4a1e', fontFamily: 'Georgia, serif' }}>{fmt(price)}</span>
          {product.compareAtPrice && product.compareAtPrice > price && (
            <span style={{ fontSize: 12, color: 'rgba(26,40,16,0.35)', textDecoration: 'line-through' }}>{fmt(product.compareAtPrice)}</span>
          )}
        </div>
        {product.description && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(26,40,16,0.38)', marginBottom: 4 }}>Description</p>
            <p style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(26,40,16,0.62)' }}>
              {product.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}{product.description.length > 200 ? '…' : ''}
            </p>
          </div>
        )}
        {product.variants.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(26,40,16,0.38)', marginBottom: 6 }}>Size / Weight</p>
            <div className="flex flex-wrap gap-1.5">
              {product.variants.map((v) => (
                <button key={v.sku} onClick={(e) => { e.stopPropagation(); setSelectedVariant(v); }}
                  style={{ padding: '4px 10px', borderRadius: 100, fontSize: 10, fontWeight: 600, border: selectedVariant?.sku === v.sku ? '1.5px solid #2d4a1e' : '1.5px solid rgba(26,40,16,0.18)', background: selectedVariant?.sku === v.sku ? '#2d4a1e' : 'transparent', color: selectedVariant?.sku === v.sku ? '#fff' : 'rgba(26,40,16,0.65)', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-auto pt-2">
          <button onClick={(e) => { e.stopPropagation(); handleAdd(); }} disabled={adding || (product.variants.length > 0 && !selectedVariant)}
            style={{ flex: 1, padding: '9px 0', background: '#2d4a1e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <ShoppingCart style={{ width: 10, height: 10 }} />
            {adding ? 'Adding…' : product.variants.length > 0 && !selectedVariant ? 'Select size' : 'Add to Cart'}
          </button>
          <Link href={`/products/${product.slug}`} onClick={(e) => e.stopPropagation()}
            style={{ padding: '9px 12px', border: '1.5px solid rgba(26,40,16,0.22)', borderRadius: 10, color: 'rgba(26,40,16,0.70)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>
            More Info
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Mobile bar in lightbox ────────────────────────────────────────────────────

function MobileBar({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem } = useCartStore();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const image = product.images?.[0] ?? '';

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    try {
      await addItem({ productId: product._id, name: product.name, slug: product.slug, image, price: product.price, compareAtPrice: product.compareAtPrice, gstPercentage: product.gstPercentage ?? 0 });
      toast({ title: 'Added to cart', description: product.name });
    } catch { toast({ title: 'Could not add', variant: 'destructive' }); }
    finally { setAdding(false); }
  };

  return (
    <div className="lg:hidden absolute bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-3"
      style={{ background: 'rgba(10,18,8,0.92)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
      onClick={(e) => e.stopPropagation()}>
      {image && <div style={{ width: 34, height: 34, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}><Image src={image} alt={product.name} width={34} height={34} style={{ objectFit: 'cover', width: '100%', height: '100%' }} /></div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmt(product.price)}</p>
      </div>
      <button onClick={handleAdd} disabled={adding}
        style={{ padding: '7px 14px', borderRadius: 9, background: '#2d4a1e', color: '#fff', border: 'none', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}>
        <ShoppingCart style={{ width: 10, height: 10 }} />{adding ? 'Adding…' : 'Add to Cart'}
      </button>
      <Link href={`/products/${product.slug}`} onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
        More Info
      </Link>
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export default function HomeVideoSection() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ['products-all-videos'],
    queryFn: () => api.getProducts({ limit: 100, isActive: true }),
    staleTime: 5 * 60 * 1000,
  });

  const entries: VideoEntry[] = [];
  for (const product of data?.items ?? []) {
    const seen = new Set<string>();
    const urls = [product.videoUrl, ...(product.videos ?? [])]
      .filter((u): u is string => !!u && isVideoUrl(u) && !seen.has(u) && (seen.add(u), true));
    for (const url of urls) {
      entries.push({ parsed: parseVideo(url), product });
    }
  }

  if (entries.length === 0) return null;

  return (
    <>
      <div style={{ background: 'linear-gradient(180deg, #f0e8d8 0%, #ede5d5 100%)', borderTop: '1px solid rgba(160,112,16,0.12)', borderBottom: '1px solid rgba(160,112,16,0.12)' }}>
      <section
        className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8"
        style={{ paddingTop: 'clamp(32px, 5vw, 64px)', paddingBottom: 'clamp(32px, 5vw, 64px)' }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-end justify-between mb-6 sm:mb-8 gap-3"
        >
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(26,40,16,0.28)', marginBottom: 6 }}>
              Watch in Action
            </p>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem,3.5vw,2.2rem)', fontWeight: 700, color: '#1a2810', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              From Our Kitchen
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(26,40,16,0.5)', marginTop: 6, fontStyle: 'italic' }}>
              Real products, real process — tap any clip to watch
            </p>
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 100, background: 'rgba(160,112,16,0.09)', border: '1px solid rgba(160,112,16,0.18)', fontSize: 11, fontWeight: 600, color: '#8a6200', flexShrink: 0 }}>
            {entries.length} {entries.length === 1 ? 'video' : 'videos'}
          </div>
        </motion.div>

        {/* Scroll strip */}
        <div
          className="flex gap-3"
          style={{ overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', paddingBottom: 8 }}
        >
          {entries.map((entry, i) => (
            <div key={i} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
              <VideoCard entry={entry} index={i} onClick={() => setLightboxIndex(i)} />
            </div>
          ))}
        </div>

        <p className="sm:hidden mt-2 text-center" style={{ fontSize: 10, color: 'rgba(26,40,16,0.22)', letterSpacing: '0.06em' }}>
          Scroll to explore · Tap to play
        </p>
      </section>
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox entries={entries} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
