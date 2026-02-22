'use client';

import { useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Sparkles } from 'lucide-react';
import { TextReveal } from '@/components/motion/text-reveal';

gsap.registerPlugin(ScrollTrigger);

interface Category {
  _id: string;
  name: string;
  slug: string;
  image?: string;
  description?: string;
  productCount?: number;
}

interface CategoryShowcaseProps {
  categories: Category[];
}

export function CategoryShowcase({ categories }: CategoryShowcaseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  useEffect(() => {
    if (!containerRef.current || !horizontalRef.current) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>('.category-card');

      // Horizontal scroll effect
      gsap.to(horizontalRef.current, {
        xPercent: -50,
        ease: 'none',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top top',
          end: '+=200%',
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });

      // Individual card animations
      cards.forEach((card, i) => {
        gsap.fromTo(
          card,
          { opacity: 0, scale: 0.8, rotateY: -30 },
          {
            opacity: 1,
            scale: 1,
            rotateY: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: card,
              start: 'left 80%',
              end: 'left 20%',
              scrub: 1,
            },
          }
        );
      });
    }, containerRef);

    return () => ctx.revert();
  }, [categories]);

  const displayCategories = categories.slice(0, 6);

  return (
    <section ref={containerRef} className="relative bg-brand-charcoal">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-brand-green/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-brand-mustard/5 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative h-screen flex flex-col justify-center overflow-hidden">
        {/* Header */}
        <div className="absolute top-12 left-0 right-0 z-10 px-8 lg:px-16">
          <div className="max-w-7xl mx-auto flex justify-between items-end">
            <div>
              <TextReveal>
                <div className="inline-flex items-center gap-3 mb-4">
                  <Sparkles className="w-5 h-5 text-brand-mustard" />
                  <span className="text-brand-mustard font-medium text-sm tracking-[0.2em] uppercase">
                    Browse Categories
                  </span>
                </div>
              </TextReveal>
              <TextReveal delay={0.2}>
                <h2 className="font-display text-4xl lg:text-5xl font-bold text-white">
                  Shop by Category
                </h2>
              </TextReveal>
            </div>

            <Link
              href="/categories"
              className="hidden lg:flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            >
              <span className="font-medium">View All</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

        {/* Horizontal Scroll Container */}
        <div
          ref={horizontalRef}
          className="flex gap-8 px-8 lg:px-16"
          style={{ width: `${displayCategories.length * 420 + 200}px` }}
        >
          {displayCategories.map((category, index) => (
            <CategoryCard key={category._id} category={category} index={index} />
          ))}
        </div>

        {/* Progress Indicator */}
        <div className="absolute bottom-12 left-0 right-0 px-8 lg:px-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <span className="text-white/50 text-sm">Scroll</span>
              <div className="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-brand-mustard rounded-full"
                  style={{ scaleX: smoothProgress, originX: 0 }}
                />
              </div>
              <span className="text-white/50 text-sm">
                {displayCategories.length} Categories
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Individual Category Card
function CategoryCard({ category, index }: { category: Category; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      ref={cardRef}
      className="category-card relative w-[380px] h-[500px] flex-shrink-0"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      viewport={{ once: true }}
    >
      <Link href={`/categories/${category.slug}`} className="block h-full group">
        <div className="relative h-full rounded-3xl overflow-hidden bg-brand-charcoal/50 border border-white/10">
          {/* Background Image */}
          <div className="absolute inset-0">
            <Image
              src={category.image || '/images/placeholder-category.jpg'}
              alt={category.name}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-charcoal via-brand-charcoal/50 to-transparent" />
          </div>

          {/* Content */}
          <div className="absolute inset-0 p-8 flex flex-col justify-end">
            {/* Product Count */}
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full w-fit mb-4"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              viewport={{ once: true }}
            >
              <span className="text-brand-mustard text-sm font-semibold">
                {category.productCount || 0}+
              </span>
              <span className="text-white/70 text-sm">Products</span>
            </motion.div>

            {/* Category Name */}
            <h3 className="font-display text-3xl font-bold text-white mb-3 group-hover:text-brand-mustard transition-colors">
              {category.name}
            </h3>

            {/* Description */}
            {category.description && (
              <p className="text-white/60 text-sm line-clamp-2 mb-6">
                {category.description}
              </p>
            )}

            {/* CTA */}
            <motion.div
              className="flex items-center gap-2 text-white font-medium"
              whileHover={{ x: 10 }}
            >
              <span>Explore Collection</span>
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-2" />
            </motion.div>
          </div>

          {/* Hover Border Effect */}
          <motion.div
            className="absolute inset-0 rounded-3xl border-2 border-brand-mustard pointer-events-none"
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          />

          {/* Corner Accent */}
          <div className="absolute top-6 right-6 w-12 h-12 rounded-full bg-brand-mustard/20 backdrop-blur-sm flex items-center justify-center">
            <span className="font-display text-lg font-bold text-white">
              0{index + 1}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// Grid variant for non-horizontal scroll
export function CategoryGrid({ categories }: CategoryShowcaseProps) {
  return (
    <section className="py-24 bg-brand-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <TextReveal>
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-brand-mustard" />
              <span className="text-brand-mustard font-medium text-sm tracking-[0.2em] uppercase">
                Categories
              </span>
              <div className="h-px w-12 bg-brand-mustard" />
            </div>
          </TextReveal>
          <TextReveal delay={0.2}>
            <h2 className="font-display text-4xl lg:text-5xl font-bold text-brand-charcoal mb-4">
              Shop by Category
            </h2>
          </TextReveal>
          <TextReveal delay={0.3}>
            <p className="text-brand-muted text-lg max-w-2xl mx-auto">
              Discover our curated collection of organic products across various categories
            </p>
          </TextReveal>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {categories.slice(0, 6).map((category, index) => (
            <motion.div
              key={category._id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Link
                href={`/categories/${category.slug}`}
                className="group block relative h-80 rounded-3xl overflow-hidden"
              >
                {/* Image */}
                <Image
                  src={category.image || '/images/placeholder-category.jpg'}
                  alt={category.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-brand-charcoal via-brand-charcoal/30 to-transparent" />

                {/* Content */}
                <div className="absolute inset-0 p-6 flex flex-col justify-end">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-brand-mustard text-sm font-medium">
                      {category.productCount || 0}+ Products
                    </span>
                  </div>
                  <h3 className="font-display text-2xl font-bold text-white group-hover:text-brand-mustard transition-colors">
                    {category.name}
                  </h3>
                </div>

                {/* Hover Arrow */}
                <motion.div
                  className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white flex items-center justify-center"
                  initial={{ scale: 0 }}
                  whileHover={{ scale: 1 }}
                >
                  <ArrowRight className="w-5 h-5 text-brand-charcoal" />
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
