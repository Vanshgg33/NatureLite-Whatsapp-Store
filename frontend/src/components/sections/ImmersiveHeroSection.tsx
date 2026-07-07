'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useSiteSettings } from '@/lib/site-settings-context';
import { Magnetic } from '@/components/ui/magnetic';

const IMAGE_DURATION = 5000;

export default function ImmersiveHeroSection() {
  const { banners } = useSiteSettings();
  const activeBanners = banners?.heroBanners?.filter(b => b.isActive) ?? [];
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const next = () => setIndex(i => (i + 1) % activeBanners.length);

  // For image banners: advance after IMAGE_DURATION
  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const current = activeBanners[index];
    if (!current?.videoUrl) {
      timerRef.current = setTimeout(next, IMAGE_DURATION);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [index, activeBanners.length]);

  /* ── No banner configured ── */
  if (activeBanners.length === 0) {
    const ctaLink = '/products';
    const ctaText = 'Shop Now';
    return (
      <section
        className="relative flex items-center justify-center"
        style={{
          minHeight: 320,
          background: 'linear-gradient(135deg,#e8dcc8 0%,#f0e8d5 40%,#e0d4b8 100%)',
        }}
      >
        <div className="text-center px-6 py-16">
          <h1
            style={{
              fontSize: 'clamp(2rem,5vw,3.6rem)',
              fontWeight: 900,
              color: '#1a2e12',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
              lineHeight: 1.1,
            }}
          >
            Natural Goodness,<br />Healthy Living.
          </h1>
          <p style={{ fontSize: 15, color: '#4a5240', marginTop: 12, marginBottom: 24 }}>
            🌿 Pure · Natural · Nourishing 🌿
          </p>
          <Magnetic strength={0.35}>
            <Link
              href={ctaLink}
              data-cursor="SHOP"
              className="inline-flex items-center justify-center rounded-xl font-bold transition-all hover:-translate-y-0.5"
              style={{
                padding: '13px 32px', fontSize: 14,
                background: '#2d6a3f', color: '#fff',
                boxShadow: '0 4px 20px -4px rgba(45,106,63,0.55)',
              }}
            >
              {ctaText}
            </Link>
          </Magnetic>
        </div>
      </section>
    );
  }

  const banner = activeBanners[index];

  return (
    <div
      className="relative w-full overflow-hidden h-[52vh] sm:h-[62vh] md:h-[70vh]"
      style={{ minHeight: 220 }}
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={banner.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          {banner.videoUrl ? (
            <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
              <video
                src={banner.videoUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                onEnded={activeBanners.length > 1 ? next : undefined}
              />
            </div>
          ) : (
            <Image
              src={banner.imageUrl}
              alt={banner.headline || ''}
              fill
              priority={index === 0}
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Dot indicators — only when multiple banners */}
      {activeBanners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {activeBanners.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="p-2.5 flex items-center justify-center"
            >
              <span
                className="block rounded-full transition-all duration-200"
                style={{
                  width: i === index ? 20 : 8,
                  height: 8,
                  background: i === index ? '#fff' : 'rgba(255,255,255,0.45)',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
