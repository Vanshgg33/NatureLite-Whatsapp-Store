'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Category } from '@/types';

export default function CategoriesSection({ categories }: { categories: Category[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });

  if (!categories.length) return null;

  // Take up to 6 categories for the grid
  const displayCategories = categories.slice(0, 6);

  return (
    <section
      ref={sectionRef}
      className="relative py-20 lg:py-28 bg-white overflow-hidden"
    >
      {/* Subtle background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-brand-mustard/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-green/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center justify-center gap-2 mb-5">
            <div className="h-px w-8 bg-brand-mustard" />
            <Sparkles className="w-5 h-5 text-brand-mustard" />
            <div className="h-px w-8 bg-brand-mustard" />
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-charcoal mb-4">
            Shop by Category
          </h2>
          <p className="font-body text-lg text-brand-muted max-w-xl mx-auto">
            Explore our curated collections of organic goodness
          </p>
        </motion.div>

        {/* Category Grid — Farmley style 2x2/3 large cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {displayCategories.map((category, index) => (
            <motion.div
              key={category._id}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={
                index === 0 && displayCategories.length > 3
                  ? 'sm:col-span-2 lg:col-span-1'
                  : ''
              }
            >
              <Link
                href={`/products?category=${category._id}`}
                className="group block relative rounded-3xl overflow-hidden bg-brand-cream h-[280px] sm:h-[320px] lg:h-[360px]"
              >
                {/* Background image */}
                {category.image ? (
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-brand-cream to-brand-sand" />
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent transition-opacity duration-500 group-hover:from-black/80" />

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-6 lg:p-8">
                  <h3 className="font-display text-xl sm:text-2xl lg:text-2xl font-bold text-white mb-2 transition-transform duration-300 group-hover:translate-y-[-4px]">
                    {category.name}
                  </h3>
                  <div className="flex items-center gap-2 text-white/80 text-sm font-medium transition-all duration-300 group-hover:text-brand-mustard group-hover:gap-3">
                    <span>Shop Now</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>

                {/* Hover border effect */}
                <div className="absolute inset-0 rounded-3xl border-2 border-transparent transition-colors duration-300 group-hover:border-brand-mustard/30" />
              </Link>
            </motion.div>
          ))}
        </div>

        {/* View All Categories CTA */}
        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0, y: 15 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Link
            href="/products"
            className="group inline-flex items-center gap-2 px-8 py-4 border-2 border-brand-charcoal text-brand-charcoal rounded-full font-medium hover:bg-brand-charcoal hover:text-white transition-all duration-300"
          >
            View All Categories
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
