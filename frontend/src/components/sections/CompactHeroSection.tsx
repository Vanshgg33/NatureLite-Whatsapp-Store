'use client';

import { useSiteSettings } from '@/lib/site-settings-context';
import { useEffect, useMemo, useState } from 'react';

/**
 * Hero banner: full-width image only (no text). Set from Admin → Appearance → Hero Banners.
 */
export default function CompactHeroSection() {
  const { banners } = useSiteSettings();
  const activeBanners = useMemo(
    () => (banners?.heroBanners || []).filter((b) => b.isActive && b.imageUrl),
    [banners?.heroBanners],
  );

  const [currentIndex, setCurrentIndex] = useState(0);

  const count = activeBanners.length;

  // Reset index when banner set changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [count]);

  // Simple rotation between active banners
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % count);
    }, 6000); // 6s per banner
    return () => clearInterval(id);
  }, [count]);

  const currentBanner = activeBanners[currentIndex];
  const hasBgImage = Boolean(currentBanner?.imageUrl);

  return (
    <section
      className="relative border-b border-brand-border/50 min-h-[16rem] sm:min-h-[20rem] lg:min-h-[22rem] flex flex-col justify-center overflow-hidden bg-white"
      style={
        hasBgImage
          ? {
              backgroundImage: `url(${currentBanner!.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
      aria-label={hasBgImage ? 'Promotional banner' : 'Hero section'}
    />
  );
}
