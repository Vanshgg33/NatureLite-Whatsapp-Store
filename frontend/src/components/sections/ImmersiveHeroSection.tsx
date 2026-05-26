'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSiteSettings } from '@/lib/site-settings-context';
import { Magnetic } from '@/components/ui/magnetic';

export default function ImmersiveHeroSection() {
  const { banners } = useSiteSettings();
  const activeBanner = banners?.heroBanners?.find(b => b.isActive) ?? null;
  const ctaLink = activeBanner?.ctaLink || '/products';
  const ctaText = activeBanner?.ctaText || 'Shop Now';

  /* ── No banner configured ── */
  if (!activeBanner?.imageUrl) {
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

  /* ── Banner image: natural dimensions, no cropping ── */
  return (
    <motion.section
      className="relative w-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <Image
        src={activeBanner.imageUrl}
        alt={activeBanner.headline || 'Nature Lite Foods'}
        width={1920}
        height={680}
        priority
        sizes="100vw"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
    </motion.section>
  );
}
