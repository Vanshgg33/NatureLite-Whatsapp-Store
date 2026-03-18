'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { PremiumProductCard } from '@/components/ecommerce/premium-product-card';
import { Product } from '@/types';

type PillKey = 'best' | 'new' | 'under499' | 'deals';

const PILLS: { key: PillKey; label: string }[] = [
  { key: 'best', label: 'Best sellers' },
  { key: 'new', label: 'New' },
  { key: 'under499', label: 'Under ₹499' },
  { key: 'deals', label: 'Deals' },
];

function filterProducts(products: Product[], pill: PillKey): Product[] {
  switch (pill) {
    case 'best':
      return [...products].sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0));
    case 'new':
      return [...products].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case 'under499':
      return products.filter((p) => p.price <= 499);
    case 'deals':
      return products.filter((p) => p.compareAtPrice != null && p.compareAtPrice > p.price);
    default:
      return products;
  }
}

interface HomeShopSectionProps {
  products: Product[];
}

/**
 * Above-the-fold shop: category pills (choice architecture) + product grid.
 * Psychology: primacy (best first), anchoring (was/now on cards), scarcity (low stock).
 */
export default function HomeShopSection({ products }: HomeShopSectionProps) {
  const [selectedPill, setSelectedPill] = useState<PillKey>('best');

  const filtered = useMemo(
    () => filterProducts(products, selectedPill).slice(0, 4),
    [products, selectedPill]
  );

  if (products.length === 0) return null;

  return (
    <section className="relative py-5 sm:py-7 bg-brand-cream/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Category pills — 3–5 choices (choice architecture) */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-4">
          {PILLS.map(({ key, label }) => {
            const count =
              key === 'under499'
                ? products.filter((p) => p.price <= 499).length
                : key === 'deals'
                  ? products.filter((p) => p.compareAtPrice && p.compareAtPrice > p.price).length
                  : products.length;
            const isSelected = selectedPill === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedPill(key)}
                className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  isSelected
                    ? 'bg-brand-charcoal text-white shadow-md'
                    : 'bg-white text-brand-charcoal border border-brand-border hover:border-brand-charcoal/30'
                }`}
              >
                {label}
                {count > 0 && (key === 'under499' || key === 'deals') && (
                  <span className="ml-1.5 text-xs opacity-80">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Product grid — 2–4 columns, compact cards to optimize space */}
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          key={selectedPill}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {filtered.map((product, index) => (
            <div key={product._id} className="flex flex-col min-w-0">
              <PremiumProductCard
                product={product}
                index={index}
                showMostPopular={index === 0 && selectedPill === 'best'}
                compact
              />
            </div>
          ))}
        </motion.div>

        <div className="text-center mt-5">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-brand-charcoal font-semibold text-sm hover:text-brand-brown transition-colors"
          >
            View all products
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
