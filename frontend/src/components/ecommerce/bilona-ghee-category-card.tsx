'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface BilonaGheeCategoryCardProps {
  categoryId: string;
  className?: string;
}

const GheeDrop = ({ delay, x }: { delay: number; x: number }) => (
  <motion.div
    className="absolute top-0 rounded-b-full"
    style={{
      left: x,
      width: '5px',
      background: 'linear-gradient(180deg, #fbbf24 0%, #b45309 100%)',
    }}
    animate={{ height: ['5px', '18px', '5px'], y: [0, 5, 0], opacity: [0.5, 1, 0.5] }}
    transition={{ duration: 2.8, repeat: Infinity, delay, ease: 'easeInOut' }}
  />
);

export default function BilonaGheeCategoryCard({
  categoryId,
  className = '',
}: BilonaGheeCategoryCardProps) {
  return (
    <Link href={`/products?category=${categoryId}`} className={`block h-full ${className}`}>
      <motion.div
        className="group relative rounded-3xl overflow-hidden h-[280px] sm:h-[320px] lg:h-[360px] cursor-pointer"
        whileHover="hovered"
        initial="idle"
      >
        {/* ── Saffron-gold base ── */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-950 via-amber-900 to-yellow-800" />

        {/* ── Bilona illustration fills card ── */}
        <motion.div
          className="absolute inset-0"
          variants={{ idle: { scale: 1 }, hovered: { scale: 1.06 } }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <Image
            src="/images/bilona-method.png"
            alt="Ancient bilona method of making ghee"
            fill
            className="object-cover object-center"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          {/* warm saffron tint over white-bg image */}
          <div className="absolute inset-0 bg-gradient-to-br from-orange-900/72 via-amber-800/55 to-yellow-700/40" />
        </motion.div>

        {/* ── Right-side heritage texture vignette ── */}
        <div className="absolute inset-0 bg-gradient-to-l from-amber-950/50 via-transparent to-transparent pointer-events-none" />

        {/* ── Diagonal gold band divider ── */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bilonaDiv" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(251,191,36,0)" />
              <stop offset="50%" stopColor="rgba(251,191,36,0.28)" />
              <stop offset="100%" stopColor="rgba(251,191,36,0)" />
            </linearGradient>
          </defs>
          <polygon points="55%,0 65%,0 58%,100% 48%,100%" fill="url(#bilonaDiv)" />
        </svg>

        {/* ── Ghee drip trio top-right ── */}
        <div className="absolute top-0 right-10 h-10 w-10 pointer-events-none">
          <GheeDrop delay={0} x={0} />
          <GheeDrop delay={0.9} x={10} />
          <GheeDrop delay={1.8} x={20} />
        </div>

        {/* ── Shimmer on hover ── */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(115deg, transparent 25%, rgba(251,191,36,0.16) 50%, transparent 75%)',
            backgroundSize: '200% 100%',
          }}
          variants={{
            idle: { backgroundPosition: '-100% 0', opacity: 0 },
            hovered: { backgroundPosition: '200% 0', opacity: 1 },
          }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
        />

        {/* ── Badge: बिलोना विधि ── */}
        <div className="absolute top-4 left-4 z-10">
          <motion.div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-yellow-500/50 bg-orange-950/80 backdrop-blur-sm"
            variants={{ idle: { scale: 1 }, hovered: { scale: 1.04 } }}
          >
            {/* small clay-pot / matki icon */}
            <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
              <ellipse cx="5" cy="9" rx="4.5" ry="3.5" fill="#f59e0b" opacity="0.85" />
              <rect x="3.5" y="3" width="3" height="6" rx="1.5" fill="#d97706" opacity="0.7" />
              <ellipse cx="5" cy="3" rx="2" ry="1" fill="#fbbf24" opacity="0.9" />
            </svg>
            <span className="text-yellow-200 text-xs font-semibold tracking-wide">बिलोना विधि</span>
          </motion.div>
        </div>

        {/* ── Bottom gradient + content ── */}
        <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-orange-950 via-orange-950/85 to-transparent pointer-events-none" />

        <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8 z-10">
          <motion.div
            className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30"
            variants={{ idle: { opacity: 0.85 }, hovered: { opacity: 1 } }}
          >
            <span className="text-yellow-200 text-[10px] font-bold tracking-[0.18em] uppercase">
              Ancient Bilona Method
            </span>
          </motion.div>

          <motion.h3
            className="font-display text-xl sm:text-2xl font-bold text-white leading-tight mb-1"
            variants={{ idle: { y: 0 }, hovered: { y: -4 } }}
            transition={{ duration: 0.3 }}
          >
            Bilona Ghee
          </motion.h3>

          <motion.p
            className="text-yellow-300/75 text-xs font-medium tracking-[0.22em] mb-3"
            variants={{ idle: { y: 0, opacity: 0.75 }, hovered: { y: -4, opacity: 1 } }}
            transition={{ duration: 0.3, delay: 0.04 }}
          >
            Hand-Churned  •  A2 Milk  •  Heritage
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
