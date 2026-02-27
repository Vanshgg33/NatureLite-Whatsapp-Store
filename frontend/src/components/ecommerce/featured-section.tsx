'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { PremiumProductCard } from './premium-product-card';
import { Product, Category } from '@/types';

interface FeaturedSectionProps {
  title?: string;
  subtitle?: string;
  products: Product[];
  categories?: Category[];
  showCategoryFilter?: boolean;
  viewAllLink?: string;
  viewAllText?: string;
}

export function FeaturedSection({
  title = "Featured Products",
  subtitle = "Handpicked selections from our organic collection",
  products,
  categories = [],
  showCategoryFilter = true,
  viewAllLink = "/products",
  viewAllText = "View All Products",
}: FeaturedSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const filteredProducts = selectedCategory
    ? products.filter((p) => {
        const categoryId = typeof p.category === 'string' ? p.category : p.category?._id;
        return categoryId === selectedCategory;
      })
    : products;

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = scrollContainerRef.current.clientWidth * 0.8;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  return (
    <section
      ref={sectionRef}
      className="relative py-20 lg:py-32 bg-gradient-to-b from-brand-cream to-white overflow-hidden"
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-mustard/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-brand-green/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="text-center mb-12 lg:mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          {/* Decorative element */}
          <motion.div
            className="inline-flex items-center justify-center gap-2 mb-6"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="h-px w-8 bg-brand-mustard" />
            <Sparkles className="w-5 h-5 text-brand-mustard" />
            <div className="h-px w-8 bg-brand-mustard" />
          </motion.div>

          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-charcoal mb-4">
            {title}
          </h2>
          <p className="font-body text-lg text-brand-muted max-w-2xl mx-auto">
            {subtitle}
          </p>
        </motion.div>

        {/* Category Filter Pills */}
        {showCategoryFilter && categories.length > 0 && (
          <motion.div
            className="flex flex-wrap justify-center gap-3 mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-300 ${
                selectedCategory === null
                  ? 'bg-brand-charcoal text-white shadow-brand-md'
                  : 'bg-white text-brand-charcoal hover:bg-brand-sand border border-brand-border'
              }`}
            >
              All Products
            </button>
            {categories.slice(0, 5).map((category) => (
              <button
                key={category._id}
                onClick={() => setSelectedCategory(category._id)}
                className={`px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-300 ${
                  selectedCategory === category._id
                    ? 'bg-brand-charcoal text-white shadow-brand-md'
                    : 'bg-white text-brand-charcoal hover:bg-brand-sand border border-brand-border'
                }`}
              >
                {category.name}
              </button>
            ))}
          </motion.div>
        )}

        {/* Products Carousel/Grid */}
        <div className="relative">
          {/* Navigation Arrows */}
          <div className="hidden lg:block">
            <motion.button
              onClick={() => scroll('left')}
              className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-12 h-12 rounded-full bg-white shadow-brand-lg flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-all duration-300 ${
                !canScrollLeft ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronLeft className="w-6 h-6" />
            </motion.button>

            <motion.button
              onClick={() => scroll('right')}
              className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-12 h-12 rounded-full bg-white shadow-brand-lg flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-all duration-300 ${
                !canScrollRight ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronRight className="w-6 h-6" />
            </motion.button>
          </div>

          {/* Products Container */}
          <motion.div
            ref={scrollContainerRef}
            className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide lg:grid lg:grid-cols-4 lg:gap-8 lg:overflow-visible"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onScroll={handleScroll}
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
          >
            {filteredProducts.length > 0 ? (
              filteredProducts.slice(0, 8).map((product, index) => (
                <div
                  key={product._id}
                  className="flex-shrink-0 w-[280px] sm:w-[320px] lg:w-auto snap-start"
                >
                  <PremiumProductCard product={product} index={index} />
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12">
                <p className="text-brand-muted">No products found in this category.</p>
              </div>
            )}
          </motion.div>

          {/* Scroll indicators for mobile */}
          <div className="flex justify-center gap-2 mt-6 lg:hidden">
            {filteredProducts.slice(0, 8).map((_, index) => (
              <div
                key={index}
                className="w-2 h-2 rounded-full bg-brand-border"
              />
            ))}
          </div>
        </div>

        {/* View All Link */}
        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <Link
            href={viewAllLink}
            className="group inline-flex items-center gap-2 px-8 py-4 bg-transparent border-2 border-brand-charcoal text-brand-charcoal rounded-full font-medium hover:bg-brand-charcoal hover:text-white transition-all duration-300"
          >
            {viewAllText}
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

// Alternate grid layout version
export function FeaturedGrid({
  title,
  subtitle,
  products,
  columns = 4,
}: {
  title?: string;
  subtitle?: string;
  products: Product[];
  columns?: 3 | 4;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.1 });

  const gridCols = columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';

  return (
    <section ref={sectionRef} className="py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(title || subtitle) && (
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            {title && (
              <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal mb-3">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-brand-muted max-w-xl mx-auto">{subtitle}</p>
            )}
          </motion.div>
        )}

        <motion.div
          className={`grid grid-cols-1 sm:grid-cols-2 ${gridCols} gap-6 lg:gap-8`}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {products.map((product, index) => (
            <PremiumProductCard key={product._id} product={product} index={index} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
