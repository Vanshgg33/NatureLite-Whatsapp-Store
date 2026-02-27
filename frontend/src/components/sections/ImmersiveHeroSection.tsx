'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Leaf, ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSiteSettings } from '@/lib/site-settings-context';

const ImmersiveHeroScene = dynamic(
  () => import('@/components/three/scenes/ImmersiveHeroScene').then(mod => mod.ImmersiveHeroScene),
  { ssr: false, loading: () => <div className="w-full h-full bg-brand-cream rounded-3xl animate-pulse" /> }
);

export default function ImmersiveHeroSection() {
  const { banners } = useSiteSettings();
  const activeBanner = banners?.heroBanners?.find(b => b.isActive) ?? null;

  return (
    <section className="relative bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-4 items-center min-h-[calc(100vh-80px)] py-12 lg:py-0">

          {/* Left — Text content */}
          <motion.div
            className="order-2 lg:order-1 text-center lg:text-left"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-green/10 border border-brand-green/20 mb-6">
              <Leaf className="w-4 h-4 text-brand-green" />
              <span className="text-sm text-brand-green font-medium">100% Certified Organic</span>
            </div>

            {/* Headline */}
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-brand-charcoal leading-[1.1] mb-5">
              {activeBanner ? (
                activeBanner.headline
              ) : (
                <>
                  Pure Nature,
                  <br />
                  <span className="text-brand-green">Delivered Fresh</span>
                </>
              )}
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-brand-muted max-w-lg mb-8 mx-auto lg:mx-0">
              {activeBanner?.subtitle ||
                'Join 50,000+ families who choose purity over compromise. Handpicked organic superfoods, delivered fresh to your doorstep.'}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8">
              <Link
                href={activeBanner?.ctaLink || '/products'}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-brand-green text-white rounded-full text-base font-semibold hover:bg-brand-green-light transition-colors shadow-sm"
              >
                {activeBanner?.ctaText || 'Shop Now'}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border-2 border-brand-charcoal/15 text-brand-charcoal rounded-full text-base font-semibold hover:bg-brand-cream transition-colors"
              >
                Our Story
                <Leaf className="w-4 h-4" />
              </Link>
            </div>

            {/* Trust stats */}
            <div className="flex items-center gap-5 text-brand-muted text-sm justify-center lg:justify-start">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-green" />
                <span>50k+ families</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-mustard" />
                <span>500+ products</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-terracotta" />
                <span>100% organic</span>
              </div>
            </div>
          </motion.div>

          {/* Right — Banner image or 3D Model */}
          <motion.div
            className="order-1 lg:order-2 relative"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <div className="relative w-full aspect-square max-w-[500px] mx-auto lg:max-w-none">
              {activeBanner?.imageUrl ? (
                <div className="relative w-full h-full rounded-3xl overflow-hidden">
                  <img
                    src={activeBanner.imageUrl}
                    alt={activeBanner.headline}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <>
                  {/* Soft glow behind bottle */}
                  <div className="absolute inset-[10%] rounded-full bg-brand-green/8 blur-3xl" />
                  <div className="absolute inset-[20%] rounded-full bg-brand-mustard/6 blur-2xl" />

                  {/* 3D Canvas */}
                  <div className="relative w-full h-full">
                    <ImmersiveHeroScene />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        <span className="text-brand-muted text-xs tracking-widest uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="w-4 h-4 text-brand-muted" />
        </motion.div>
      </motion.div>
    </section>
  );
}
