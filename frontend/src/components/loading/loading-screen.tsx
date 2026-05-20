'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SEEDS = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: 68 + ((i * 19 + 7) % 124),
  delay: (i * 0.31) % 5.2,
  duration: 0.52 + (i % 5) * 0.07,
  rx: 2.4 + (i % 3) * 0.7,
  ry: 1.4 + (i % 3) * 0.4,
}));

const BOTTLE_TOP    = 282;
const BOTTLE_HEIGHT = 128;
const BOTTLE_BOTTOM = BOTTLE_TOP + BOTTLE_HEIGHT;

// Crank timing constants — every value derived from one source of truth
const CRANK_DURATION   = 1.8;   // seconds per full press cycle
const T_PRESS_END      = 0.40;  // fraction: arm reaches max-down
const T_HOLD_END       = 0.52;  // fraction: compression hold ends → oil releases here
const T_RETURN_END     = 0.82;  // fraction: return overshoot peaks
// T_SETTLE_END = 1.0 (implicit)

// SVG-native pivot for the crank arm — placed at center of motor housing
const PIVOT_X = 162;
const PIVOT_Y = 66;

interface LoadingScreenProps {
  isLoading: boolean;
  onLoadingComplete?: () => void;
  minimumLoadTime?: number;
}

export function LoadingScreen({
  isLoading,
  onLoadingComplete,
  minimumLoadTime = 2500,
}: LoadingScreenProps) {
  const [showLoader, setShowLoader] = useState(true);
  const [progress,   setProgress]   = useState(0);
  const startTime = useRef(Date.now());
  const crankRef  = useRef<SVGGElement>(null);

  useEffect(() => {
    const DURATION = CRANK_DURATION * 1000;
    // [angle°, normalised-time]
    const KF: [number, number][] = [
      [-8,  0],
      [20,  T_PRESS_END],
      [20,  T_HOLD_END],
      [-12, T_RETURN_END],
      [-8,  1.0],
    ];

    function easeInOut(t: number) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
    function easeOut(t: number)   { return 1-(1-t)*(1-t); }
    const EASINGS = [easeInOut, (t:number)=>t, easeOut, easeInOut];

    function getAngle(p: number) {
      for (let i = 0; i < KF.length - 1; i++) {
        const [a0, t0] = KF[i];
        const [a1, t1] = KF[i + 1];
        if (p >= t0 && p <= t1) {
          const s = t1 === t0 ? 1 : (p - t0) / (t1 - t0);
          return a0 + (a1 - a0) * EASINGS[i](s);
        }
      }
      return KF[KF.length - 1][0];
    }

    let startTs: number | null = null;
    let raf: number;

    function tick(ts: number) {
      if (!startTs) startTs = ts;
      const progress = ((ts - startTs) % DURATION) / DURATION;
      const angle = getAngle(progress);
      // SVG rotate(angle cx cy) — no CSS, no transform-origin ambiguity
      crankRef.current?.setAttribute('transform', `rotate(${angle} ${PIVOT_X} ${PIVOT_Y})`);
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) { clearInterval(interval); return 100; }
        return Math.min(prev + (prev < 80 ? Math.random() * 3 : 1), 100);
      });
    }, 60);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const elapsed   = Date.now() - startTime.current;
      const remaining = Math.max(0, minimumLoadTime - elapsed);
      const timer = setTimeout(() => {
        setProgress(100);
        setTimeout(() => { setShowLoader(false); onLoadingComplete?.(); }, 600);
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [isLoading, minimumLoadTime, onLoadingComplete]);

  const fillHeight = (progress / 100) * BOTTLE_HEIGHT;
  const fillY      = BOTTLE_BOTTOM - fillHeight;

  return (
    <AnimatePresence>
      {showLoader && (
        <motion.div
          className="fixed inset-0 z-[100] overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.7, ease: 'easeInOut' } }}
        >
          {/* Background */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 42%, #1a1308 0%, #0d0a07 55%, #000 100%)' }}
          />

          {/* Warm centre glow */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: '50%', top: '44%',
              transform: 'translate(-50%, -50%)',
              width: 380, height: 380,
              background: 'radial-gradient(circle, rgba(184,134,11,0.13) 0%, transparent 65%)',
            }}
          />

          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ paddingBottom: '8vh' }}
          >
            <svg
              width="260"
              height="450"
              viewBox="0 0 260 450"
              overflow="visible"
              style={{ filter: 'drop-shadow(0 18px 52px rgba(184,134,11,0.2))' }}
            >
              <defs>
                {/* ── Gradients ── */}
                <linearGradient id="lgF" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#7A5A00" />
                  <stop offset="35%"  stopColor="#C8960C" />
                  <stop offset="62%"  stopColor="#DAA520" />
                  <stop offset="88%"  stopColor="#A87800" />
                  <stop offset="100%" stopColor="#5C4200" />
                </linearGradient>
                <linearGradient id="lgDr" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#5C3E00" />
                  <stop offset="24%"  stopColor="#9C6E0C" />
                  <stop offset="52%"  stopColor="#DAA520" />
                  <stop offset="78%"  stopColor="#B08010" />
                  <stop offset="100%" stopColor="#4A3000" />
                </linearGradient>
                <linearGradient id="lgSt" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor="#D8D8D8" />
                  <stop offset="45%"  stopColor="#F4F4F4" />
                  <stop offset="100%" stopColor="#9C9C9C" />
                </linearGradient>
                <linearGradient id="lgOil" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor="#F4D03F" stopOpacity="0.96" />
                  <stop offset="50%"  stopColor="#DAA520" stopOpacity="0.92" />
                  <stop offset="100%" stopColor="#9C7410" stopOpacity="0.97" />
                </linearGradient>
                <linearGradient id="lgGl" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="rgba(200,220,255,0.09)" />
                  <stop offset="22%"  stopColor="rgba(255,255,255,0.21)"  />
                  <stop offset="58%"  stopColor="rgba(200,220,255,0.05)"  />
                  <stop offset="100%" stopColor="rgba(200,220,255,0.11)"  />
                </linearGradient>
                {/* Arm — left-to-right so the left end is darkest (shadow) */}
                <linearGradient id="lgArm" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#8B6914" />
                  <stop offset="50%"  stopColor="#DAA520" />
                  <stop offset="100%" stopColor="#C8960C" />
                </linearGradient>

                {/* ── Clip path for bottle fill ── */}
                <clipPath id="bClip">
                  <rect x="109" y={BOTTLE_TOP} width="42" height={BOTTLE_HEIGHT} rx="4" />
                </clipPath>

                {/* ── Filters ── */}
                <filter id="fDrop" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="2.5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="fKnob" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ════════════════════════════════
                  Z-ORDER (back → front):
                  1. Seeds (behind everything)
                  2. Stand / frame
                  3. Drum body
                  4. Tray
                  5. Shaft + motor housing
                  6. Crank arm
                  7. Basin + spout
                  8. Oil drops
                  9. Bottle
                  ════════════════════════════════ */}

              {/* ── 1. SEEDS FALLING (behind machine) ── */}
              {SEEDS.map(seed => (
                <motion.ellipse
                  key={seed.id}
                  cx={seed.x}
                  cy={0}
                  rx={seed.rx}
                  ry={seed.ry}
                  fill="#7B3F00"
                  initial={{ y: -25, opacity: 0 }}
                  animate={{ y: [-25, 108], opacity: [0, 0.88, 0.88, 0] }}
                  transition={{
                    duration: seed.duration,
                    delay:    seed.delay,
                    repeat:   Infinity,
                    ease:     [0.28, 0, 0.72, 1],
                  }}
                />
              ))}

              {/* ── 2. STAND / FRAME ── */}
              <rect x="76"  y="210" width="10"  height="106" fill="url(#lgF)" rx="2" />
              <rect x="174" y="210" width="10"  height="106" fill="url(#lgF)" rx="2" />
              <rect x="76"  y="268" width="108" height="7"   fill="url(#lgF)" rx="2" />
              <rect x="62"  y="311" width="136" height="11"  fill="url(#lgF)" rx="3" />
              <rect x="54"  y="320" width="38"  height="9"   fill="url(#lgF)" rx="2" />
              <rect x="168" y="320" width="38"  height="9"   fill="url(#lgF)" rx="2" />

              {/* ── 3. DRUM BODY ── */}
              <rect x="90" y="126" width="80" height="118" fill="url(#lgDr)" rx="3" />
              {/* top face */}
              <ellipse cx="130" cy="126" rx="42" ry="10" fill="#B8860B" />
              <ellipse cx="130" cy="126" rx="39" ry="8"  fill="#DAA520" />
              {/* bottom face */}
              <ellipse cx="130" cy="244" rx="42" ry="10" fill="#6B4E00" />
              {/* highlight stripe */}
              <rect x="101" y="129" width="13" height="112" fill="rgba(255,255,255,0.055)" rx="1" />
              {/* horizontal bands */}
              <rect x="88" y="155" width="84" height="4" fill="#5C3E00" rx="1" />
              <rect x="88" y="210" width="84" height="4" fill="#5C3E00" rx="1" />
              {/* rivets */}
              {[95, 116, 144, 165].map((x, i) => (
                <circle key={i} cx={x} cy={183} r={2}
                  fill="#7A5800" stroke="rgba(218,165,32,0.55)" strokeWidth="0.5" />
              ))}

              {/* ── 4. TOP TRAY (seed pan) ── */}
              <ellipse cx="130" cy="122" rx="78" ry="15" fill="#505050" />
              <ellipse cx="130" cy="114" rx="78" ry="15" fill="url(#lgSt)" />
              <ellipse cx="130" cy="114" rx="69" ry="11" fill="#C8C8C8" />
              <ellipse cx="130" cy="116" rx="59" ry="8"  fill="rgba(0,0,0,0.24)" />
              {/* static seeds sitting in tray */}
              {[84, 104, 130, 152, 170].map((x, i) => (
                <ellipse key={i} cx={x} cy={115} rx={2.5} ry={1.4} fill="#7B3F00" opacity="0.55" />
              ))}

              {/* ── 5. DRIVE SHAFT + MOTOR HOUSING ── */}
              {/* Vertical centre shaft (static — just visual) */}
              <rect x="128" y="78" width="4" height="162" fill="#5C3500" rx="1.5" />
              <rect x="129.5" y="78" width="1.5" height="162" fill="rgba(240,185,60,0.1)" rx="0.5" />

              {/* Shaft hub at tray centre */}
              <circle cx="130" cy="110" r="8"  fill="#DAA520" />
              <circle cx="130" cy="110" r="5"  fill="#C0850A" />
              <circle cx="130" cy="110" r="2"  fill="rgba(255,220,100,0.65)" />

              {/* Motor housing block — anchors the crank arm */}
              <rect x="146" y="54" width="32" height="24" fill="url(#lgF)" rx="3" />
              <rect x="148" y="56" width="28" height="20" fill="#B8860B"     rx="2" />
              {/* housing highlight */}
              <rect x="149" y="57" width="10" height="18" fill="rgba(255,230,100,0.1)" rx="1" />
              {/* bolts on housing */}
              {[151, 170].map((x, i) => (
                <circle key={i} cx={x} cy={66} r={2} fill="#8B6914" stroke="rgba(218,165,32,0.5)" strokeWidth="0.5" />
              ))}
              {/* vertical brace connecting housing down to tray area */}
              <rect x="158" y="78" width="6" height="38" fill="url(#lgF)" rx="1.5" />

              {/* ── 6. CRANK ARM (the mechanical handle) ── */}
              {/*
                All arm elements drawn in global SVG coords.
                transformBox:'view-box' + transformOrigin in SVG-viewport px
                forces CSS rotation to anchor exactly at (PIVOT_X, PIVOT_Y).
                Framer Motion rotates around (0,0) of the view-box-relative
                origin, which is the physical pin joint — no bounding-box drift.
              */}
              {/* rotate(angle cx cy) is SVG-native — no CSS, no transform-origin, mathematically exact */}
              <g ref={crankRef} transform={`rotate(-8 ${PIVOT_X} ${PIVOT_Y})`}>
                {/* Main arm bar */}
                <line
                  x1={PIVOT_X}      y1={PIVOT_Y}
                  x2={PIVOT_X - 90} y2={PIVOT_Y}
                  stroke="url(#lgArm)" strokeWidth="10" strokeLinecap="round"
                />
                {/* Top-edge highlight */}
                <line
                  x1={PIVOT_X - 4}  y1={PIVOT_Y - 2}
                  x2={PIVOT_X - 84} y2={PIVOT_Y - 2}
                  stroke="rgba(255,230,120,0.22)" strokeWidth="3" strokeLinecap="round"
                />
                {/* Bottom-edge shadow */}
                <line
                  x1={PIVOT_X - 4}  y1={PIVOT_Y + 3}
                  x2={PIVOT_X - 84} y2={PIVOT_Y + 3}
                  stroke="rgba(0,0,0,0.28)" strokeWidth="2" strokeLinecap="round"
                />

                {/* Spring-coil section */}
                {[-50, -57, -64, -71, -78].map((dx, i) => (
                  <g key={i}>
                    <line
                      x1={PIVOT_X + dx} y1={PIVOT_Y - 6}
                      x2={PIVOT_X + dx} y2={PIVOT_Y + 6}
                      stroke="#8B6914" strokeWidth="2" strokeLinecap="round"
                    />
                    <line
                      x1={PIVOT_X + dx} y1={PIVOT_Y - 6}
                      x2={PIVOT_X + dx} y2={PIVOT_Y + 6}
                      stroke="rgba(255,200,60,0.28)" strokeWidth="0.8" strokeLinecap="round"
                    />
                  </g>
                ))}

                {/* Handle knob at far end of arm */}
                <circle cx={PIVOT_X - 90} cy={PIVOT_Y} r={12} fill="#6B4E00" />
                <circle cx={PIVOT_X - 90} cy={PIVOT_Y} r={9}  fill="#DAA520" />
                <circle cx={PIVOT_X - 90} cy={PIVOT_Y} r={6}  fill="#C0850A" />
                <circle cx={PIVOT_X - 90} cy={PIVOT_Y} r={2.5}
                  fill="rgba(255,235,100,0.7)" filter="url(#fKnob)" />
              </g>

              {/* Pivot joint — completely static, never inside motion.g */}
              <circle cx={PIVOT_X} cy={PIVOT_Y} r={10} fill="#5C3E00" />
              <circle cx={PIVOT_X} cy={PIVOT_Y} r={7}  fill="#DAA520" />
              <circle cx={PIVOT_X} cy={PIVOT_Y} r={4}  fill="#C0850A" />
              <circle cx={PIVOT_X} cy={PIVOT_Y} r={1.8} fill="rgba(255,235,100,0.8)" />

              {/* ── 7. COLLECTION BASIN ── */}
              <ellipse cx="130" cy="249" rx="56" ry="12" fill="#8B6914" />
              <rect    x="74"  y="247" width="112" height="14" fill="#8B6914" />
              <ellipse cx="130" cy="261" rx="56" ry="12" fill="#6B4E00" />
              <ellipse cx="130" cy="249" rx="56" ry="12" fill="none"
                stroke="rgba(218,165,32,0.42)" strokeWidth="1.5" />
              {/* pooled oil shimmer */}
              <ellipse cx="130" cy="256" rx="46" ry="7" fill="rgba(218,165,32,0.14)" />

              {/* Drip spout (centre-bottom of basin) */}
              <rect x="128" y="261" width="4" height="22" fill="#5C3E00" rx="1.5" />

              {/* ── 8. OIL DROPS — synced to crank compression ── */}
              {/*
                Each drop lives inside one full CRANK_DURATION cycle.
                It stays invisible until T_HOLD_END (when the arm is fully pressed),
                then falls and fades before the cycle resets.
                A second drop is offset by half a cycle so there's always one mid-fall.
              */}
              {[0, 1].map(i => (
                <motion.circle
                  key={i}
                  cx={130}
                  cy={283}
                  r={3}
                  fill="#DAA520"
                  filter="url(#fDrop)"
                  animate={{
                    y:       [0,          0,          0,                  26,    38  ],
                    opacity: [0,          0,          0.92,               0.65,  0   ],
                    r:       [2,          2,          3.5,                2.5,   1.2 ],
                  }}
                  transition={{
                    duration: CRANK_DURATION,
                    times:    [0, T_HOLD_END - 0.01, T_HOLD_END + 0.03, 0.82,  1.0 ],
                    delay:    i * (CRANK_DURATION / 2),
                    repeat:   Infinity,
                    ease:     ['linear', 'easeOut', 'easeIn', 'easeIn'],
                  }}
                />
              ))}

              {/* ── 9. BOTTLE ── */}
              {/* neck */}
              <rect x="122" y="248" width="16" height="36"
                fill="rgba(200,220,255,0.09)" stroke="rgba(255,255,255,0.17)" strokeWidth="1" rx="3" />
              {/* cap */}
              <rect x="120" y="243" width="20" height="9" fill="#DAA520" rx="2.5" />
              <rect x="122" y="243" width="6"  height="9" fill="rgba(255,255,255,0.15)" rx="1" />
              {/* body */}
              <rect x="109" y={BOTTLE_TOP} width="42" height={BOTTLE_HEIGHT}
                fill="url(#lgGl)" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" rx="5" />
              {/* oil fill */}
              <g clipPath="url(#bClip)">
                {fillHeight > 0 && (
                  <>
                    <rect x="109" y={fillY}     width="42" height={fillHeight} fill="url(#lgOil)" />
                    {/* surface shimmer line */}
                    <rect x="109" y={fillY}     width="42" height="3"          fill="rgba(255,232,100,0.42)" />
                  </>
                )}
              </g>
              {/* glass shine */}
              <rect x="113" y={BOTTLE_TOP + 3} width="9" height={BOTTLE_HEIGHT - 6}
                fill="rgba(255,255,255,0.07)" rx="2" />
              {/* ground shadow */}
              <ellipse cx="130" cy={BOTTLE_BOTTOM + 6} rx="22" ry="5" fill="rgba(0,0,0,0.32)" />

              {/* Progress label */}
              <text
                x="130"
                y={BOTTLE_BOTTOM + 20}
                textAnchor="middle"
                fill="rgba(218,165,32,0.52)"
                fontSize="8"
                fontFamily="'Courier New', monospace"
                letterSpacing="2"
              >
                {Math.round(progress)}%
              </text>
            </svg>

            {/* Brand */}
            <div className="text-center -mt-3">
              <div
                className="mx-auto mb-2 h-px w-8"
                style={{ background: 'linear-gradient(to right, transparent, rgba(212,165,116,0.5), transparent)' }}
              />
              <h1
                className="text-2xl font-serif text-white tracking-[0.14em]"
                style={{ textShadow: '0 0 36px rgba(212,165,116,0.36)' }}
              >
                NATURELITE
              </h1>
              <p className="text-[#d4a574]/70 text-[10px] tracking-[0.32em] uppercase mt-0.5">
                Pure &amp; Natural
              </p>
            </div>
          </div>

          {/* Corner brackets */}
          <div className="absolute top-6 left-6  w-10 h-10 border-l border-t border-[#d4a574]/15" />
          <div className="absolute top-6 right-6 w-10 h-10 border-r border-t border-[#d4a574]/15" />
          <div className="absolute bottom-6 left-6  w-10 h-10 border-l border-b border-[#d4a574]/15" />
          <div className="absolute bottom-6 right-6 w-10 h-10 border-r border-b border-[#d4a574]/15" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
