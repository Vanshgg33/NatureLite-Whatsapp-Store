'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import type { Product } from '@/types';

// ── Detect bilona / ghee products ─────────────────────────────────────────────
export function isBilonaGheeProduct(
  product: Pick<Product, 'name' | 'slug' | 'category'>,
): boolean {
  const text = `${product.name} ${product.slug}`.toLowerCase();
  const cat =
    typeof product.category === 'object' && product.category !== null
      ? ((product.category as { name?: string }).name ?? '').toLowerCase()
      : (product.category as string ?? '').toLowerCase();
  return (
    text.includes('ghee') ||
    text.includes('bilona') ||
    cat.includes('ghee')
  );
}

// ── Inline CSS animations (injected once per mount) ───────────────────────────
const STYLES = `
  @keyframes nl-churn {
    0%   { transform: rotate(-20deg); }
    100% { transform: rotate(20deg); }
  }
  @keyframes nl-rope-l {
    0%   { transform: rotate(20deg); }
    100% { transform: rotate(-20deg); }
  }
  @keyframes nl-rope-r {
    0%   { transform: rotate(-20deg); }
    100% { transform: rotate(20deg); }
  }
  @keyframes nl-ripple {
    0%   { transform: scale(0.4); opacity: 0.7; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  @keyframes nl-butter-rise {
    0%   { transform: translateY(0px);   opacity: 0.85; }
    70%  { opacity: 0.6; }
    100% { transform: translateY(-28px); opacity: 0; }
  }
  @keyframes nl-steam {
    0%   { transform: translateY(0px)  scaleX(1);    opacity: 0.55; }
    100% { transform: translateY(-22px) scaleX(1.4); opacity: 0; }
  }
  @keyframes nl-flame-a {
    0%,100% { transform: scaleY(1)   scaleX(1)   translateY(0px); }
    33%     { transform: scaleY(1.1) scaleX(0.93) translateY(-2px); }
    66%     { transform: scaleY(0.92) scaleX(1.05) translateY(1px); }
  }
  @keyframes nl-flame-b {
    0%,100% { transform: scaleY(1)   scaleX(1);   opacity: 0.8; }
    50%     { transform: scaleY(1.15) scaleX(0.9); opacity: 1;   }
  }
  @keyframes nl-ghee-shimmer {
    0%,100% { stop-color: #FFD060; }
    50%     { stop-color: #FFA020; }
  }
  @keyframes nl-milk-fill {
    0%   { transform: translateY(28px); opacity: 0; }
    100% { transform: translateY(0px);  opacity: 1; }
  }
  @keyframes nl-bubble {
    0%,100% { transform: translateY(0px); opacity: 0.5; }
    50%     { transform: translateY(-4px); opacity: 0.9; }
  }
  @keyframes nl-butter-glob {
    0%,100% { transform: scale(1); }
    50%     { transform: scale(1.06) translateY(-2px); }
  }
`;

// ── Step scenes ───────────────────────────────────────────────────────────────

function MilkScene({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 100 110" width="100" height="110" aria-hidden>
      {/* Brass lota / milk vessel */}
      <ellipse cx="50" cy="105" rx="30" ry="5" fill="rgba(0,0,0,0.18)" />
      {/* Body */}
      <path d="M28,88 Q24,100 30,106 Q40,112 50,112 Q60,112 70,106 Q76,100 72,88 Z"
        fill="#C89840" />
      {/* Narrow neck */}
      <rect x="38" y="70" width="24" height="20" rx="4" fill="#B88830" />
      {/* Wide shoulder */}
      <ellipse cx="50" cy="88" rx="23" ry="6" fill="#C89840" />
      {/* Mouth rim */}
      <ellipse cx="50" cy="70" rx="14" ry="5" fill="#D4A850" />
      <ellipse cx="50" cy="69" rx="13" ry="4" fill="#B88830" />
      {/* Milk inside */}
      <ellipse cx="50" cy="71" rx="12" ry="3.5"
        fill="rgba(255,252,240,0.92)"
        style={active ? { animation: 'nl-milk-fill 0.8s cubic-bezier(.22,1,.36,1) both' } : { opacity: 0 }}
      />
      {/* Steam wisps */}
      {active && [0, 1, 2].map(i => (
        <path key={i}
          d={`M${46 + i * 4},65 Q${44 + i * 5},58 ${47 + i * 3},52`}
          stroke="rgba(255,252,240,0.45)" strokeWidth="1.2" fill="none"
          strokeLinecap="round"
          style={{ animation: `nl-steam 1.8s ease-out infinite ${i * 0.5}s` }}
        />
      ))}
      {/* Shine */}
      <path d="M32,90 Q30,100 33,105" stroke="rgba(255,220,100,0.35)" strokeWidth="1.8"
        fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CurdScene({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 100 110" width="100" height="110" aria-hidden>
      {/* Shadow */}
      <ellipse cx="50" cy="108" rx="30" ry="4.5" fill="rgba(0,0,0,0.20)" />
      {/* Earthen pot (matka) */}
      <path d="M18,60 Q12,85 20,100 Q30,112 50,112 Q70,112 80,100 Q88,85 82,60 Z"
        fill="#B06830" />
      {/* Pot belly highlight */}
      <path d="M18,60 Q16,80 22,95 Q28,108 40,111"
        stroke="rgba(200,140,80,0.40)" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Pot mouth */}
      <ellipse cx="50" cy="60" rx="32" ry="10" fill="#8B4820" />
      <ellipse cx="50" cy="58" rx="30" ry="8.5" fill="#A05830" />
      {/* Curd surface — off-white */}
      <ellipse cx="50" cy="63" rx="28" ry="7"
        fill="#F0ECD8"
        style={active ? { animation: 'nl-milk-fill 0.9s cubic-bezier(.22,1,.36,1) 0.2s both' } : { opacity: 0 }}
      />
      {/* Curd texture lines */}
      {active && (
        <>
          <line x1="30" y1="63" x2="70" y2="63" stroke="rgba(200,185,150,0.30)" strokeWidth="0.7" />
          <line x1="34" y1="66" x2="66" y2="66" stroke="rgba(200,185,150,0.20)" strokeWidth="0.5" />
        </>
      )}
      {/* Bubbles */}
      {active && [0, 1, 2].map(i => (
        <circle key={i}
          cx={38 + i * 8} cy={63} r={1.2}
          fill="rgba(200,185,150,0.60)"
          style={{ animation: `nl-bubble ${1.6 + i * 0.4}s ease-in-out infinite ${i * 0.5}s` }}
        />
      ))}
      {/* Earthen texture dots */}
      <circle cx="28" cy="80" r="1.2" fill="rgba(80,30,10,0.18)" />
      <circle cx="72" cy="75" r="1"   fill="rgba(80,30,10,0.14)" />
      <circle cx="24" cy="92" r="1"   fill="rgba(80,30,10,0.12)" />
    </svg>
  );
}

function ChurningScene({ active }: { active: boolean }) {
  const churnStyle = active
    ? { animation: 'nl-churn 1.2s ease-in-out infinite alternate', transformOrigin: '50px 90px' }
    : {};
  return (
    <svg viewBox="0 0 120 140" width="120" height="140" aria-hidden style={{ overflow: 'visible' }}>
      {/* Shadow */}
      <ellipse cx="60" cy="136" rx="42" ry="6" fill="rgba(0,0,0,0.22)" />

      {/* Ropes (behind stick) */}
      <g style={active ? { animation: 'nl-rope-l 1.2s ease-in-out infinite alternate', transformOrigin: '50px 60px' } : {}}>
        <path d="M50,52 C35,52 12,38 4,34" stroke="#C49A60" strokeWidth="2.2"
          fill="none" strokeLinecap="round" opacity="0.85" />
      </g>
      <g style={active ? { animation: 'nl-rope-r 1.2s ease-in-out infinite alternate', transformOrigin: '70px 60px' } : {}}>
        <path d="M70,52 C85,52 108,38 116,34" stroke="#C49A60" strokeWidth="2.2"
          fill="none" strokeLinecap="round" opacity="0.85" />
      </g>

      {/* Clay pot body */}
      <path d="M15,82 Q8,105 18,120 Q30,134 60,134 Q90,134 102,120 Q112,105 105,82 Z"
        fill="#B06830" />
      <path d="M15,82 Q12,100 18,114 Q24,126 38,131"
        stroke="rgba(200,140,80,0.38)" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* Pot mouth */}
      <ellipse cx="60" cy="82" rx="45" ry="13" fill="#8B4820" />
      <ellipse cx="60" cy="80" rx="43" ry="11" fill="#A05830" />

      {/* Curd / buttermilk surface */}
      <ellipse cx="60" cy="85" rx="40" ry="9.5" fill="#EDE8D2" />

      {/* Ripple rings from churning */}
      {active && [0, 1].map(i => (
        <ellipse key={i} cx="60" cy="85" rx="14" ry="4" fill="none"
          stroke="rgba(210,200,170,0.55)" strokeWidth="0.8"
          style={{ animation: `nl-ripple 1.8s ease-out infinite ${i * 0.7}s`, transformOrigin: '60px 85px' }}
        />
      ))}

      {/* Butter globules rising */}
      {active && [
        { cx: 44, cy: 84, r: 4.5, d: 0 },
        { cx: 72, cy: 85, r: 3.5, d: 0.6 },
        { cx: 55, cy: 83, r: 3,   d: 1.1 },
      ].map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.cy} r={b.r}
          fill="rgba(255,250,235,0.90)"
          style={{ animation: `nl-butter-rise 2.2s ease-in infinite ${b.d}s` }}
        />
      ))}

      {/* Wooden bilona stick — rotates */}
      <g style={churnStyle}>
        {/* Stick */}
        <rect x="56.5" y="10" width="7" height="108" rx="3.5" fill="#6B3010" />
        <rect x="58"   y="12" width="3" height="104" rx="1.5" fill="#8B4820" />
        {/* Rope wraps (crosshatch marks) */}
        {[38, 50, 62].map(y => (
          <line key={y} x1="53" y1={y} x2="67" y2={y}
            stroke="#C49A60" strokeWidth="1.4" strokeLinecap="round" opacity="0.80" />
        ))}
        {/* Knob at top */}
        <circle cx="60" cy="14" r="5.5" fill="#4A2008" />
        <circle cx="60" cy="13" r="4"   fill="#6B3010" />
      </g>

      {/* Earthen texture */}
      <circle cx="25" cy="105" r="1.5" fill="rgba(80,30,10,0.18)" />
      <circle cx="95" cy="100" r="1.2" fill="rgba(80,30,10,0.15)" />
      <circle cx="22"  cy="118" r="1"  fill="rgba(80,30,10,0.12)" />
    </svg>
  );
}

function ButterScene({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 100 110" width="100" height="110" aria-hidden>
      {/* Shadow */}
      <ellipse cx="50" cy="107" rx="34" ry="5" fill="rgba(0,0,0,0.18)" />
      {/* Shallow bowl */}
      <path d="M16,72 Q14,90 22,100 Q32,108 50,108 Q68,108 78,100 Q86,90 84,72 Z"
        fill="#D4A870" />
      <path d="M16,72 Q14,85 20,96" stroke="rgba(255,220,150,0.35)" strokeWidth="2.5"
        fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="72" rx="34" ry="9" fill="#B88840" />
      <ellipse cx="50" cy="70" rx="32" ry="7.5" fill="#C89850" />
      {/* Buttermilk layer */}
      <ellipse cx="50" cy="74" rx="30" ry="6.5" fill="#E8E4D0" />
      {/* White butter blob — the main element */}
      <ellipse cx="50" cy="68" rx="22" ry="9" fill="#FFFFF0"
        style={active ? { animation: 'nl-butter-glob 2.4s ease-in-out infinite' } : {}}
      />
      <ellipse cx="44" cy="66" rx="9" ry="4.5" fill="rgba(255,255,245,0.70)" />
      <ellipse cx="58" cy="67" rx="7" ry="3.5" fill="rgba(255,255,245,0.55)" />
      {/* Texture marks on butter */}
      <path d="M36,68 Q44,65 56,68 Q62,70 64,68" stroke="rgba(220,218,200,0.55)"
        strokeWidth="0.8" fill="none" />
      <path d="M40,71 Q50,68 60,71" stroke="rgba(220,218,200,0.40)"
        strokeWidth="0.7" fill="none" />
      {/* Small drip on side */}
      <path d="M66,68 Q69,72 67,76" stroke="rgba(255,255,240,0.70)"
        strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function GheeScene({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 100 120" width="100" height="120" aria-hidden>
      <defs>
        <linearGradient id="gheeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFD060">
            <animate attributeName="stop-color"
              values="#FFD060;#FFA020;#FFD060"
              dur="2.8s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#A06010" />
        </linearGradient>
        <clipPath id="jarClip">
          <rect x="22" y="38" width="56" height="66" rx="8" />
        </clipPath>
        <clipPath id="lidClip">
          <rect x="18" y="28" width="64" height="16" rx="5" />
        </clipPath>
      </defs>

      {/* Shadow */}
      <ellipse cx="50" cy="115" rx="32" ry="5.5" fill="rgba(0,0,0,0.20)" />

      {/* Flat-bottomed pan / kadhai above */}
      <ellipse cx="50" cy="24" rx="35" ry="8" fill="#7A4010" />
      <path d="M15,24 Q14,30 22,32 Q50,36 78,32 Q86,30 85,24"
        fill="#9A5818" />
      {/* Pan handles */}
      <rect x="2"  y="22" width="16" height="5" rx="2.5" fill="#7A4010" />
      <rect x="82" y="22" width="16" height="5" rx="2.5" fill="#7A4010" />
      {/* Ghee in pan */}
      <ellipse cx="50" cy="24" rx="33" ry="6.5" fill="url(#gheeGrad)" />

      {/* Drip from pan into jar */}
      {active && (
        <path d="M50,30 Q51,34 50,38"
          stroke="#D4920A" strokeWidth="3.5" fill="none" strokeLinecap="round"
          style={{ animation: 'nl-steam 1.5s ease-in-out infinite' }}
        />
      )}

      {/* Flame below pan */}
      <g style={{ transformOrigin: '50px 105px' }}>
        <path d="M38,112 Q40,100 50,96 Q60,100 62,112 Z"
          fill="rgba(255,140,0,0.88)"
          style={active ? { animation: 'nl-flame-a 0.8s ease-in-out infinite', transformOrigin: '50px 104px' } : {}}
        />
        <path d="M42,112 Q44,103 50,100 Q56,103 58,112 Z"
          fill="rgba(255,200,50,0.90)"
          style={active ? { animation: 'nl-flame-b 0.65s ease-in-out infinite 0.15s', transformOrigin: '50px 106px' } : {}}
        />
        <path d="M46,112 Q48,107 50,104 Q52,107 54,112 Z"
          fill="rgba(255,240,180,0.95)"
          style={active ? { animation: 'nl-flame-a 0.55s ease-in-out infinite 0.08s', transformOrigin: '50px 108px' } : {}}
        />
        {/* Flame base */}
        <ellipse cx="50" cy="112" rx="14" ry="2.5" fill="rgba(255,120,0,0.35)" />
      </g>

      {/* Glass jar */}
      <rect x="22" y="38" width="56" height="66" rx="8"
        fill="rgba(60,28,4,0.22)" stroke="rgba(184,138,20,0.30)" strokeWidth="1.2" />
      {/* Ghee fill — animated level */}
      <g clipPath="url(#jarClip)">
        <rect x="22" y="38" width="56" height="66"
          fill="url(#gheeGrad)"
          style={active ? { animation: 'nl-milk-fill 1.2s cubic-bezier(.22,1,.36,1) 0.3s both' } : { opacity: 0 }}
        />
      </g>
      {/* Jar glass shine */}
      <rect x="25" y="42" width="7" height="56" rx="3.5"
        fill="rgba(255,220,120,0.14)" />
      <rect x="26" y="46" width="3" height="46" rx="1.5"
        fill="rgba(255,240,180,0.10)" />
      {/* Jar lid */}
      <rect x="18" y="28" width="64" height="14" rx="5" fill="#5A2E10" />
      <rect x="22" y="30" width="56" height="9"  rx="3" fill="#7A3E18" />
    </svg>
  );
}

// ── Step data ─────────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 'milk',
    num: '01',
    title: 'A2 Desi Milk',
    desc: 'Sourced from indigenous Gir & Sahiwal cows. Freshly boiled and cooled to the perfect temperature.',
    Scene: MilkScene,
    delay: 0,
  },
  {
    id: 'curd',
    num: '02',
    title: 'Overnight Curdling',
    desc: 'Set in earthen pots with a live culture. Ferments naturally for 8–12 hours.',
    Scene: CurdScene,
    delay: 0.12,
  },
  {
    id: 'churn',
    num: '03',
    title: 'Bilona Churning',
    desc: 'Hand-churned with a wooden bilona — rope pulled alternately. White butter rises to the top.',
    Scene: ChurningScene,
    delay: 0.24,
    hero: true as const,
  },
  {
    id: 'butter',
    num: '04',
    title: 'Butter Collection',
    desc: 'Fresh makkhan scooped from the surface. Pure, cold, zero preservatives.',
    Scene: ButterScene,
    delay: 0.36,
  },
  {
    id: 'ghee',
    num: '05',
    title: 'Slow Clarification',
    desc: 'Butter heated on a low flame for 45–60 min. Milk solids settle. Pure gold ghee remains.',
    Scene: GheeScene,
    delay: 0.48,
  },
];

// ── Main section ──────────────────────────────────────────────────────────────

export default function BilonaProcessSection() {
  const ref     = useRef<HTMLElement>(null);
  const inView  = useInView(ref, { once: true, margin: '-80px' });

  return (
    <>
      {/* Inject keyframes once */}
      <style>{STYLES}</style>

      <section
        ref={ref}
        className="rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #040e02 0%, #0d2c07 100%)',
          border: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        {/* Ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none"
          style={{
            position: 'absolute',
            top: '-20%', left: '50%', transform: 'translateX(-50%)',
            width: 700, height: 400,
            background: 'radial-gradient(ellipse, rgba(160,112,16,0.12) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />

        {/* Grain */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            opacity: 0.40, mixBlendMode: 'overlay',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <div className="relative z-10 px-6 sm:px-10 py-12">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-12"
          >
            <p style={{
              fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.32em',
              textTransform: 'uppercase', color: 'rgba(184,138,20,0.55)',
              marginBottom: 10,
            }}>
              Made the Ancient Way
            </p>
            <h2
              className="font-display font-bold"
              style={{
                fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
                color: '#fff', letterSpacing: '-0.025em', marginBottom: 6,
              }}
            >
              The Traditional{' '}
              <em style={{ fontStyle: 'italic', color: 'rgba(184,138,20,0.88)' }}>Bilona Method</em>
            </h2>
            <p
              style={{
                fontFamily: "'Noto Sans Devanagari', sans-serif",
                fontSize: 13, fontWeight: 600,
                color: 'rgba(184,138,20,0.50)', marginBottom: 4,
              }}
            >
              बिलोना घी — परंपरागत विधि
            </p>
            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,0.40)',
              maxWidth: 480, margin: '0 auto', lineHeight: 1.65,
            }}>
              From A2 desi milk to pure clarified ghee — every bottle passes through
              5 ancient steps that no factory process can replicate.
            </p>
          </motion.div>

          {/* Steps grid */}
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
          >
            {STEPS.map(({ id, num, title, desc, Scene, delay, hero }) => (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 28 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center text-center relative"
                style={{
                  padding: '24px 16px 20px',
                  borderRadius: 20,
                  background: hero
                    ? 'rgba(160,112,16,0.10)'
                    : 'rgba(255,255,255,0.03)',
                  border: hero
                    ? '1px solid rgba(160,112,16,0.25)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* Hero label */}
                {hero && (
                  <span style={{
                    position: 'absolute', top: -10, left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#a07010', color: '#fff',
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    padding: '3px 10px', borderRadius: 99,
                    whiteSpace: 'nowrap',
                  }}>
                    The Bilona Stage
                  </span>
                )}

                {/* Animated scene */}
                <div style={{ marginBottom: 16, filter: inView ? 'none' : 'opacity(0)' }}>
                  <Scene active={inView} />
                </div>

                {/* Step number */}
                <span style={{
                  fontFamily: 'monospace', fontSize: 10,
                  letterSpacing: '0.20em', color: 'rgba(184,138,20,0.50)',
                  marginBottom: 6,
                }}>
                  {num}
                </span>

                {/* Title */}
                <h3
                  className="font-display font-semibold"
                  style={{
                    fontSize: 15, color: 'rgba(255,255,255,0.88)',
                    letterSpacing: '-0.01em', marginBottom: 8, lineHeight: 1.25,
                  }}
                >
                  {title}
                </h3>

                {/* Description */}
                <p style={{
                  fontSize: 12.5, color: 'rgba(255,255,255,0.38)',
                  lineHeight: 1.6, maxWidth: 180,
                }}>
                  {desc}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Footer trust line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-center mt-10 pt-8"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p style={{
              fontSize: 13, color: 'rgba(255,255,255,0.30)',
              letterSpacing: '0.02em',
            }}>
              24–48 hours · Earthen pots · Wooden churner · Low flame · No shortcuts
            </p>
          </motion.div>
        </div>
      </section>
    </>
  );
}
