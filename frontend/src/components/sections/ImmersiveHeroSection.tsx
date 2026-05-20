'use client';

import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSiteSettings } from '@/lib/site-settings-context';

const ImmersiveHeroScene = dynamic(
  () => import('@/components/three/scenes/ImmersiveHeroScene').then(mod => mod.ImmersiveHeroScene),
  { ssr: false, loading: () => <div className="w-full h-full" /> },
);

const TRUST_STRIP = [
  { icon: '🌾', label: 'Native Sourcing' },
  { icon: '⚙️', label: 'Traditional Processing' },
  { icon: '🔬', label: '40+ Quality Checks' },
  { icon: '🚚', label: 'Free Shipping ₹499+' },
  { icon: '↩', label: 'Easy Returns' },
];

const STATS = [
  { num: '50k+', label: 'Happy Families' },
  { num: '100%', label: 'Natural · No Additives' },
  { num: '40+',  label: 'Lab Tests · Each Batch' },
];

export default function ImmersiveHeroSection() {
  const { banners } = useSiteSettings();
  const activeBanner = banners?.heroBanners?.find(b => b.isActive) ?? null;
  const headline = activeBanner?.headline || null;
  const subtitle = activeBanner?.subtitle || null;
  const ctaText  = activeBanner?.ctaText  || 'Shop Now';
  const ctaLink  = activeBanner?.ctaLink  || '/products';

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springX = useSpring(rawX, { stiffness: 60, damping: 18 });
  const springY = useSpring(rawY, { stiffness: 60, damping: 18 });
  const orb1X = useTransform(springX, v => v * -22);
  const orb1Y = useTransform(springY, v => v * -16);
  const orb2X = useTransform(springX, v => v * 26);
  const orb2Y = useTransform(springY, v => v * 20);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      rawX.set((e.clientX / window.innerWidth  - 0.5) * 2);
      rawY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [rawX, rawY]);

  const tp = (d: number) => ({ duration: 0.75, delay: d, ease: [0.22, 1, 0.36, 1] as const });

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: 'linear-gradient(145deg,#040e02 0%,#0c2a06 48%,#081a04 100%)',
        height: 'calc(100vh - 70px)',
        minHeight: 640,
      }}
    >
      {/* ── Atmospheric light shaft ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: '-10%', right: '-8%', width: '58%', height: '130%',
          background: 'linear-gradient(135deg,rgba(160,112,16,0.08) 0%,rgba(184,138,20,0.03) 40%,transparent 70%)',
          transform: 'skewX(-9deg)',
        }}
      />

      {/* ── Parallax glow orbs ── */}
      <motion.div aria-hidden className="pointer-events-none absolute rounded-full"
        style={{ top: '8%', right: '6%', width: 500, height: 500,
          background: 'radial-gradient(circle,rgba(160,112,16,0.11) 0%,transparent 68%)',
          filter: 'blur(88px)', x: orb1X, y: orb1Y }} />
      <motion.div aria-hidden className="pointer-events-none absolute rounded-full"
        style={{ bottom: '4%', left: '-6%', width: 420, height: 420,
          background: 'radial-gradient(circle,rgba(26,82,16,0.20) 0%,transparent 68%)',
          filter: 'blur(72px)', x: orb2X, y: orb2Y }} />

      {/* ── Grain overlay ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.80' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          opacity: 0.5, mixBlendMode: 'overlay',
        }} />

      {/* ── Banner bg overlay ── */}
      <AnimatePresence>
        {activeBanner?.imageUrl && (
          <motion.div key="banner-overlay" className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
          >
            <Image src={activeBanner.imageUrl} alt="" fill className="object-cover" priority style={{ opacity: 0.48 }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right,#040e02 0%,rgba(4,14,2,0.90) 28%,rgba(4,14,2,0.55) 55%,rgba(4,14,2,0.35) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(4,14,2,0.55) 0%,transparent 20%,transparent 80%,rgba(4,14,2,0.65) 100%)' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 3D canvas — full right half, truly full-height ── */}
      <motion.div
        className="absolute top-0 right-0 h-full hidden lg:block"
        style={{ width: '52%' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.2 }}
      >
        <ImmersiveHeroScene />
      </motion.div>

      {/* ── Left content ── */}
      <div className="relative z-10 h-full flex flex-col justify-between">
        <div className="flex-1 flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <motion.div
              className="lg:max-w-[48%] text-center lg:text-left"
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={tp(0.15)}
            >
              {/* Eyebrow pill */}
              <motion.div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
                style={{ background: 'rgba(160,112,16,0.14)', border: '1px solid rgba(160,112,16,0.28)' }}
                initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
                transition={tp(0.28)}
              >
                <span className="nl-pulse-dot w-1.5 h-1.5 rounded-full" style={{ background: '#b88a14', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#b88a14', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  New Launch — Cold Pressed Collection
                </span>
              </motion.div>

              {/* H1 */}
              <AnimatePresence mode="wait">
                {headline ? (
                  <motion.h1 key="banner-headline"
                    className="font-display font-bold leading-[1.06] mb-3"
                    style={{ fontSize: 'clamp(2.4rem,4.5vw,4.2rem)', letterSpacing: '-0.025em', color: '#fff' }}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    transition={tp(0.30)}
                  >{headline}</motion.h1>
                ) : (
                  <motion.h1 key="default-headline"
                    className="font-display font-bold leading-[1.06] mb-3"
                    style={{ fontSize: 'clamp(2.6rem,5vw,4.4rem)', letterSpacing: '-0.025em', color: '#fff' }}
                    initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    transition={tp(0.38)}
                  >
                    India&apos;s Purest<br />
                    <em style={{ fontStyle: 'italic', color: 'rgba(184,138,20,0.90)' }}>Traditional Oils</em>
                  </motion.h1>
                )}
              </AnimatePresence>

              {/* Sub-headline */}
              <AnimatePresence>
                {!headline && (
                  <motion.p key="default-sub"
                    className="font-display font-semibold mb-3"
                    style={{ fontSize: 'clamp(1.05rem,2.2vw,1.65rem)', fontStyle: 'italic', color: 'rgba(184,138,20,0.70)', letterSpacing: '-0.01em', lineHeight: 1.3 }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={tp(0.46)}
                  >&amp; Authentic A2 Ghee are Here!</motion.p>
                )}
              </AnimatePresence>

              {/* Body */}
              <AnimatePresence mode="wait">
                {subtitle ? (
                  <motion.p key="banner-subtitle" className="mb-2.5"
                    style={{ fontSize: 15, lineHeight: 1.72, color: 'rgba(255,255,255,0.58)', maxWidth: 460 }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={tp(0.44)}
                  >{subtitle}</motion.p>
                ) : (
                  <motion.p key="default-body" className="mb-2.5"
                    style={{ fontSize: 15, lineHeight: 1.72, color: 'rgba(255,255,255,0.52)', maxWidth: 440 }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={tp(0.52)}
                  >
                    Wood-Ghani pressed. Zero heat. Zero chemicals.
                    Preserving every drop of nutrition — from farm to your kitchen.
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Hindi tagline */}
              <motion.p className="mb-5"
                style={{ fontFamily: "'Noto Sans Devanagari', sans-serif", fontSize: 14.5, fontWeight: 600, color: 'rgba(184,138,20,0.65)' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tp(0.57)}
              >
                सेहत का वादा स्वाद के साथ..!
              </motion.p>

              {/* CTAs */}
              <motion.div
                className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-6"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={tp(0.62)}
              >
                <Link href={ctaLink}
                  className="inline-flex items-center justify-center gap-2 rounded-xl font-bold text-sm transition-all duration-220 hover:-translate-y-0.5 active:translate-y-0"
                  style={{ padding: '13px 28px', background: '#a07010', color: '#fff', boxShadow: '0 4px 26px -4px rgba(160,112,16,0.58)', fontSize: 14, letterSpacing: '0.015em' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#7a5408'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#a07010'; }}
                >
                  {ctaText} <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/about"
                  className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all duration-220 hover:bg-white/[0.14] active:scale-[0.98]"
                  style={{ padding: '13px 28px', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.78)', border: '1.5px solid rgba(255,255,255,0.16)', backdropFilter: 'blur(4px)', fontSize: 14 }}
                >
                  Our Story <ShieldCheck className="w-4 h-4" />
                </Link>
              </motion.div>

              {/* Stats */}
              <motion.div
                className="flex flex-wrap items-center gap-5 justify-center lg:justify-start"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tp(0.72)}
              >
                {STATS.map(({ num, label }, i) => (
                  <div key={num} className="flex items-center gap-5">
                    {i > 0 && <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.10)' }} />}
                    <div className="flex flex-col">
                      <span className="font-display font-bold" style={{ fontSize: 20, color: 'rgba(255,255,255,0.90)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{num}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.4 }}>{label}</span>
                    </div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* ── Trust strip ── */}
        <motion.div className="relative z-10"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.6 }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
              {TRUST_STRIP.map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.01em' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Scroll cue ── */}
      <motion.div
        className="absolute bottom-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
        initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: 1.5 }}
      >
        <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>Scroll</span>
        <motion.div animate={{ y: [0, 5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ color: 'rgba(255,255,255,0.40)', fontSize: 14 }}>↓</motion.div>
      </motion.div>
    </section>
  );
}
