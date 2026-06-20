'use client';

import { useRef, useEffect, useState, Suspense, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  AnimatePresence,
} from 'framer-motion';
import * as THREE from 'three';
import { ArrowRight, Leaf, Heart, Users, Award } from 'lucide-react';

// ── Precomputed seed data ──────────────────────────────────────────────────────
const SEED_DATA = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const radius = 2.4 + (i % 3) * 0.65;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * 1.65,
    z: -0.9 - (i % 5) * 0.28,
    r: 0.065 + (i % 4) * 0.022,
    phase: i * (Math.PI / 6),
    group: (i % 3) as 0 | 1 | 2,
  };
});
const SEED_GROUPS: { color: string; seeds: typeof SEED_DATA }[] = [
  { color: '#c8a030', seeds: SEED_DATA.filter((s) => s.group === 0) },
  { color: '#4a8c2a', seeds: SEED_DATA.filter((s) => s.group === 1) },
  { color: '#8b5e2a', seeds: SEED_DATA.filter((s) => s.group === 2) },
];

// ── Instanced seeds ───────────────────────────────────────────────────────────
function SeedGroup({ color, seeds }: { color: string; seeds: typeof SEED_DATA }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    seeds.forEach((s, i) => {
      pos.set(s.x, s.y + Math.sin(t * 0.65 + s.phase) * 0.2, s.z);
      scl.setScalar(s.r);
      mat.compose(pos, quat, scl);
      ref.current!.setMatrixAt(i, mat);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, seeds.length]}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.28} />
    </instancedMesh>
  );
}

// ── Ring ──────────────────────────────────────────────────────────────────────
function Ring({
  position, rotation = [0, 0, 0], R = 1, tube = 0.12, color = '#c8860a', spd = 0.004, pulse = false,
}: {
  position: [number, number, number]; rotation?: [number, number, number];
  R?: number; tube?: number; color?: string; spd?: number; pulse?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y += spd;
    ref.current.rotation.x += spd * 0.65;
    if (pulse) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 1.1) * 0.04;
      ref.current.scale.setScalar(s);
    }
  });
  return (
    <Float speed={1.1} floatIntensity={0.38} rotationIntensity={0.15}>
      <mesh ref={ref} position={position} rotation={rotation}>
        <torusGeometry args={[R, tube, 24, 72]} />
        <meshStandardMaterial color={color} metalness={0.97} roughness={0.05} />
      </mesh>
    </Float>
  );
}

// ── Oil drop ──────────────────────────────────────────────────────────────────
function Drop({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.35;
    ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.4) * 0.12;
  });
  return (
    <Float speed={1.6} floatIntensity={0.65}>
      <mesh ref={ref} position={position} scale={scale}>
        <sphereGeometry args={[0.46, 28, 28]} />
        <meshStandardMaterial color="#c8860a" metalness={0.78} roughness={0.06} />
      </mesh>
    </Float>
  );
}

// ── Hero 3D scene ─────────────────────────────────────────────────────────────
function HeroScene({ mouseRef }: { mouseRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    g.current.rotation.y += (mouseRef.current.x * 0.36 - g.current.rotation.y) * 0.042;
    g.current.rotation.x += (-mouseRef.current.y * 0.18 - g.current.rotation.x) * 0.042;
  });
  return (
    <>
      <ambientLight intensity={0.2} color="#fff4d0" />
      <pointLight position={[5, 5, 5]} intensity={4} color="#d4900a" />
      <pointLight position={[-4, -4, -3]} intensity={1.8} color="#4a8c2a" />
      <pointLight position={[2, -5, 3]} intensity={1.5} color="#c86020" />
      <group ref={g}>
        <Ring position={[0, 0, 0]} R={1.45} tube={0.17} spd={0.004} pulse />
        <Ring position={[2.5, 0.7, -1.8]} R={0.68} tube={0.09} color="#4a8c2a" rotation={[1.1, 0.4, 0.2]} spd={0.005} />
        <Ring position={[-2.2, -0.5, -1.1]} R={0.55} tube={0.08} color="#8b5e2a" rotation={[0.3, 1.3, 0.6]} spd={0.006} />
        <Drop position={[1.8, -1.2, -0.5]} scale={0.82} />
        <Drop position={[-1.5, 1.0, -1.1]} scale={0.56} />
        {SEED_GROUPS.map((g) => <SeedGroup key={g.color} color={g.color} seeds={g.seeds} />)}
        <Sparkles count={65} scale={9} size={1.6} speed={0.22} color="#d4a92a" opacity={0.5} />
      </group>
    </>
  );
}

// ── Custom RAF-lerp cursor ─────────────────────────────────────────────────────
function Cursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -200, y: -200 });
  const ring = useRef({ x: -200, y: -200 });
  const raf = useRef<number>();
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) dotRef.current.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 3}px)`;
    };
    const onEnter = () => setHovering(true);
    const onLeave = () => setHovering(false);

    const animate = () => {
      ring.current.x += (mouse.current.x - ring.current.x) * 0.1;
      ring.current.y += (mouse.current.y - ring.current.y) * 0.1;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${ring.current.x - 20}px,${ring.current.y - 20}px)`;
      }
      raf.current = requestAnimationFrame(animate);
    };

    raf.current = requestAnimationFrame(animate);
    window.addEventListener('mousemove', onMove, { passive: true });
    document.querySelectorAll('a,button,[data-hover]').forEach((el) => {
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <>
      <div
        ref={ringRef}
        style={{
          position: 'fixed', top: 0, left: 0, width: hovering ? 52 : 40, height: hovering ? 52 : 40,
          border: `1.5px solid rgba(160,112,16,${hovering ? 0.9 : 0.6})`,
          borderRadius: '50%', pointerEvents: 'none', zIndex: 99999,
          transition: 'width 0.2s, height 0.2s, border-color 0.2s',
          background: hovering ? 'rgba(160,112,16,0.07)' : 'transparent',
        }}
      />
      <div
        ref={dotRef}
        style={{
          position: 'fixed', top: 0, left: 0, width: 6, height: 6,
          background: '#a07010', borderRadius: '50%', pointerEvents: 'none', zIndex: 99999,
        }}
      />
    </>
  );
}

// ── Word-by-word clip reveal ───────────────────────────────────────────────────
function WordReveal({
  text, animate: anim, delay = 0, style, className,
}: {
  text: string; animate: boolean; delay?: number; style?: React.CSSProperties; className?: string;
}) {
  return (
    <span style={{ display: 'block', ...style }} className={className}>
      {text.split(' ').map((word, i) => (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', marginRight: '0.28em' }}>
          <motion.span
            style={{ display: 'inline-block' }}
            initial={{ y: '110%', opacity: 0 }}
            animate={anim ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.78, delay: delay + i * 0.075, ease: [0.22, 1, 0.36, 1] }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

// ── CSS 3D tilt card ──────────────────────────────────────────────────────────
function TiltCard({ children, style, className }: {
  children: React.ReactNode; style?: React.CSSProperties; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0); const my = useMotionValue(0);
  const rx = useTransform(my, [-0.5, 0.5], [12, -12]);
  const ry = useTransform(mx, [-0.5, 0.5], [-12, 12]);
  const srx = useSpring(rx, { stiffness: 260, damping: 30 });
  const sry = useSpring(ry, { stiffness: 260, damping: 30 });
  const scale = useSpring(1, { stiffness: 300, damping: 30 });
  return (
    <motion.div
      ref={ref} className={className}
      style={{ ...style, rotateX: srx, rotateY: sry, scale, transformStyle: 'preserve-3d', willChange: 'transform' }}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
        scale.set(1.018);
      }}
      onMouseLeave={() => { mx.set(0); my.set(0); scale.set(1); }}
    >
      {children}
    </motion.div>
  );
}

// ── Scramble counter ──────────────────────────────────────────────────────────
const CHARS = '0123456789';
function ScrambleCounter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [display, setDisplay] = useState(`0${suffix}`);
  useEffect(() => {
    if (!inView) return;
    const totalMs = 1600, scrambleEndMs = 1000;
    const t0 = Date.now();
    const digits = String(to).length;
    const tick = () => {
      const elapsed = Date.now() - t0;
      const progress = Math.min(elapsed / totalMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const cur = Math.round(eased * to);
      if (elapsed < scrambleEndMs) {
        const curStr = String(cur).padStart(digits, '0');
        const chance = 1 - elapsed / scrambleEndMs;
        setDisplay(curStr.split('').map((c) => Math.random() < chance * 0.7 ? CHARS[Math.floor(Math.random() * 10)] : c).join('') + suffix);
      } else {
        setDisplay(String(cur) + suffix);
      }
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, suffix]);
  return <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>{display}</span>;
}

// ── Ambient floating orbs (cream bg atmosphere) ────────────────────────────────
function AmbientOrbs() {
  const orbs = [
    { size: 320, x: '8%', y: '15%', color: 'rgba(26,82,16,0.035)', dur: 9 },
    { size: 220, x: '72%', y: '55%', color: 'rgba(160,112,16,0.04)', dur: 12 },
    { size: 160, x: '42%', y: '78%', color: 'rgba(139,94,43,0.03)', dur: 10 },
    { size: 280, x: '85%', y: '10%', color: 'rgba(26,82,16,0.025)', dur: 14 },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          style={{ position: 'absolute', width: o.size, height: o.size, borderRadius: '50%', background: o.color, left: o.x, top: o.y, filter: 'blur(48px)' }}
          animate={{ x: [0, 18, -12, 0], y: [0, -14, 18, 0] }}
          transition={{ duration: o.dur, repeat: Infinity, ease: 'easeInOut', delay: i * 1.2 }}
        />
      ))}
    </div>
  );
}

// ── Magnetic CTA button with shimmer ─────────────────────────────────────────
function MagneticCta({ href, label }: { href: string; label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0); const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 160, damping: 20 });
  const sy = useSpring(my, { stiffness: 160, damping: 20 });
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      ref={wrapRef} style={{ display: 'inline-block', x: sx, y: sy }}
      onMouseMove={(e) => {
        const r = wrapRef.current!.getBoundingClientRect();
        mx.set((e.clientX - r.left - r.width / 2) * 0.28);
        my.set((e.clientY - r.top - r.height / 2) * 0.28);
        setHovered(true);
      }}
      onMouseLeave={() => { mx.set(0); my.set(0); setHovered(false); }}
    >
      <Link
        href={href}
        style={{
          position: 'relative', overflow: 'hidden',
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '15px 34px', borderRadius: 999,
          fontWeight: 600, fontSize: '0.9rem',
          background: '#a07010', color: '#fff',
          boxShadow: hovered ? '0 12px 44px -6px rgba(160,112,16,0.72)' : '0 6px 28px -4px rgba(160,112,16,0.55)',
          transition: 'box-shadow 0.3s',
        }}
      >
        <motion.div
          style={{ position: 'absolute', top: 0, bottom: 0, width: '55%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)', left: '-55%' }}
          animate={hovered ? { left: '150%' } : { left: '-55%' }}
          transition={{ duration: 0.52, ease: 'easeInOut' }}
        />
        <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
        <motion.span
          style={{ position: 'relative', zIndex: 1, display: 'flex' }}
          animate={hovered ? { x: 4 } : { x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ArrowRight size={16} />
        </motion.span>
      </Link>
    </motion.div>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────
const CHAPTERS = [
  {
    num: '01', tag: 'Origin', accent: '#4a8c2a',
    title: 'A Question of Purity',
    body: [
      'In 2019, our founders visited a village oil mill in rural Maharashtra and tasted sesame oil pressed that very morning. The difference was startling — nutty, golden, alive.',
      'That visit planted a seed. If ancient methods still produced better results, why had the world abandoned them?',
    ],
  },
  {
    num: '02', tag: 'Craft', accent: '#a07010',
    title: 'The Wooden Press',
    body: [
      'The Ghani churner is over 5,000 years old. Seeds are pressed at room temperature — no heat, no chemicals. The oil that emerges is alive with flavour and nutrients.',
      'We partnered with traditional Ghani mills across five states, committed to scaling their craft without compromising it.',
    ],
  },
  {
    num: '03', tag: 'Community', accent: '#8b5e2a',
    title: 'Rooted in Relationships',
    body: [
      'We don\'t just buy from farmers — we grow with them. Premium pricing, advance payments before harvest, and natural farming workshops.',
      'When you open a bottle of Purity Foods, you complete a chain from a small farm to your kitchen — untouched and whole.',
    ],
  },
];

const PROCESS = [
  { n: '01', title: 'Farm Sourcing', desc: 'Direct from organic farmers using traditional, chemical-free growing methods.', color: '#4a8c2a' },
  { n: '02', title: 'Cold-Pressing', desc: 'Wooden Ghani churners extract oil at room temperature. Zero heat, zero loss.', color: '#a07010' },
  { n: '03', title: 'Bilona Churning', desc: 'Ghee made from cultured curd, hand-churned in the ancient bilona method.', color: '#8b5e2a' },
  { n: '04', title: 'Quality Testing', desc: 'Every batch tested for purity, fatty acid profiles and shelf stability.', color: '#c86020' },
];

const VALUES = [
  { Icon: Leaf,  title: 'Pure & Natural',  desc: 'No additives, no preservatives. Just nature, as intended.',        accent: '#4a8c2a' },
  { Icon: Heart, title: 'Made with Care',  desc: 'Crafted with love, honouring centuries of unbroken tradition.',    accent: '#a07010' },
  { Icon: Users, title: 'Community First', desc: 'Fair pay and sustainable livelihoods for every farming family.',  accent: '#8b5e2a' },
  { Icon: Award, title: 'Quality Assured', desc: 'Rigorous batch testing — every time, without a single exception.', accent: '#c86020' },
];

const STATS = [
  { to: 50,  suffix: 'k+', label: 'Families Served' },
  { to: 100, suffix: '+',  label: 'Products'         },
  { to: 5,   suffix: '+',  label: 'Years of Craft'   },
  { to: 100, suffix: '%',  label: 'Natural & Pure'   },
];

// ── Scroll-driven story section (replaces static chapter grid) ─────────────────
function ScrollStorySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  const smoothP = useSpring(scrollYProgress, { stiffness: 80, damping: 25 });
  const progressH = useTransform(smoothP, [0, 1], ['0%', '100%']);
  const [activeIdx, setActiveIdx] = useState(0);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setActiveIdx(v < 0.34 ? 0 : v < 0.67 ? 1 : 2);
  });

  return (
    <div ref={containerRef} style={{ height: '300vh' }}>
      <div style={{ position: 'sticky', top: 0, height: '100svh', background: '#08110a', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>

        {/* Animated bg glow */}
        <AnimatePresence>
          <motion.div
            key={activeIdx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            style={{
              position: 'absolute', left: '35%', top: '15%', width: 560, height: 420, borderRadius: '50%', filter: 'blur(90px)', pointerEvents: 'none',
              background: `radial-gradient(ellipse, ${CHAPTERS[activeIdx].accent}12, transparent 70%)`,
            }}
          />
        </AnimatePresence>

        {/* Grain overlay */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.3, mixBlendMode: 'overlay', backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.12 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

        {/* Right-edge progress track */}
        <div style={{ position: 'absolute', right: 32, top: '20%', height: '60%', width: 1, background: 'rgba(255,255,255,0.06)' }}>
          <motion.div style={{ width: '100%', background: `rgba(${activeIdx === 0 ? '74,140,42' : activeIdx === 1 ? '160,112,16' : '139,94,43'},0.7)`, height: progressH, transition: 'background 0.5s' }} />
          {CHAPTERS.map((ch, i) => (
            <motion.div
              key={i}
              style={{ position: 'absolute', top: `${(i / 2) * 100}%`, left: -5, width: 11, height: 11, borderRadius: '50%', border: `1px solid rgba(255,255,255,0.15)` }}
              animate={{ background: activeIdx >= i ? ch.accent : 'rgba(255,255,255,0.1)', scale: activeIdx === i ? 1.35 : 1 }}
              transition={{ duration: 0.4 }}
            />
          ))}
        </div>

        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 clamp(20px,5vw,80px)', width: '100%' }}>
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">

            {/* Left: text transitions */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIdx}
                initial={{ opacity: 0, x: -50, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 50, filter: 'blur(10px)' }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.p
                  style={{ fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase', color: CHAPTERS[activeIdx].accent, fontFamily: 'monospace', marginBottom: 18 }}
                >
                  {CHAPTERS[activeIdx].tag}
                </motion.p>
                <h2
                  className="font-display"
                  style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff8f0', marginBottom: 28, lineHeight: 1.1 }}
                >
                  {CHAPTERS[activeIdx].title}
                </h2>
                {CHAPTERS[activeIdx].body.map((para, i) => (
                  <p key={i} style={{ color: 'rgba(255,245,225,0.52)', lineHeight: 1.8, fontSize: '1.02rem', marginBottom: i === 0 ? 16 : 0 }}>
                    {para}
                  </p>
                ))}
                <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <motion.div
                    style={{ height: 2, borderRadius: 2, background: CHAPTERS[activeIdx].accent }}
                    initial={{ width: 0 }}
                    animate={{ width: 48 }}
                    transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <span style={{ fontSize: 9, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
                    {activeIdx + 1} / {CHAPTERS.length}
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Right: giant number with animated rings */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeIdx}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  initial={{ opacity: 0, scale: 1.15, rotate: -6 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.82, rotate: 6 }}
                  transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Orbiting ring 1 */}
                  <motion.div
                    style={{ position: 'absolute', inset: -28, borderRadius: '50%', border: `1.5px solid ${CHAPTERS[activeIdx].accent}35` }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                  />
                  {/* Orbiting ring 2 – counter-rotate */}
                  <motion.div
                    style={{ position: 'absolute', inset: -56, borderRadius: '50%', border: `1px dashed ${CHAPTERS[activeIdx].accent}18` }}
                    animate={{ rotate: -360 }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                  />
                  {/* Small dot on orbit ring 1 */}
                  <motion.div
                    style={{ position: 'absolute', inset: -28, borderRadius: '50%' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                  >
                    <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 7, height: 7, borderRadius: '50%', background: CHAPTERS[activeIdx].accent }} />
                  </motion.div>

                  <span
                    className="font-display"
                    style={{ display: 'block', fontSize: 'clamp(7rem, 18vw, 13rem)', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.06em', color: 'transparent', WebkitTextStroke: `2px ${CHAPTERS[activeIdx].accent}45` }}
                  >
                    {CHAPTERS[activeIdx].num}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </div>

        {/* Scroll hint (only on first chapter) */}
        <AnimatePresence>
          {activeIdx === 0 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, rgba(212,169,42,0.5), transparent)' }}
              />
              <p style={{ fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(212,169,42,0.4)', fontFamily: 'monospace' }}>Keep scrolling</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Process section with drawing connector line ────────────────────────────────
function ProcessSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  return (
    <section ref={ref} id="process" style={{ padding: '7rem 0', background: '#0b1c08', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35, mixBlendMode: 'overlay', backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.12 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse, rgba(160,112,16,0.1) 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 clamp(20px,5vw,48px)' }}>
        <motion.div style={{ textAlign: 'center', marginBottom: '4rem' }} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          <p style={{ fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(212,169,42,0.65)', fontFamily: 'monospace', marginBottom: 14 }}>Our Craft</p>
          <h2 className="font-display" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, letterSpacing: '-0.025em', color: '#fff8f0' }}>How We Make It</h2>
        </motion.div>

        <div style={{ position: 'relative' }}>
          {/* Drawing connector line */}
          <div className="absolute hidden lg:block" style={{ top: 28, left: '12.5%', right: '12.5%', height: 1, overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', background: 'linear-gradient(90deg, transparent, rgba(160,112,16,0.35) 10%, rgba(160,112,16,0.35) 90%, transparent)', transformOrigin: 'left' }}
              initial={{ scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ delay: 0.3, duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PROCESS.map((step, i) => (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 50, rotateX: -20 }}
                animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
                transition={{ delay: 0.15 + i * 0.14, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -8, transition: { duration: 0.22 } }}
                style={{ background: 'rgba(255,252,245,0.04)', border: '1px solid rgba(255,252,245,0.08)', borderRadius: 20, padding: '28px 22px', cursor: 'default', willChange: 'transform', perspective: 600 }}
              >
                <motion.div
                  style={{ width: 52, height: 52, borderRadius: '50%', border: `1.5px solid ${step.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: `0 0 0 0px ${step.color}20` }}
                  whileHover={{ boxShadow: `0 0 0 8px ${step.color}15`, transition: { duration: 0.3 } }}
                >
                  <span className="font-display" style={{ fontWeight: 800, fontSize: '1rem', color: step.color }}>{step.n}</span>
                </motion.div>
                <h3 className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff8f0', marginBottom: 10 }}>{step.title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'rgba(255,245,225,0.44)', lineHeight: 1.7 }}>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Stats strip with scramble ─────────────────────────────────────────────────
function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  return (
    <div ref={ref} style={{ background: 'rgba(255,252,245,0.72)', borderTop: '1px solid rgba(26,82,16,0.08)', borderBottom: '1px solid rgba(26,82,16,0.08)', padding: '3.5rem 0' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 clamp(20px,5vw,48px)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {STATS.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 22 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: i * 0.1, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}>
              <p className="font-display" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, color: '#0b1c08', letterSpacing: '-0.03em', lineHeight: 1 }}>
                <ScrambleCounter to={s.to} suffix={s.suffix} />
              </p>
              <p style={{ marginTop: 6, fontSize: 11, letterSpacing: '0.05em', color: 'rgba(46,66,37,0.46)', textTransform: 'uppercase' }}>{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Values — 3D flip entrance + tilt ─────────────────────────────────────────
function ValuesSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  return (
    <section ref={ref} style={{ padding: '7rem 0', background: '#f2ece0', position: 'relative', overflow: 'hidden' }}>
      <AmbientOrbs />
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 clamp(20px,5vw,48px)', position: 'relative' }}>
        <motion.div style={{ textAlign: 'center', marginBottom: '3.5rem' }} initial={{ opacity: 0, y: 22 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}>
          <p style={{ fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase', color: 'rgba(46,66,37,0.42)', fontFamily: 'monospace', marginBottom: 12 }}>Our Values</p>
          <h2 className="font-display" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, letterSpacing: '-0.025em', color: '#0b1c08' }}>What We Stand For</h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5" style={{ perspective: 1400 }}>
          {VALUES.map(({ Icon, title, desc, accent }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, rotateY: 90, z: -60 }}
              animate={inView ? { opacity: 1, rotateY: 0, z: 0 } : {}}
              transition={{ delay: 0.08 + i * 0.12, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <TiltCard style={{ background: 'rgba(255,252,245,0.94)', border: `1px solid ${accent}18`, borderRadius: 24, padding: '28px 22px', cursor: 'default', boxShadow: `0 4px 28px -6px ${accent}14`, willChange: 'transform' }}>
                <motion.div
                  style={{ width: 50, height: 50, borderRadius: 15, marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}14`, transform: 'translateZ(22px)' }}
                  whileHover={{ rotate: [0, -8, 8, -4, 0], transition: { duration: 0.5 } }}
                >
                  <Icon size={22} style={{ color: accent }} />
                </motion.div>
                <h3 className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0b1c08', marginBottom: 10, transform: 'translateZ(14px)' }}>{title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'rgba(13,44,7,0.57)', lineHeight: 1.7, transform: 'translateZ(8px)' }}>{desc}</p>
                {/* Shimmer on card bottom border */}
                <motion.div
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: '0 0 24px 24px', background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                />
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA ────────────────────────────────────────────────────────────────────────
function CtaSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  return (
    <section ref={ref} style={{ position: 'relative', overflow: 'hidden', padding: '9rem 0', background: '#130b05' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.45, mixBlendMode: 'overlay', backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.14 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      {/* Animated radial glow */}
      <motion.div
        style={{ position: 'absolute', bottom: '-10%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 500, borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none', background: 'radial-gradient(ellipse, rgba(160,112,16,0.12) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(160,112,16,0.4), transparent)' }} />
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 clamp(20px,5vw,48px)', textAlign: 'center', position: 'relative' }}>
        <motion.div initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
          <p style={{ fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(212,169,42,0.6)', fontFamily: 'monospace', marginBottom: 20 }}>Experience the difference</p>
          <h2 className="font-display" style={{ fontSize: 'clamp(2rem, 5vw, 3.8rem)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: '#fff8f0', maxWidth: 620, margin: '0 auto 24px' }}>
            Taste Tradition in Every Drop
          </h2>
          <p style={{ color: 'rgba(255,245,225,0.44)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto 44px', fontSize: '1rem' }}>
            Explore our collection and bring centuries of craft to your kitchen.
          </p>
          <MagneticCta href="/products" label="Shop Our Products" />
        </motion.div>
      </div>
    </section>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function AboutClient() {
  const mouseRef = useRef({ x: 0, y: 0 });
  const [heroReady, setHeroReady] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '22%']);

  useEffect(() => {
    // Slight delay so initial paint is committed before animating words
    const t = setTimeout(() => setHeroReady(true), 80);
    const fn = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    window.addEventListener('mousemove', fn, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener('mousemove', fn); };
  }, []);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Cursor />

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section ref={heroRef} style={{ height: '100svh', position: 'relative', background: '#070f04', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Canvas
            camera={{ position: [0, 0, 5.5], fov: 42 }}
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
            dpr={[1, 1.5]}
            style={{ background: '#070f04' }}
          >
            <Suspense fallback={null}>
              <HeroScene mouseRef={mouseRef} />
            </Suspense>
          </Canvas>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(7,15,4,0.08) 0%, rgba(7,15,4,0.42) 52%, rgba(7,15,4,0.97) 100%)', pointerEvents: 'none' }} />

        <motion.div
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '10vh', opacity: heroOpacity, y: heroY, willChange: 'transform, opacity' }}
        >
          {/* Tag line */}
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontSize: 10, letterSpacing: '0.44em', textTransform: 'uppercase', color: 'rgba(212,169,42,0.72)', fontFamily: 'monospace', marginBottom: 24 }}
          >
            Our Story
          </motion.p>

          {/* Title — word reveal */}
          <h1 className="font-display" style={{ fontSize: 'clamp(2.4rem, 7vw, 5.6rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, textAlign: 'center', color: '#fff5e0', maxWidth: 820, padding: '0 24px' }}>
            <WordReveal text="Bringing Tradition" animate={heroReady} delay={0.55} style={{ marginBottom: '0.06em' }} />
            <WordReveal text="Back to Your Kitchen" animate={heroReady} delay={0.72} />
          </h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginTop: 22, fontSize: '1.05rem', color: 'rgba(255,245,225,0.48)', maxWidth: 460, textAlign: 'center', lineHeight: 1.72, padding: '0 24px' }}
          >
            No shortcuts. No compromises. Just authentic taste, made the way it was always meant to be.
          </motion.p>

          {/* Scroll cue */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 0.8 }}
            style={{ marginTop: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
          >
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 1, height: 52, background: 'linear-gradient(to bottom, rgba(212,169,42,0.65), transparent)' }}
            />
            <p style={{ fontSize: 9, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(212,169,42,0.45)' }}>Scroll</p>
          </motion.div>
        </motion.div>
      </section>

      {/* ── SCROLL STORY (3 chapters) ────────────────────────────── */}
      <ScrollStorySection />

      {/* ── PROCESS ─────────────────────────────────────────────── */}
      <ProcessSection />

      {/* ── STATS ───────────────────────────────────────────────── */}
      <StatsSection />

      {/* ── VALUES ──────────────────────────────────────────────── */}
      <ValuesSection />

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <CtaSection />
    </div>
  );
}
