'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  ShieldCheck,
  Leaf,
  Award,
  Truck,
  RefreshCcw,
  HeartHandshake,
} from 'lucide-react';

const badges = [
  {
    icon: ShieldCheck,
    title: '100% Pure',
    description: 'No additives, no preservatives, just pure goodness',
    color: 'text-brand-green',
    bg: 'bg-brand-green/10',
  },
  {
    icon: Leaf,
    title: 'Organic Sourced',
    description: 'From certified organic farms across India',
    color: 'text-brand-mustard',
    bg: 'bg-brand-mustard/10',
  },
  {
    icon: Award,
    title: 'Lab Tested',
    description: 'Every batch tested for purity and quality',
    color: 'text-brand-brown',
    bg: 'bg-brand-brown/10',
  },
  {
    icon: Truck,
    title: 'Fresh Delivery',
    description: 'Shipped within days of pressing',
    color: 'text-brand-terracotta',
    bg: 'bg-brand-terracotta/10',
  },
  {
    icon: RefreshCcw,
    title: 'Easy Returns',
    description: '7-day hassle-free return policy',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: HeartHandshake,
    title: 'Farmer Direct',
    description: 'Supporting traditional farming communities',
    color: 'text-brand-green-light',
    bg: 'bg-brand-green-light/10',
  },
];

export function TrustBadges() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  return (
    <section
      ref={sectionRef}
      className="relative py-16 lg:py-24 bg-white border-y border-brand-border"
    >
      <div className="brand-container">
        {/* Section Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-brand-charcoal">
            Why Choose Purity Foods
          </h2>
        </motion.div>

        {/* Badges Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {badges.map((badge, index) => {
            const Icon = badge.icon;
            return (
              <motion.div
                key={badge.title}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.4,
                  delay: 0.1 * index,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div
                  className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${badge.bg} flex items-center justify-center`}
                >
                  <Icon className={`w-7 h-7 ${badge.color}`} />
                </div>
                <h3 className="font-display text-base font-semibold text-brand-charcoal mb-1">
                  {badge.title}
                </h3>
                <p className="font-body text-xs text-brand-muted leading-relaxed">
                  {badge.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Alternative compact version for product pages
export function TrustBadgesCompact() {
  return (
    <div className="flex flex-wrap justify-center gap-6 py-6 border-y border-brand-border">
      {badges.slice(0, 4).map((badge) => {
        const Icon = badge.icon;
        return (
          <div key={badge.title} className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${badge.color}`} />
            <span className="font-body text-sm text-brand-text">
              {badge.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
