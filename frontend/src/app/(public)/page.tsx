'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Leaf } from 'lucide-react';
import dynamic from 'next/dynamic';

import { api } from '@/lib/api';
import { Product, Category } from '@/types';

import { FeaturedSection } from '@/components/ecommerce/featured-section';
import { NewsletterSection } from '@/components/ecommerce/newsletter-section';

const ImmersiveHero = dynamic(
  () => import('@/components/sections/ImmersiveHeroSection'),
  { ssr: false }
);
const ProductShowcase = dynamic(
  () => import('@/components/sections/ProductShowcaseSection'),
  { ssr: false }
);
const SocialProof = dynamic(
  () => import('@/components/sections/SocialProofSection'),
  { ssr: false }
);
const Categories = dynamic(
  () => import('@/components/sections/CategoriesSection'),
  { ssr: false }
);

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

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [featuredRes, productsRes, categoriesRes] = await Promise.all([
          api.getFeaturedProducts(8),
          api.getProducts({ limit: 12, sortBy: 'totalSold', sortOrder: 'desc' }),
          api.getActiveCategories(),
        ]);

        const allProducts = [...featuredRes, ...productsRes.items];
        const seen = new Set<string>();
        const deduped = allProducts.filter(p => {
          if (seen.has(p._id)) return false;
          seen.add(p._id);
          return true;
        });

        setProducts(deduped);
        setCategories(categoriesRes);
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
      {/* S1: Hero — clean white, 3D bottle right, text left */}
      <ImmersiveHero />

      {/* S2: Product Showcase — scroll-driven 3D (dark green) */}
      <ProductShowcase />

      {/* S3: Product Grid — light breather */}
      {products.length > 0 && (
        <FeaturedSection
          title="Our Collection"
          subtitle="Handpicked organic superfoods for your family"
          products={products}
          categories={categories}
          viewAllLink="/products"
        />
      )}

      {/* S5: Categories — large image grid */}
      {categories.length > 0 && <Categories categories={categories} />}

      {/* S6: Social Proof — stats + testimonial (cream bg) */}
      <SocialProof />

      {/* S7: Newsletter */}
      <NewsletterSection variant="full-width" />
    </main>
  );
}
