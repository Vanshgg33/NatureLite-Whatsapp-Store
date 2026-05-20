'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface WoodPressedOilCategoryCardProps {
  categoryId: string;
  className?: string;
}

const OilDrop = ({ delay, x }: { delay: number; x: number }) => (
  <motion.div
    className="absolute top-0 w-1 rounded-b-full"
    style={{ left: x, background: 'linear-gradient(180deg, #f59e0b 0%, #92400e 100%)' }}
    animate={{ height: ['6px', '22px', '6px'], y: [0, 6, 0], opacity: [0.6, 1, 0.6] }}
    transition={{ duration: 2.2, repeat: Infinity, delay, ease: 'easeInOut' }}
  />
);

export default function WoodPressedOilCategoryCard({
  categoryId,
  className = '',
}: WoodPressedOilCategoryCardProps) {
  return (
    <Link href={`/products?category=${categoryId}`} className={`block h-full ${className}`}>
      <motion.div
        className="group relative rounded-3xl overflow-hidden h-[280px] sm:h-[320px] lg:h-[360px] cursor-pointer"
        whileHover="hovered"
        initial="idle"
      >
        {/* ── Warm amber base ── */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-950 via-amber-900 to-yellow-900" />

        {/* ── Bottle product shot fills card as bg ── */}
        <motion.div
          className="absolute inset-0"
          variants={{ idle: { scale: 1 }, hovered: { scale: 1.06 } }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <Image
            src="/images/wood-pressed-oil-bottle.png"
            alt="Wood pressed oil"
            fill
            className="object-cover object-center opacity-70"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          {/* warm tint restore */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950/60 via-amber-900/40 to-transparent" />
        </motion.div>

        {/* ── Machine ghost on left half (multiply blend hides white bg) ── */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1/2 overflow-hidden"
          style={{ mixBlendMode: 'multiply' }}
        >
          <motion.div
            className="relative h-full"
            variants={{ idle: { opacity: 0.55, x: 0 }, hovered: { opacity: 0.38, x: -6 } }}
            transition={{ duration: 0.6 }}
          >
            <Image
              src="/images/wood-press-machine.png"
              alt="Traditional ghani wood press machine"
              fill
              className="object-contain object-center scale-90"
              sizes="200px"
            />
          </motion.div>
        </div>

        {/* ── Diagonal SVG divider — machine→bottle ── */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="divGold" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(251,191,36,0)" />
              <stop offset="50%" stopColor="rgba(251,191,36,0.35)" />
              <stop offset="100%" stopColor="rgba(251,191,36,0)" />
            </linearGradient>
          </defs>
          <polygon points="38%,0 48%,0 42%,100% 32%,100%" fill="url(#divGold)" />
        </svg>

        {/* ── Oil drip trio top-right corner ── */}
        <div className="absolute top-0 right-10 h-10 w-10 pointer-events-none">
          <OilDrop delay={0} x={0} />
          <OilDrop delay={0.7} x={10} />
          <OilDrop delay={1.4} x={20} />
        </div>

        {/* ── Shimmer sweep on hover ── */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(110deg, transparent 25%, rgba(251,191,36,0.18) 50%, transparent 75%)',
            backgroundSize: '200% 100%',
          }}
          variants={{
            idle: { backgroundPosition: '-100% 0', opacity: 0 },
            hovered: { backgroundPosition: '200% 0', opacity: 1 },
          }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
        />

        {/* ── Badge: कच्ची घाणी ── */}
        <div className="absolute top-4 left-4 z-10">
          <motion.div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-yellow-500/50 bg-amber-950/75 backdrop-blur-sm"
            variants={{ idle: { scale: 1 }, hovered: { scale: 1.04 } }}
          >
            {/* small oil-drop icon inline SVG */}
            <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="text-yellow-400">
              <path
                d="M5 0 C5 0 0 6 0 9 a5 5 0 0 0 10 0 C10 6 5 0 5 0Z"
                fill="currentColor"
                opacity="0.9"
              />
            </svg>
            <span className="text-yellow-300 text-xs font-semibold tracking-wide">कच्ची घाणी</span>
          </motion.div>
        </div>

        {/* ── Bottom gradient + text ── */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-amber-950 via-amber-950/80 to-transparent pointer-events-none" />

        <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8 z-10">
          <motion.div
            className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30"
            variants={{ idle: { opacity: 0.85 }, hovered: { opacity: 1 } }}
          >
            <span className="text-yellow-200 text-[10px] font-bold tracking-[0.18em] uppercase">
              Traditional Wood Press
            </span>
          </motion.div>

          <motion.h3
            className="font-display text-xl sm:text-2xl font-bold text-white leading-tight mb-1"
            variants={{ idle: { y: 0 }, hovered: { y: -4 } }}
            transition={{ duration: 0.3 }}
          >
            Wood Pressed Oils
          </motion.h3>

          <motion.p
            className="text-yellow-300/75 text-xs font-medium tracking-[0.22em] mb-3"
            variants={{ idle: { y: 0, opacity: 0.75 }, hovered: { y: -4, opacity: 1 } }}
            transition={{ duration: 0.3, delay: 0.04 }}
          >
            Pure  •  Natural  •  Unrefined
          </motion.p>

          <motion.div
            className="flex items-center gap-2 text-yellow-300 text-sm font-semibold"
            variants={{ idle: { x: 0 }, hovered: { x: 5 } }}
            transition={{ duration: 0.3 }}
          >
            <span>Shop Now</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </motion.div>
        </div>

        {/* ── Hover gold border ring ── */}
        <motion.div
          className="absolute inset-0 rounded-3xl border-2 pointer-events-none"
          variants={{
            idle: { borderColor: 'rgba(251,191,36,0)', opacity: 0 },
            hovered: { borderColor: 'rgba(251,191,36,0.55)', opacity: 1 },
          }}
          transition={{ duration: 0.3 }}
        />
      </motion.div>
    </Link>
  );
}
