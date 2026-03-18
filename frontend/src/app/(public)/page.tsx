'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Leaf } from 'lucide-react';

import { api } from '@/lib/api';
import { Product, Category } from '@/types';

import CompactHeroSection from '@/components/sections/CompactHeroSection';
import HomeShopSection from '@/components/sections/HomeShopSection';
import OurStorySection from '@/components/sections/OurStorySection';
import SocialProofSection from '@/components/sections/SocialProofSection';
import RecencyBlock from '@/components/sections/RecencyBlock';
import { NewsletterSection } from '@/components/ecommerce/newsletter-section';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="w-14 h-14 rounded-full bg-brand-green/10 flex items-center justify-center mb-5">
        <Leaf className="w-7 h-7 text-brand-green animate-pulse" />
      </div>
      <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-3">Naturelite</h1>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-brand-green"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Home page: psychology layout
 * - Above fold: compact hero + category pills + product grid (shop first, minimal scroll)
 * - Below fold: story (3D) → social proof → recency block → newsletter
 */
export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          api.getProducts({ limit: 32, sortBy: 'totalSold', sortOrder: 'desc' }),
          api.getActiveCategories(),
        ]);
        setProducts(productsRes.items || []);
        setCategories(categoriesRes || []);
      } catch (error) {
        console.error('Failed to fetch homepage data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <main>
      {/* 1. Compact hero — one line + CTA (primacy, F-pattern) */}
      <CompactHeroSection />

      {/* 2. Shop above fold — pills + product grid (choice architecture, anchoring, scarcity) */}
      {products.length > 0 && <HomeShopSection products={products} />}

      {/* 3. Story — only when they scroll (3D chapters) */}
      <OurStorySection />

      {/* 4. Social proof — stats + testimonials */}
      <SocialProofSection />

      {/* 5. Recency block — last thing before footer (recency effect) */}
      <RecencyBlock />

      {/* 6. Newsletter */}
      <NewsletterSection variant="full-width" />
    </main>
  );
}
