'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, ChevronLeft, ChevronRight, ShoppingCart, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Product, ProductVariant } from '@/types';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';

// ─── Video URL Parser ──────────────────────────────────────────────────────────
interface ParsedVideo {
  url: string;
  embedUrl: string;
  thumbnail: string;
  type: 'youtube' | 'instagram' | 'vimeo' | 'other';
}

function parseVideo(url: string): ParsedVideo {
  const ytWatch = url.match(/(?:youtube\.com\/(?:watch\?(?:[^&]*&)*v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytWatch) {
    const id = ytWatch[1];
    return {
      url,
      embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0&modestbranding=1`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      type: 'youtube',
    };
  }
  const ytShorts = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (ytShorts) {
    const id = ytShorts[1];
    return {
      url,
      embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      type: 'youtube',
    };
  }
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) {
    return {
      url,
      embedUrl: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&color=a07010`,
      thumbnail: '',
      type: 'vimeo',
    };
  }
  const ig = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  if (ig) {
    return {
      url,
      embedUrl: `https://www.instagram.com/reel/${ig[1]}/embed/`,
      thumbnail: '',
      type: 'instagram',
    };
  }
  return { url, embedUrl: url, thumbnail: '', type: 'other' };
}

const formatPrice = (p: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p);

// ─── Product Info Strip (bottom of card) ──────────────────────────────────────
function ProductStrip({ product, variantSku }: { product: Product; variantSku?: string }) {
  const { addItem } = useCartStore();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const variant = variantSku
    ? product.variants.find((v) => v.sku === variantSku)
    : undefined;
  const price = variant?.price ?? product.price;
  const image = product.images?.[0] ?? '';

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    try {
      await addItem({
        productId: product._id,
        name: product.name,
        slug: product.slug,
        image,
        price,
        compareAtPrice: variant?.compareAtPrice ?? product.compareAtPrice,
        variantSku: variant?.sku,
        variantName: variant?.name,
        gstPercentage: product.gstPercentage ?? 0,
      });
      toast({ title: 'Added to cart', description: product.name });
    } catch {
      toast({ title: 'Could not add to cart', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        padding: '8px 10px 10px',
        borderRadius: '0 0 18px 18px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2">
        {image && (
          <div style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
            <Image src={image} alt={product.name} width={28} height={28} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 10, fontWeight: 700, color: '#1a2810', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {product.name}
          </p>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#7a5500', marginTop: 1 }}>{formatPrice(price)}</p>
        </div>
      </div>
      <button
        onClick={handleAdd}
        disabled={adding}
        style={{
          width: '100%', padding: '5px 0',
          background: adding ? '#5a7a3a' : '#2d4a1e',
          color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', cursor: adding ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}
      >
        <ShoppingCart style={{ width: 9, height: 9 }} />
        {adding ? 'Adding…' : 'Add to Cart'}
      </button>
    </div>
  );
}

// ─── Video Thumbnail Card ──────────────────────────────────────────────────────
function VideoCard({
  video,
  index,
  product,
  onClick,
}: {
  video: ParsedVideo;
  index: number;
  product?: Product;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative flex-shrink-0 group"
      style={{ width: 160, borderRadius: 18, overflow: 'hidden', aspectRatio: product ? '9/16' : '9/16', cursor: 'pointer' }}
      aria-label={`Play video ${index + 1}`}
    >
      {/* Thumbnail */}
      {video.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail}
          alt={`Video ${index + 1}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, hsl(${(index * 47 + 160) % 360}, 35%, 28%), hsl(${(index * 47 + 200) % 360}, 40%, 18%))`,
          }}
        />
      )}

      {/* Gradient overlay */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: product
            ? 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Play button */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: product ? '80px' : '0' }}>
        <div
          style={{
            width: 46, height: 46, borderRadius: '50%',
            background: 'rgba(255,255,255,0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          }}
          className="group-hover:scale-110 transition-transform duration-200"
        >
          <Play style={{ width: 18, height: 18, color: '#1a2810', marginLeft: 2 }} fill="#1a2810" />
        </div>
      </div>

      {/* Video number badge */}
      <div
        style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(160,112,16,0.85)',
          borderRadius: 6, padding: '2px 7px',
          fontSize: 9, fontWeight: 700, color: '#fff',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >
        #{index + 1}
      </div>

      {video.type === 'instagram' && (
        <div
          style={{
            position: 'absolute', bottom: product ? 90 : 10, right: 10,
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 100, padding: '3px 8px',
            fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 600,
          }}
        >
          Reel
        </div>
      )}

      {/* Product info strip */}
      {product && <ProductStrip product={product} />}
    </motion.button>
  );
}

// ─── Lightbox Product Panel ────────────────────────────────────────────────────
function ProductPanel({ product }: { product: Product }) {
  const { addItem } = useCartStore();
  const { toast } = useToast();
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    product.variants.length === 1 ? product.variants[0] : null
  );
  const [adding, setAdding] = useState(false);

  const activeVariant = selectedVariant;
  const price = activeVariant?.price ?? product.price;
  const compareAt = activeVariant?.compareAtPrice ?? product.compareAtPrice;
  const image = product.images?.[0] ?? '';

  const handleAdd = async () => {
    setAdding(true);
    try {
      await addItem({
        productId: product._id,
        name: product.name,
        slug: product.slug,
        image,
        price,
        compareAtPrice: compareAt,
        variantSku: activeVariant?.sku,
        variantName: activeVariant?.name,
        gstPercentage: product.gstPercentage ?? 0,
      });
      toast({ title: 'Added to cart', description: product.name });
    } catch {
      toast({ title: 'Could not add to cart', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="hidden lg:flex flex-col"
      style={{
        width: 280,
        flexShrink: 0,
        background: 'rgba(255,252,246,0.98)',
        borderRadius: 20,
        overflow: 'hidden',
        border: '1px solid rgba(200,150,12,0.15)',
        maxHeight: '80vh',
      }}
    >
      {/* Product image */}
      {image && (
        <div style={{ width: '100%', aspectRatio: '4/3', position: 'relative', flexShrink: 0, background: '#f5efe4' }}>
          <Image src={image} alt={product.name} fill style={{ objectFit: 'cover' }} />
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-y-auto p-4 gap-3" style={{ scrollbarWidth: 'none' }}>
        {/* Name + link */}
        <div className="flex items-start justify-between gap-2">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1a2810', lineHeight: 1.35, flex: 1 }}>
            {product.name}
          </p>
          <Link href={`/products/${product.slug}`} onClick={(e) => e.stopPropagation()}>
            <ExternalLink style={{ width: 14, height: 14, color: 'rgba(26,40,16,0.4)', flexShrink: 0, marginTop: 2 }} />
          </Link>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span style={{ fontSize: 18, fontWeight: 800, color: '#2d4a1e', fontFamily: 'Georgia, serif' }}>
            {formatPrice(price)}
          </span>
          {compareAt && compareAt > price && (
            <span style={{ fontSize: 12, color: 'rgba(26,40,16,0.35)', textDecoration: 'line-through' }}>
              {formatPrice(compareAt)}
            </span>
          )}
        </div>

        {/* Description */}
        {product.description && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(26,40,16,0.4)', marginBottom: 4 }}>
              Description
            </p>
            <div
              className="text-xs leading-relaxed line-clamp-4"
              style={{ color: 'rgba(26,40,16,0.65)', fontSize: 11 }}
              dangerouslySetInnerHTML={{
                __html: product.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220) + (product.description.length > 220 ? '…' : ''),
              }}
            />
          </div>
        )}

        {/* Variants */}
        {product.variants.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(26,40,16,0.4)', marginBottom: 6 }}>
              Size / Weight
            </p>
            <div className="flex flex-wrap gap-1.5">
              {product.variants.map((v) => (
                <button
                  key={v.sku}
                  onClick={(e) => { e.stopPropagation(); setSelectedVariant(v); }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 100,
                    fontSize: 10, fontWeight: 600,
                    border: selectedVariant?.sku === v.sku
                      ? '1.5px solid #2d4a1e'
                      : '1.5px solid rgba(26,40,16,0.18)',
                    background: selectedVariant?.sku === v.sku ? '#2d4a1e' : 'transparent',
                    color: selectedVariant?.sku === v.sku ? '#fff' : 'rgba(26,40,16,0.65)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex gap-2 mt-auto pt-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleAdd(); }}
            disabled={adding || (product.variants.length > 0 && !selectedVariant)}
            style={{
              flex: 1, padding: '9px 0',
              background: (adding || (product.variants.length > 0 && !selectedVariant)) ? '#5a7a3a' : '#2d4a1e',
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <ShoppingCart style={{ width: 10, height: 10 }} />
            {adding ? 'Adding…' : product.variants.length > 0 && !selectedVariant ? 'Select size' : 'Add to Cart'}
          </button>
          <Link
            href={`/products/${product.slug}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '9px 12px',
              border: '1.5px solid rgba(26,40,16,0.22)',
              borderRadius: 10, color: 'rgba(26,40,16,0.70)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', textDecoration: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            More Info
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function VideoLightbox({
  videos,
  initialIndex,
  product,
  onClose,
}: {
  videos: ParsedVideo[];
  initialIndex: number;
  product?: Product;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(initialIndex);

  const prev = useCallback(() => setCurrent((c) => (c - 1 + videos.length) % videos.length), [videos.length]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % videos.length), [videos.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const activeVideo = videos[current];
  const prevVideo = videos[(current - 1 + videos.length) % videos.length];
  const nextVideo = videos[(current + 1) % videos.length];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: 'rgba(5,12,4,0.95)', backdropFilter: 'blur(18px)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 flex items-center justify-center rounded-full transition-colors"
        style={{
          width: 40, height: 40, background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.15)', color: '#fff',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
      >
        <X size={18} />
      </button>

      {/* Counter */}
      <div
        className="absolute top-5 left-1/2 -translate-x-1/2"
        style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em' }}
      >
        {current + 1} / {videos.length}
      </div>

      {/* Main layout */}
      <div
        className="relative flex items-center justify-center gap-4 w-full h-full px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev thumbnail */}
        {videos.length > 1 && (
          <motion.button
            onClick={prev}
            whileTap={{ scale: 0.95 }}
            className="hidden sm:block relative flex-shrink-0"
            style={{
              width: 90, aspectRatio: '9/16', borderRadius: 14, overflow: 'hidden',
              opacity: 0.4, transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.65')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.4')}
          >
            {prevVideo.thumbnail
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={prevVideo.thumbnail} alt="Previous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#1a2810' }} />
            }
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={24} color="rgba(255,255,255,0.7)" />
            </div>
          </motion.button>
        )}

        {/* Main video */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            style={{
              position: 'relative', flexShrink: 0,
              width: 'min(320px, calc(100vw - 48px))',
              aspectRatio: '9/16',
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <iframe
              src={activeVideo.embedUrl}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={`Video ${current + 1}`}
            />
          </motion.div>
        </AnimatePresence>

        {/* Product panel (right side, desktop only) */}
        {product && <ProductPanel product={product} />}

        {/* Next thumbnail (only if no product panel or on smaller screens) */}
        {videos.length > 1 && (
          <motion.button
            onClick={next}
            whileTap={{ scale: 0.95 }}
            className={product ? 'hidden xl:block' : 'hidden sm:block'}
            style={{
              width: 90, aspectRatio: '9/16', borderRadius: 14, overflow: 'hidden',
              opacity: 0.4, transition: 'opacity 0.2s', flexShrink: 0,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.65')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.4')}
          >
            {nextVideo.thumbnail
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={nextVideo.thumbnail} alt="Next" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: '#1a2810' }} />
            }
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={24} color="rgba(255,255,255,0.7)" />
            </div>
          </motion.button>
        )}
      </div>

      {/* Mobile: bottom bar with product add to cart */}
      {product && (
        <MobileProductBar product={product} onClose={onClose} />
      )}

      {/* Mobile nav arrows */}
      {videos.length > 1 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:hidden" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={prev}
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1.5">
            {videos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                style={{
                  width: i === current ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === current ? '#a07010' : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.25s ease', border: 'none', cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <button
            onClick={next}
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Desktop arrow buttons */}
      {videos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 items-center justify-center"
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 items-center justify-center"
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}
    </motion.div>
  );
}

// ─── Mobile product bar (inside lightbox) ─────────────────────────────────────
function MobileProductBar({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem } = useCartStore();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const price = product.price;
  const image = product.images?.[0] ?? '';

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    try {
      await addItem({
        productId: product._id,
        name: product.name,
        slug: product.slug,
        image,
        price,
        compareAtPrice: product.compareAtPrice,
        gstPercentage: product.gstPercentage ?? 0,
      });
      toast({ title: 'Added to cart', description: product.name });
    } catch {
      toast({ title: 'Could not add to cart', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="lg:hidden absolute bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-3"
      style={{ background: 'rgba(10,18,8,0.9)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {image && (
        <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          <Image src={image} alt={product.name} width={36} height={36} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{formatPrice(price)}</p>
      </div>
      <button
        onClick={handleAdd}
        disabled={adding}
        style={{
          padding: '8px 16px', borderRadius: 10,
          background: '#2d4a1e', color: '#fff', border: 'none',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flexShrink: 0,
        }}
      >
        <ShoppingCart style={{ width: 11, height: 11 }} />
        {adding ? 'Adding…' : 'Add to Cart'}
      </button>
      <Link
        href={`/products/${product.slug}`}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          padding: '8px 12px', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)',
          fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
        }}
      >
        More Info
      </Link>
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────
export function ProductVideoSection({ videos, product }: { videos: string[]; product?: Product }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const parsedVideos = videos.map(parseVideo);

  if (!videos.length) return null;

  return (
    <>
      <section className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(26,40,16,0.30)', marginBottom: 4 }}>
              Watch in Action
            </p>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 700, color: '#1a2810', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Product Videos
            </h2>
          </div>
          <div
            style={{ padding: '5px 12px', borderRadius: 100, background: 'rgba(160,112,16,0.09)', border: '1px solid rgba(160,112,16,0.18)', fontSize: 11, fontWeight: 600, color: '#8a6200' }}
          >
            {videos.length} {videos.length === 1 ? 'video' : 'videos'}
          </div>
        </motion.div>

        {/* Horizontal reel strip — extends to viewport edge on mobile */}
        <div
          className="flex gap-3 -mx-4 px-4 sm:mx-0 sm:px-0"
          style={{
            overflowX: 'auto', scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
            msOverflowStyle: 'none', paddingBottom: 8, paddingRight: 16,
          }}
        >
          {parsedVideos.map((video, i) => (
            <div key={i} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
              <VideoCard video={video} index={i} product={product} onClick={() => setLightboxIndex(i)} />
            </div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="sm:hidden mt-1 text-center"
          style={{ fontSize: 10, color: 'rgba(26,40,16,0.25)', letterSpacing: '0.06em' }}
        >
          Tap any video to watch
        </motion.p>
      </section>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <VideoLightbox
            videos={parsedVideos}
            initialIndex={lightboxIndex}
            product={product}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
