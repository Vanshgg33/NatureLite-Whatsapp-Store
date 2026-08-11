'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { motion, AnimatePresence, useAnimation, useMotionValue, useAnimationFrame } from 'framer-motion';
import { usePathname } from 'next/navigation';

interface LoadingContextType { isInitialLoad: boolean; hasLoadedOnce: boolean }
const LoadingContext = createContext<LoadingContextType>({ isInitialLoad: true, hasLoadedOnce: false });
export const useLoading = () => useContext(LoadingContext);

// Stable pseudo-random dust particles — computed once, avoids hydration mismatch
const DUST = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  left: ((i * 41 + i * i * 7) % 84) + 8,           // 8%–92%
  delay: ((i * 53) % 340) / 100,                     // 0–3.4s
  dur:   2.8 + ((i * 29) % 22) / 10,                 // 2.8–5.0s
  size:  1 + (i % 3) * 0.6,                          // 1–2.2px
  op:    0.10 + (i % 8) * 0.038,                     // 0.10–0.39
  drift: ((i % 7) - 3) * 9,                          // −27 to +27 px horizontal drift
}));

// Six oil droplets with staggered timing
const DROPS = [0, 1, 2, 3, 4, 5].map(i => ({
  id:    i,
  cx:    149 + (i % 3 - 1) * 3,                      // slight x spread
  delay: i * 0.55,
  dur:   1.25 + i * 0.07,
  r:     2.8 - (i % 2) * 0.9,
}));

// CSS keyframes injected once — avoids Tailwind class bloat and keeps animation perf on compositor
const KEYFRAMES = `
  @keyframes ldr-dust {
    0%   { opacity:0; transform:translateY(0) translateX(0); }
    8%   { opacity:var(--op); }
    92%  { opacity:var(--op); }
    100% { opacity:0; transform:translateY(-170px) translateX(var(--drift)); }
  }
  @keyframes ldr-drop {
    0%   { opacity:0.95; transform:translateY(0) scale(1); }
    65%  { opacity:0.7; }
    100% { opacity:0; transform:translateY(55px) scale(0.5); }
  }
  @keyframes ldr-glow {
    0%,100% { opacity:0.25; }
    50%     { opacity:0.50; }
  }
  @keyframes ldr-shimmer {
    0%,100% { opacity:0.45; transform:scaleX(0.85); }
    50%     { opacity:0.70; transform:scaleX(1.05); }
  }
`;

// Wooden press wheel — true sideways (Y-axis) rotation.
// The DISC is a STATIC flat ellipse (top-down view). It never spins visually.
// The ARM is the only moving part: its tip traces the disc-plane ellipse each frame,
// sweeping clearly LEFT ↔ RIGHT. Depth fading (opacity + stroke-width) shows it
// going behind and coming in front, making the side-to-side rotation obvious.
const RX = 72, RY = 22; // disc ellipse radii

function PressWheel() {
  const armRef     = useRef<SVGLineElement>(null);
  const armHiRef   = useRef<SVGLineElement>(null);
  const knobRef    = useRef<SVGCircleElement>(null);
  const knobInRef  = useRef<SVGCircleElement>(null);

  useAnimationFrame((t) => {
    const phi = (t / 2500) * Math.PI * 2;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);

    // Pure LEFT↔RIGHT sweep — y stays near zero so arm always looks horizontal.
    // This is the 2D projection of Y-axis (sideways) rotation: x = R·cos(φ),
    // y barely moves (just a tiny perspective hint so it doesn't look pasted-flat).
    const x1  = (RX  * cos).toFixed(1);
    const y1  = (-4  * sin).toFixed(1);   // ≤4 px vertical — effectively flat
    const x2  = (148 * cos).toFixed(1);
    const y2  = (-6  * sin).toFixed(1);   // ≤6 px at tip

    // sin > 0 → going behind disc (fade out); sin < 0 → coming to front (full)
    const behind  = Math.max(0, sin);
    const opacity = Math.max(0.08, 1 - behind * 0.88);
    const sw      = (11 - behind * 5).toFixed(1);
    const swHi    = (5  - behind * 2.5).toFixed(1);
    const kr      = (9  - behind * 4).toFixed(1);
    const kri     = (5  - behind * 2).toFixed(1);
    const op      = opacity.toFixed(2);

    if (armRef.current) {
      armRef.current.setAttribute('x1', x1);
      armRef.current.setAttribute('y1', y1);
      armRef.current.setAttribute('x2', x2);
      armRef.current.setAttribute('y2', y2);
      armRef.current.setAttribute('stroke-width', sw);
      armRef.current.setAttribute('opacity', op);
    }
    if (armHiRef.current) {
      armHiRef.current.setAttribute('x1', x1);
      armHiRef.current.setAttribute('y1', y1);
      armHiRef.current.setAttribute('x2', x2);
      armHiRef.current.setAttribute('y2', y2);
      armHiRef.current.setAttribute('stroke-width', swHi);
      armHiRef.current.setAttribute('opacity', (opacity * 0.55).toFixed(2));
    }
    if (knobRef.current) {
      knobRef.current.setAttribute('cx', x2);
      knobRef.current.setAttribute('cy', y2);
      knobRef.current.setAttribute('r',  kr);
      knobRef.current.setAttribute('opacity', op);
    }
    if (knobInRef.current) {
      knobInRef.current.setAttribute('cx', x2);
      knobInRef.current.setAttribute('cy', y2);
      knobInRef.current.setAttribute('r',  kri);
      knobInRef.current.setAttribute('opacity', op);
    }
  });

  return (
    <g transform="translate(150,140)">
      {/* ── Static disc — flat ellipse = top-down horizontal stone, never spins ── */}
      <ellipse rx="76" ry="25" fill="#2a1408" opacity="0.8" />
      <ellipse rx={RX} ry={RY} fill="url(#lf-woodface)" filter="url(#lf-wood)" />
      <ellipse rx="66" ry="19" fill="none" stroke="#7a4820" strokeWidth="2"   opacity="0.6" />
      <ellipse rx="52" ry="15" fill="none" stroke="#5c3414" strokeWidth="1.5" opacity="0.5" />
      <ellipse rx="38" ry="11" fill="none" stroke="#7a4820" strokeWidth="1"   opacity="0.45" />
      <ellipse rx={RX} ry={RY} fill="none" stroke="#c8803a" strokeWidth="3.5" />
      <ellipse rx="69" ry="20" fill="none" stroke="#7a4820" strokeWidth="1"   opacity="0.7" />
      {/* Hub */}
      <ellipse rx="16" ry="5"  fill="#3a1e08" />
      <ellipse rx="10" ry="3"  fill="#6a4020" />
      <ellipse rx="4"  ry="1.5" fill="#3a1e08" />

      {/* ── Arm — ONLY moving element. Sweeps from right rim → behind → left rim → front ── */}
      {/* Dark body */}
      <line ref={armRef}
        x1={RX} y1="0" x2="148" y2="0"
        stroke="#6a3c18" strokeWidth="11" strokeLinecap="round"
      />
      {/* Wood-grain highlight */}
      <line ref={armHiRef}
        x1={RX} y1="0" x2="144" y2="0"
        stroke="#c87a38" strokeWidth="5" strokeLinecap="round" opacity="0.7"
      />
      {/* Knob at tip */}
      <circle ref={knobRef}   cx="148" cy="0" r="9"   fill="#6a3c18" />
      <circle ref={knobInRef} cx="148" cy="0" r="5"   fill="#b06030" />

      {/* Non-rotating specular */}
      <ellipse cx="-20" cy="-13" rx="18" ry="5"
        fill="white" fillOpacity="0.03"
        style={{ mixBlendMode: 'screen', pointerEvents: 'none' }} />
    </g>
  );
}

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isInitialLoad, setIsInitialLoad]   = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce]   = useState(false);
  const bar = useAnimation();
  const pathname = usePathname();

  useEffect(() => {
    // Only show on home page
    if (pathname !== '/') {
      setIsInitialLoad(false);
      setHasLoadedOnce(true);
      return;
    }

    if (sessionStorage.getItem('naturelite-loaded')) {
      setIsInitialLoad(false);
      setHasLoadedOnce(true);
      return;
    }

    // Two-phase progress: sprint to 80%, then complete — total ~1s
    bar.start({ scaleX: 0.80, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } });
    const t = setTimeout(() => {
      bar.start({ scaleX: 1, transition: { duration: 0.18, ease: 'easeIn' } })
         .then(() => setTimeout(() => {
           setIsInitialLoad(false);
           setHasLoadedOnce(true);
           sessionStorage.setItem('naturelite-loaded', 'true');
         }, 80));
    }, 700);

    return () => clearTimeout(t);
  }, []);

  return (
    <LoadingContext.Provider value={{ isInitialLoad, hasLoadedOnce }}>
      <AnimatePresence>
        {isInitialLoad && !hasLoadedOnce && (
          <motion.div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden select-none"
            style={{
              background:
                'radial-gradient(ellipse 130% 110% at 50% 38%, #121d0d 0%, #080e05 50%, #020402 100%)',
            }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <style>{KEYFRAMES}</style>

            {/* ── Vignette ── */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at center, transparent 22%, rgba(2,5,2,0.88) 100%)',
              }}
            />

            {/* ── Atmospheric dust ── */}
            {DUST.map(p => (
              <span
                key={p.id}
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: `${p.left}%`,
                  bottom: '5%',
                  width:  p.size,
                  height: p.size,
                  background: `hsl(38 65% ${48 + (p.id % 20)}%)`,
                  '--op':    p.op,
                  '--drift': `${p.drift}px`,
                  animation: `ldr-dust ${p.dur}s ${p.delay}s ease-in-out infinite`,
                } as React.CSSProperties}
              />
            ))}

            {/* ── Main scene ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              {/*
                SVG scene layout (viewBox 0 0 300 370):
                  • Wheel centre:  (150, 140),  r=72
                  • Pillar:        x 138–162,   y 84–212
                  • Spout tip:     y 240
                  • Oil stream:    y 240–296
                  • Vessel opening y 296,       bottom y 362
              */}
              <svg
                viewBox="0 0 300 370"
                width="260"
                height="321"
                aria-hidden
                style={{ overflow: 'visible' }}
              >
                <defs>
                  {/* ── Wood grain: simple glow, no expensive turbulence ── */}
                  <filter id="lf-wood" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>

                  {/* ── Oil glow: bloom behind the stream ── */}
                  <filter id="lf-oilglow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="5.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>

                  {/* ── Soft ambient bloom ── */}
                  <filter id="lf-bloom" x="-120%" y="-120%" width="340%" height="340%">
                    <feGaussianBlur stdDeviation="24" />
                  </filter>

                  {/* ── Hard drop-shadow ── */}
                  <filter id="lf-shadow" x="-25%" y="-25%" width="150%" height="150%">
                    <feDropShadow dx="0" dy="6" stdDeviation="9"
                      floodColor="#000" floodOpacity="0.70" />
                  </filter>

                  {/* ── Gradients ── */}
                  <radialGradient id="lf-woodface" cx="36%" cy="30%" r="66%">
                    <stop offset="0%"   stopColor="#c47a3a" />
                    <stop offset="42%"  stopColor="#8a5228" />
                    <stop offset="100%" stopColor="#4a2e10" />
                  </radialGradient>

                  <linearGradient id="lf-pillar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="#2c1a08" />
                    <stop offset="32%"  stopColor="#7a4e24" />
                    <stop offset="68%"  stopColor="#5c3a1a" />
                    <stop offset="100%" stopColor="#2c1a08" />
                  </linearGradient>

                  <linearGradient id="lf-arm" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="#2c1a0a" />
                    <stop offset="50%"  stopColor="#6c4422" />
                    <stop offset="100%" stopColor="#2c1a0a" />
                  </linearGradient>

                  <linearGradient id="lf-oilstream" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#e09412" />
                    <stop offset="55%"  stopColor="#c87810" />
                    <stop offset="100%" stopColor="#b06408" stopOpacity="0.2" />
                  </linearGradient>

                  <radialGradient id="lf-oilpool" cx="50%" cy="12%" r="78%">
                    <stop offset="0%"   stopColor="#f8c832" />
                    <stop offset="50%"  stopColor="#c87c12" />
                    <stop offset="100%" stopColor="#7a4c08" />
                  </radialGradient>

                  <radialGradient id="lf-vessel" cx="30%" cy="16%" r="74%">
                    <stop offset="0%"   stopColor="#5e3e2c" />
                    <stop offset="52%"  stopColor="#3a2210" />
                    <stop offset="100%" stopColor="#1c0e04" />
                  </radialGradient>

                  <radialGradient id="lf-ambiglow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor="#d89212" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#d89212" stopOpacity="0" />
                  </radialGradient>

                  <clipPath id="lf-vesselclip">
                    <path d="M 116,296 C 114,330 122,356 150,364 C 178,356 186,330 184,296 Z" />
                  </clipPath>
                </defs>

                {/* ━━ 1. Ambient glow behind wheel ━━ */}
                <ellipse cx="150" cy="140" rx="94" ry="36"
                  fill="url(#lf-ambiglow)"
                  style={{ animation: 'ldr-glow 3.8s ease-in-out infinite' }} />

                {/* ━━ 2. Clay oil-collection vessel ━━ */}
                <g filter="url(#lf-shadow)">
                  <path
                    d="M 116,296 C 114,332 124,358 150,366 C 176,358 186,332 184,296 Z"
                    fill="url(#lf-vessel)" />
                  {/* Rim */}
                  <ellipse cx="150" cy="296" rx="34" ry="7"  fill="#260e02" />
                  <ellipse cx="150" cy="296" rx="31" ry="5"  fill="#4a2c14" />
                  {/* Glaze streak */}
                  <path d="M 124,312 Q 121,342 131,358"
                    stroke="#6e4430" strokeWidth="1.5"
                    fill="none" opacity="0.4" strokeLinecap="round" />
                </g>

                {/* ━━ 3. Oil filling vessel (rises from bottom on load) ━━ */}
                <g clipPath="url(#lf-vesselclip)">
                  <motion.path
                    d="M 116,366 C 114,332 124,308 150,306 C 176,308 186,332 184,366 Z"
                    fill="url(#lf-oilpool)" fillOpacity="0.94"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ transformOrigin: '150px 366px', transformBox: 'fill-box' }}
                    transition={{ duration: 1.8, delay: 0.6, ease: [0.2, 0, 0.38, 1] }}
                  />
                </g>
                {/* Surface shimmer */}
                <motion.ellipse cx="150" cy="307" rx="26" ry="3"
                  fill="#f8c832"
                  initial={{ opacity: 0, scaleX: 0.4 }}
                  animate={{ opacity: [0, 0.6, 0.45, 0.6], scaleX: [0.4, 1, 0.92, 1] }}
                  style={{ transformOrigin: '150px 307px', transformBox: 'fill-box' }}
                  transition={{ duration: 2.0, delay: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                />

                {/* ━━ 4. Central wooden pillar ━━ */}
                <rect x="138" y="84" width="24" height="130" rx="5"
                  fill="url(#lf-pillar)" filter="url(#lf-shadow)" />
                {/* Edge highlight */}
                <rect x="143" y="84" width="4" height="130" rx="2"
                  fill="#6c4422" fillOpacity="0.28" />

                {/* ━━ 5. Drip spout ━━ */}
                <path d="M 144,214 L 143,238 Q 148,246 150,248 Q 152,246 157,238 L 156,214 Z"
                  fill="#2c1a0a" />
                <path d="M 146,224 L 146,238 Q 149,245 150,246 Q 151,245 154,238 L 154,224 Z"
                  fill="#1a0e06" />

                {/* ━━ 6. Oil stream (path draws in after 0.5s) ━━ */}
                <motion.path
                  d="M 150,248 Q 149,260 151,270 Q 149,280 151,290 Q 150,294 150,296"
                  stroke="url(#lf-oilstream)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="none"
                  filter="url(#lf-oilglow)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.2, delay: 0.5, ease: [0.3, 0, 0.55, 1] }}
                />
                {/* Thinner inner highlight on stream */}
                <motion.path
                  d="M 152,250 Q 151,263 153,273 Q 151,283 152,293"
                  stroke="#f8c832"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  strokeOpacity="0.35"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.35 }}
                  transition={{ duration: 1.2, delay: 0.65, ease: [0.3, 0, 0.55, 1] }}
                />

                {/* ━━ 7. Oil droplets ━━ */}
                {DROPS.map(d => (
                  <circle
                    key={d.id}
                    cx={d.cx} cy={252}
                    r={d.r}
                    fill="#d49010"
                    fillOpacity="0.92"
                    style={{
                      animation: `ldr-drop ${d.dur}s ${d.delay}s ease-in infinite`,
                    }}
                  />
                ))}

                {/* ━━ 8. Rotating wooden press wheel ━━ */}
                <PressWheel />

              </svg>
            </motion.div>

            {/* ── Brand identity ── */}
            <motion.div
              className="flex flex-col items-center"
              style={{ marginTop: '-6px' }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1
                className="font-display font-bold"
                style={{
                  fontSize:    'clamp(1.75rem, 5vw, 2.5rem)',
                  letterSpacing: '-0.02em',
                  lineHeight:  1.1,
                  color:       '#f2c65a',
                  textShadow:  '0 0 38px rgba(225,148,18,0.58), 0 2px 8px rgba(0,0,0,0.92)',
                }}
              >
                Purity Foods
              </h1>
              <p style={{
                marginTop:     '7px',
                fontSize:      '0.6rem',
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color:         '#7a5c22',
              }}>
                Cold · Pressed · Pure
              </p>
            </motion.div>

            {/* ── Golden progress bar ── */}
            <motion.div
              style={{
                marginTop:    '26px',
                width:        '152px',
                height:       '1px',
                borderRadius: '1px',
                overflow:     'hidden',
                background:   'rgba(190,130,22,0.14)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <motion.div
                style={{
                  height:     '100%',
                  width:      '100%',
                  transformOrigin: 'left',
                  background: 'linear-gradient(90deg,#7c4c08,#d49212,#f8c832,#d49212)',
                }}
                initial={{ scaleX: 0 }}
                animate={bar}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </LoadingContext.Provider>
  );
}
