'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';

import { api } from '@/lib/api';
import { Product } from '@/types';

import ImmersiveHeroSection from '@/components/sections/ImmersiveHeroSection';
import QuickOrderBanner from '@/components/ecommerce/quick-order-banner';
import HomeShopSection, { CircularCategoryOrbit } from '@/components/sections/HomeShopSection';
import FeaturedProductsSection from '@/components/sections/FeaturedProductsSection';
import SocialProofSection from '@/components/sections/SocialProofSection';
import RecencyBlock from '@/components/sections/RecencyBlock';
import HomeVideoSection from '@/components/sections/HomeVideoSection';
import { NewsletterSection } from '@/components/ecommerce/newsletter-section';
import { MarqueeTicker } from '@/components/ui/marquee-ticker';
import WhatsAppStrip from '@/components/ecommerce/whatsapp-strip';
import { MapPin } from 'lucide-react';

const LOADER_DURATION = 300;

// ─── Loading Screen ───────────────────────────────────────────────────────────

const PHRASES = [
  'Ancient stones, still turning.',
  'Every drop uncompromised.',
  'Wood-pressed. Zero chemicals.',
  'The old way is the right way.',
];

const SEED_GRADIENTS = [
  'radial-gradient(ellipse at 35% 28%, #d4a464, #6B4018)',
  'radial-gradient(ellipse at 40% 25%, #c89852, #5A3010)',
  'radial-gradient(ellipse at 30% 32%, #deb870, #7A4C1E)',
  'radial-gradient(ellipse at 38% 22%, #b87840, #4A2A0E)',
];

const SEEDS_V2 = [
  { x: 134, w: 10, h: 6,  top: 22, delay: 0,    dur: 1.75 },
  { x: 150, w: 14, h: 9,  top: 28, delay: 0.55, dur: 2.05 },
  { x: 162, w: 12, h: 7,  top: 24, delay: 1.10, dur: 1.85 },
  { x: 173, w: 15, h: 9,  top: 30, delay: 0.28, dur: 2.10 },
  { x: 184, w: 11, h: 7,  top: 22, delay: 1.62, dur: 1.90 },
  { x: 196, w: 13, h: 8,  top: 26, delay: 0.82, dur: 2.00 },
  { x: 208, w: 10, h: 6,  top: 28, delay: 2.22, dur: 1.80 },
  { x: 142, w: 13, h: 8,  top: 24, delay: 1.88, dur: 2.20 },
  { x: 169, w: 15, h: 9,  top: 30, delay: 2.70, dur: 1.95 },
  { x: 191, w: 11, h: 7,  top: 22, delay: 3.30, dur: 2.05 },
  { x: 156, w: 12, h: 7,  top: 26, delay: 3.80, dur: 1.80 },
  { x: 203, w:  9, h: 5,  top: 24, delay: 4.40, dur: 2.10 },
  { x: 140, w: 11, h: 6,  top: 28, delay: 5.08, dur: 1.90 },
  { x: 178, w: 14, h: 8,  top: 30, delay: 4.82, dur: 2.00 },
];

const DROPS_V2 = [
  { delay: 0.3 }, { delay: 1.0 }, { delay: 1.7 },
  { delay: 2.4 }, { delay: 3.1 }, { delay: 3.8 },
];

const MOTES = [
  { x: 148, y: 120, dx: -14, delay: 0,    dur: 3.2, size: 2.0 },
  { x: 164, y: 130, dx:   9, delay: 0.4,  dur: 3.0, size: 1.5 },
  { x: 155, y: 114, dx:  16, delay: 0.8,  dur: 3.5, size: 2.0 },
  { x: 182, y: 125, dx:  -8, delay: 1.2,  dur: 3.1, size: 1.5 },
  { x: 141, y: 135, dx:  18, delay: 1.6,  dur: 3.4, size: 1.0 },
  { x: 172, y: 119, dx: -17, delay: 2.0,  dur: 3.0, size: 2.0 },
  { x: 158, y: 127, dx:  11, delay: 2.4,  dur: 3.3, size: 1.5 },
  { x: 145, y: 116, dx:  -7, delay: 2.8,  dur: 3.6, size: 1.0 },
  { x: 179, y: 133, dx:  13, delay: 0.2,  dur: 3.1, size: 2.0 },
  { x: 151, y: 122, dx: -18, delay: 0.6,  dur: 3.4, size: 1.0 },
  { x: 168, y: 115, dx:   6, delay: 1.0,  dur: 2.9, size: 1.5 },
  { x: 140, y: 139, dx:  -9, delay: 1.4,  dur: 3.7, size: 1.0 },
];

function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [exiting,    setExiting]   = useState(false);
  const [phraseIdx,  setPhraseIdx] = useState(0);
  const [sceneScale, setSceneScale] = useState(1);
  const barRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setSceneScale(Math.min(1, (window.innerWidth * 0.88) / 360));
  }, []);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / LOADER_DURATION);
      const pct = Math.round(p * 100);
      if (barRef.current) barRef.current.style.width = `${pct}%`;
      if (pctRef.current) pctRef.current.textContent = `${pct}%`;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const t1 = setTimeout(() => setExiting(true), LOADER_DURATION + 100);
    const t2 = setTimeout(onDone, LOADER_DURATION + 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  useEffect(() => {
    const t = setInterval(() => setPhraseIdx(i => (i + 1) % PHRASES.length), 1900);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(168deg, #020a02 0%, #041003 40%, #060c02 100%)',
        transition: exiting ? 'opacity 0.3s ease-out' : undefined,
        opacity: exiting ? 0 : 1,
        pointerEvents: exiting ? 'none' : undefined,
      }}
    >
      {/* ── Film grain ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: '-50%', width: '200%', height: '200%',
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.90' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.10 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          opacity: 0.55, mixBlendMode: 'overlay' as const,
          animation: 'nl2-grain-drift 0.32s steps(1) infinite',
        }} />
      </div>

      {/* ── Warm amber glow (machine area) ── */}
      <div className="pointer-events-none absolute" style={{
        top: '26%', left: '50%', transform: 'translateX(-50%)',
        width: 440, height: 360,
        background: 'radial-gradient(ellipse, rgba(155,78,6,0.16) 0%, rgba(90,44,4,0.07) 42%, transparent 70%)',
        filter: 'blur(24px)',
      }} />

      {/* ── Edge vignette ── */}
      <div className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.70) 100%)' }} />

      {/* ── All content above overlays ── */}
      <div className="relative flex flex-col items-center" style={{ zIndex: 1 }}>

        {/* Eyebrow */}
        <p style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: 'rgba(210,168,60,0.90)', marginBottom: 10 }}>
          Est. Traditional Methods
        </p>

        {/* Brand name */}
        <h1 style={{
          fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
          fontSize: 30, fontWeight: 700, color: 'rgba(245,228,195,0.95)',
          letterSpacing: '-0.01em', marginBottom: 4,
          animation: 'nl2-brand-glow 3.4s ease-in-out infinite',
        }}>
          Nature Lite Foods
        </h1>

        {/* Gold divider */}
        <div style={{
          width: 48, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(200,146,10,0.52), transparent)',
          marginBottom: 22,
        }} />

        {/* ── Press scene (360 × 295, scales down on small phones) ── */}
        <div style={{ position: 'relative', width: 360 * sceneScale, height: 295 * sceneScale, marginBottom: 18, flexShrink: 0 }}>
        <div style={{ position: 'absolute', width: 360, height: 295, transformOrigin: 'top left', transform: `scale(${sceneScale})` }}>

          {/* Seeds falling into hopper */}
          {SEEDS_V2.map((s, i) => (
            <div key={i} style={{
              position: 'absolute',
              top: s.top,
              left: s.x,
              width: s.w,
              height: s.h,
              borderRadius: '50%',
              background: SEED_GRADIENTS[i % SEED_GRADIENTS.length],
              boxShadow: `inset -1px -1px 2px rgba(0,0,0,0.45), 0 1px ${s.w > 12 ? 5 : 3}px rgba(0,0,0,${s.w > 12 ? '0.35' : '0.22'})`,
              animation: `nl2-seed-fall ${s.dur}s ${s.delay}s ease-in infinite`,
            }} />
          ))}

          {/* Dust motes */}
          {MOTES.map((m, i) => (
            <div key={i} style={{
              position: 'absolute', top: m.y, left: m.x,
              width: m.size, height: m.size, borderRadius: '50%',
              background: 'rgba(222,162,22,0.80)',
              boxShadow: `0 0 ${m.size * 2.5}px rgba(200,140,10,0.65)`,
              animation: `nl2-mote-rise ${m.dur}s ${m.delay}s ease-out infinite`,
              '--mote-x': `${m.dx}px`,
            } as React.CSSProperties} />
          ))}

          {/* ── Ghani machine ── */}
          <svg width="200" height="228" viewBox="0 0 200 228"
            style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 36,
              overflow: 'visible',
              animation: 'nl2-machine-warmth 2.8s ease-in-out infinite',
            }}
          >
            <defs>
              <radialGradient id="nlWoodBody" cx="26%" cy="38%" r="80%" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="228">
                <stop offset="0%"   stopColor="#6B3A20"/>
                <stop offset="52%"  stopColor="#4A2210"/>
                <stop offset="100%" stopColor="#2A1006"/>
              </radialGradient>
              <radialGradient id="nlGrindLight" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="rgba(235,152,12,0.50)"/>
                <stop offset="65%"  stopColor="rgba(180,100,8,0.14)"/>
                <stop offset="100%" stopColor="rgba(160,80,6,0)"/>
              </radialGradient>
            </defs>

            {/* Ground shadow */}
            <ellipse cx="94" cy="220" rx="70" ry="17" fill="rgba(0,0,0,0.55)"/>

            {/* Body back/shadow layer */}
            <rect x="22" y="64" width="152" height="116" rx="16" fill="#140802"/>

            {/* ── Push arm — behind machine body so drum face masks it naturally ── */}
            <g style={{ transformOrigin: '168px 95px', animation: 'nl-press-rotate 3.3s linear infinite' }}>
              <rect x="158" y="89" width="118" height="13" rx="6.5" fill="#140800"/>
              <rect x="160" y="90" width="114" height="10" rx="5"   fill="#3A1C0A"/>
              <rect x="163" y="91" width="108" height="3"  rx="1.5" fill="rgba(138,78,20,0.28)"/>
              <circle cx="272" cy="95" r="17" fill="#140800"/>
              <circle cx="272" cy="95" r="14" fill="#2C1208"/>
              <circle cx="269" cy="92" r="6"  fill="rgba(75,38,10,0.38)"/>
              <circle cx="272" cy="95" r="14" fill="none" stroke="rgba(98,52,14,0.24)" strokeWidth="1.5"/>
              <circle cx="272" cy="95" r="8"  fill="none" stroke="rgba(118,65,18,0.14)" strokeWidth="1"/>
            </g>

            {/* Main body */}
            <rect x="18" y="60" width="150" height="118" rx="16" fill="url(#nlWoodBody)"/>

            {/* Left-side warm fill from oil glow */}
            <rect x="18" y="60" width="52" height="118" rx="16" fill="rgba(175,95,10,0.06)"/>

            {/* Top rim */}
            <ellipse cx="93" cy="60" rx="75" ry="20" fill="#5A2E14"/>
            <ellipse cx="93" cy="58" rx="68" ry="17" fill="#7A3E22"/>
            {/* Rim highlight */}
            <ellipse cx="82" cy="54" rx="50" ry="10" fill="rgba(200,130,55,0.16)"/>

            {/* Hopper void */}
            <ellipse cx="93" cy="55" rx="44" ry="14" fill="#060200"/>
            <ellipse cx="90" cy="53" rx="32" ry="10" fill="#030100"/>

            {/* ── Grinding glow (amber pulse from press) ── */}
            <ellipse cx="93" cy="62" rx="38" ry="13"
              fill="url(#nlGrindLight)"
              style={{ animation: 'nl2-grind-glow 2.0s ease-in-out infinite' }}/>
            <ellipse cx="93" cy="60" rx="56" ry="19"
              fill="none" stroke="rgba(220,140,10,0.06)" strokeWidth="16"
              style={{ animation: 'nl2-grind-glow 2.7s ease-in-out infinite 0.55s' }}/>

            {/* Wood grain */}
            <line x1="34"  y1="70" x2="34"  y2="168" stroke="rgba(255,180,70,0.048)" strokeWidth="2.5"/>
            <line x1="54"  y1="69" x2="54"  y2="170" stroke="rgba(255,180,70,0.030)" strokeWidth="2"/>
            <line x1="78"  y1="69" x2="78"  y2="172" stroke="rgba(255,180,70,0.026)" strokeWidth="1.5"/>
            <line x1="108" y1="69" x2="108" y2="172" stroke="rgba(255,180,70,0.022)" strokeWidth="1.5"/>
            <line x1="134" y1="69" x2="134" y2="170" stroke="rgba(255,180,70,0.030)" strokeWidth="2"/>
            <line x1="154" y1="70" x2="154" y2="168" stroke="rgba(255,180,70,0.048)" strokeWidth="2.5"/>

            {/* Base */}
            <ellipse cx="93" cy="178" rx="75" ry="20" fill="#381808"/>
            <ellipse cx="93" cy="176" rx="62" ry="14" fill="#280e04"/>

            {/* Stone pestle ring (visible in dark hopper) */}
            <circle cx="93" cy="70" r="26" fill="none" stroke="rgba(195,132,38,0.20)" strokeWidth="3"/>
            <circle cx="93" cy="70" r="12" fill="rgba(195,132,38,0.08)" stroke="rgba(205,142,38,0.16)" strokeWidth="2"/>
            {/* Hot centre point */}
            <circle cx="93" cy="70" r="4.5" fill="rgba(228,155,20,0.28)"
              style={{ animation: 'nl2-grind-glow 1.6s ease-in-out infinite 0.2s' }}/>

            {/* Arm pivot socket — static, always on top */}
            <circle cx="168" cy="95" r="8"   fill="#0e0400" stroke="rgba(138,78,20,0.42)" strokeWidth="1.5"/>
            <circle cx="168" cy="95" r="4"   fill="#060100"/>

            {/* ── Spout ── */}
            <path d="M 152 116 L 175 128 L 177 156 L 154 153 Z" fill="#1A0802"/>
            <path d="M 150 114 L 173 126 L 175 154 L 152 151 Z" fill="#3A1A08"/>
            <ellipse cx="163" cy="126" rx="13" ry="6.5" fill="#4A2410" opacity="0.88"/>
            <ellipse cx="164" cy="152" rx="13" ry="5.5" fill="#0e0400" opacity="0.97"/>

            {/* Spout exit glow */}
            <ellipse cx="168" cy="155" rx="11" ry="5.5"
              fill="rgba(205,132,10,0.30)"
              style={{ animation: 'nl2-grind-glow 1.5s ease-in-out infinite 0.15s' }}/>

            {/* Oil stream */}
            <path d="M 172 155 Q 174 165 172 174"
              stroke="rgba(205,148,10,0.90)" strokeWidth="4.5" fill="none" strokeLinecap="round"
              style={{ animation: 'nl2-oil-stream 1.05s ease-in-out infinite', transformOrigin: '172px 155px' }}/>
            <path d="M 175 157 Q 177 167 175 176"
              stroke="rgba(245,188,62,0.46)" strokeWidth="2" fill="none" strokeLinecap="round"
              style={{ animation: 'nl2-oil-stream 1.3s ease-in-out infinite 0.28s', transformOrigin: '175px 157px' }}/>
          </svg>

          {/* ── Oil drops into bottle ── */}
          {DROPS_V2.map((d, i) => (
            <div key={i} style={{
              position: 'absolute', top: 203, left: 240,
              width: 7, height: 11,
              borderRadius: '50% 50% 60% 60%',
              background: 'linear-gradient(to bottom, rgba(255,210,80,0.97), rgba(185,115,8,0.97))',
              boxShadow: '0 0 8px rgba(210,155,12,0.62), 0 0 18px rgba(210,155,12,0.26)',
              animation: `nl2-drop-into-bottle 1.55s ${d.delay}s ease-in infinite`,
            }} />
          ))}

          {/* ── Glass bottle ── */}
          <svg width="60" height="82" viewBox="0 0 60 82"
            style={{
              position: 'absolute', left: 214, top: 208,
              overflow: 'visible',
              animation: 'nl2-bottle-glow 2.6s ease-in-out infinite',
            }}
          >
            <defs>
              <linearGradient id="nlBottleOilV" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#FFD060" stopOpacity="0.95"/>
                <stop offset="50%"  stopColor="#C8920A" stopOpacity="0.97"/>
                <stop offset="100%" stopColor="#6A3A04" stopOpacity="1"/>
              </linearGradient>
              <clipPath id="nlBottleBodyClip">
                <rect x="7" y="21" width="46" height="54" rx="9"/>
              </clipPath>
              <clipPath id="nlBottleNeckClip">
                <polygon points="22,7 38,7 44,21 16,21"/>
              </clipPath>
            </defs>

            {/* Ground shadow */}
            <ellipse cx="30" cy="79" rx="24" ry="4.5" fill="rgba(0,0,0,0.50)"/>

            {/* Body depth layer */}
            <rect x="9" y="23" width="46" height="54" rx="9" fill="rgba(50,22,4,0.65)"/>

            {/* Body glass */}
            <rect x="7" y="21" width="46" height="54" rx="9"
              fill="rgba(88,44,6,0.20)"
              stroke="rgba(190,120,18,0.32)" strokeWidth="1.5"/>

            {/* Oil fill — rises from empty to ~70% */}
            <g clipPath="url(#nlBottleBodyClip)">
              <rect x="7" y="21" width="46" height="54"
                fill="url(#nlBottleOilV)"
                style={{ animation: 'nl2-bottle-fill 4.2s ease-in-out infinite' }}
              />
            </g>

            {/* Neck */}
            <polygon points="22,7 38,7 44,21 16,21"
              fill="rgba(72,36,5,0.42)" stroke="rgba(185,115,15,0.24)" strokeWidth="1"/>

            {/* Neck oil fill (when bottle nears full) */}
            <g clipPath="url(#nlBottleNeckClip)">
              <rect x="15" y="7" width="30" height="14"
                fill="rgba(210,148,18,0.72)"
                style={{ animation: 'nl2-bottle-neck-fill 4.2s ease-in-out infinite' }}
              />
            </g>

            {/* Left glass sheen */}
            <rect x="10" y="24" width="7" height="48" rx="3.5" fill="rgba(255,185,75,0.14)"/>
            <rect x="11" y="28" width="3" height="40" rx="1.5" fill="rgba(255,220,150,0.11)"/>

            {/* Right edge shadow */}
            <rect x="47" y="24" width="5" height="48" rx="3" fill="rgba(0,0,0,0.22)"/>

            {/* Label area */}
            <rect x="14" y="35" width="32" height="28" rx="4"
              fill="rgba(255,200,80,0.03)" stroke="rgba(200,145,35,0.13)" strokeWidth="0.75"/>
            <line x1="18" y1="44" x2="42" y2="44" stroke="rgba(200,145,35,0.18)" strokeWidth="0.75"/>
            <line x1="21" y1="50" x2="39" y2="50" stroke="rgba(200,145,35,0.12)" strokeWidth="0.5"/>
            <line x1="23" y1="56" x2="37" y2="56" stroke="rgba(200,145,35,0.10)" strokeWidth="0.5"/>

            {/* Glass glint — catches light periodically */}
            <line x1="11" y1="23" x2="21" y2="37"
              stroke="rgba(255,235,185,0.60)" strokeWidth="1.5" strokeLinecap="round"
              style={{ animation: 'nl2-bottle-glint 4.0s ease-in-out infinite' }}/>
            <line x1="13" y1="23" x2="20" y2="33"
              stroke="rgba(255,240,205,0.32)" strokeWidth="1" strokeLinecap="round"
              style={{ animation: 'nl2-bottle-glint 4.0s ease-in-out infinite 0.18s' }}/>

            {/* Cork */}
            <rect x="19" y="0" width="22" height="8" rx="3" fill="#3A1A06"/>
            <rect x="21" y="1" width="18" height="5" rx="2" fill="#5A2A10"/>
            <rect x="22" y="1.5" width="12" height="2" rx="1" fill="rgba(120,65,18,0.38)"/>
            <rect x="18" y="6" width="24" height="3" rx="1.5" fill="#1C0802" opacity="0.80"/>

            {/* Neck left edge catch-light */}
            <line x1="22" y1="8" x2="18" y2="21"
              stroke="rgba(255,200,100,0.12)" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        </div>{/* end inner scale wrapper */}
        </div>{/* end outer size wrapper */}

        {/* ── Rotating phrase ── */}
        <div style={{ height: 18, marginBottom: 20 }}>
          <p key={phraseIdx} style={{
            fontFamily: 'monospace', fontSize: 11,
            letterSpacing: '0.24em', textTransform: 'uppercase',
            color: 'rgba(184,138,20,0.55)',
            animation: 'nl2-phrase-swap 1.9s ease forwards',
            whiteSpace: 'nowrap',
          }}>
            {PHRASES[phraseIdx]}
          </p>
        </div>

        {/* ── Progress bar ── */}
        <div style={{
          width: 210, height: 1.5,
          background: 'rgba(200,146,10,0.10)',
          borderRadius: 999, position: 'relative',
          marginBottom: 10,
        }}>
          <div ref={barRef} style={{
            position: 'absolute', inset: '0 auto 0 0',
            width: '0%',
            background: 'linear-gradient(90deg, #7A5008 0%, #C8920A 55%, #FFD060 100%)',
            borderRadius: 999,
            transition: 'width 60ms linear',
            animation: 'nl2-bar-pulse 1.4s ease-in-out infinite',
          }} />
        </div>

        {/* Percentage */}
        <p ref={pctRef} style={{
          fontFamily: 'monospace', fontSize: 10,
          letterSpacing: '0.14em',
          color: 'rgba(184,138,20,0.28)',
        }}>
          0%
        </p>
      </div>
    </div>
  );
}

// ─── Page entry variants ──────────────────────────────────────────────────────

const pageVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const sectionVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

// ─── Home Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [loaderExited, setLoaderExited] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('nl_intro_seen') === '1',
  );
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  const { data: productsData } = useQuery({
    queryKey: ['homepage-products'],
    queryFn: () => api.getProducts({ limit: 60, sortBy: 'totalSold', sortOrder: 'desc' }),
    staleTime: 5 * 60 * 1000,
  });
  const { data: categoriesData } = useQuery({
    queryKey: ['homepage-categories'],
    queryFn: () => api.getActiveCategories(),
    staleTime: 5 * 60 * 1000,
  });

  const products = productsData?.items ?? [];
  const categories = categoriesData ?? [];
  if (!loaderExited) {
    return <LoadingScreen onDone={() => { sessionStorage.setItem('nl_intro_seen', '1'); setLoaderExited(true); }} />;
  }

  return (
    <motion.main variants={pageVariants} initial="hidden" animate="visible">
      {/* 1a. Delivery area notice — above the fold */}
      <div style={{
        background: 'linear-gradient(90deg, #0d1a05 0%, #111f06 50%, #0d1a05 100%)',
        borderBottom: '1px solid rgba(120,170,20,0.15)',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '4px 6px',
        textAlign: 'center',
      }}>
        <MapPin size={11} style={{ color: 'rgba(160,230,60,1)', flexShrink: 0 }} />
        <span style={{
          fontFamily: 'monospace',
          fontSize: 10,
          letterSpacing: '0.08em',
          color: 'rgba(200,240,120,0.95)',
          lineHeight: 1.4,
        }}>
          Delivering to{' '}
          <strong style={{ color: '#d4f07a', fontWeight: 600 }}>
            Raipur · Bhilai · Durg · Bilaspur
          </strong>
          {' '}(CG)
        </span>
      </div>

      {/* 1b. WhatsApp ordering strip */}
      <WhatsAppStrip />

      {/* 1. Immersive hero with 3D oil bottle */}
      <motion.div variants={sectionVariants}>
        <ImmersiveHeroSection />
      </motion.div>

      {/* 1c. Trust marquee ticker */}
      <MarqueeTicker
        speed={38}
        style={{
          background: 'linear-gradient(90deg,#0d2b0a,#122e0e)',
          color: 'rgba(212,180,100,0.85)',
          padding: '11px 0',
          borderTop:    '1px solid rgba(184,138,20,0.18)',
          borderBottom: '1px solid rgba(184,138,20,0.18)',
        }}
        items={[
          { icon: '🌿', text: '100% Wood-Pressed' },
          { icon: '🧪', text: 'Zero Chemicals' },
          { icon: '🚚', text: 'Free Delivery Over ₹499' },
          { icon: '🏆', text: 'Traditional Ghani Method' },
          { icon: '🌾', text: 'Wood Pressed · Unrefined' },
          { icon: '✅', text: 'FSSAI Certified' },
          { icon: '🫙', text: 'No Preservatives' },
          { icon: '💚', text: 'Farmer Sourced' },
        ]}
      />

      {/* Quick Order CTA */}
      <QuickOrderBanner />

      {/* Circular category orbit */}
      {categories.length > 0 && (
        <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 pt-6 pb-2" style={{ background: '#f2ece0' }}>
          <CircularCategoryOrbit
            categories={categories}
            selectedCatId={selectedCatId}
            onSelect={setSelectedCatId}
          />
        </div>
      )}

      {/* 2. Product collection with category filter */}
      {products.length > 0 && (
        <motion.div variants={sectionVariants}>
          <HomeShopSection
            products={products}
            categories={categories}
            selectedCatId={selectedCatId}
            onCatChange={setSelectedCatId}
          />
        </motion.div>
      )}

      {/* 3. New arrivals spotlight */}
      {products.length > 0 && (
        <motion.div variants={sectionVariants}>
          <FeaturedProductsSection products={products} />
        </motion.div>
      )}

      {/* 4. Video shorts from all products */}
      <motion.div variants={sectionVariants}>
        <HomeVideoSection />
      </motion.div>

      {/* 5. Social proof */}
      <motion.div variants={sectionVariants}>
        <SocialProofSection />
      </motion.div>

      {/* 6. Recency CTA block */}
      <motion.div variants={sectionVariants}>
        <RecencyBlock />
      </motion.div>

      {/* 7. Newsletter */}
      <motion.div variants={sectionVariants}>
        <NewsletterSection variant="full-width" />
      </motion.div>
    </motion.main>
  );
}
