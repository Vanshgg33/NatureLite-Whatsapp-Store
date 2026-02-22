'use client';

import { useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function KitchenCTA() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [50, -50]);

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-32 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-mustard via-brand-terracotta to-brand-brown" />

      {/* Pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="kitchen-pattern"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="20" cy="20" r="1.5" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#kitchen-pattern)" />
        </svg>
      </div>

      <div className="brand-container relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          {/* Icon */}
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm mb-8"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Heart className="w-10 h-10 text-white" />
          </motion.div>

          {/* Content */}
          <motion.h2
            className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            Bring Tradition to Your Kitchen
          </motion.h2>

          <motion.p
            className="font-body text-xl text-white/80 mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            Every meal becomes special when cooked with pure, traditional
            ingredients. Experience the difference that generations of wisdom
            make.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href="/products">
              <Button
                size="lg"
                className="bg-white text-brand-brown hover:bg-white/90 font-body text-base px-8 py-6 rounded-full transition-all duration-normal hover:scale-105"
              >
                Shop Now
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/about">
              <Button
                variant="outline"
                size="lg"
                className="border-white/30 text-white hover:bg-white/10 font-body text-base px-8 py-6 rounded-full"
              >
                Learn Our Story
              </Button>
            </Link>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            className="mt-12 pt-8 border-t border-white/10"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <div className="flex flex-wrap items-center justify-center gap-8 text-white/60">
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-bold text-white">
                  10,000+
                </span>
                <span className="font-body text-sm">Happy Kitchens</span>
              </div>
              <div className="w-px h-8 bg-white/20 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-bold text-white">
                  4.9
                </span>
                <span className="font-body text-sm">Average Rating</span>
              </div>
              <div className="w-px h-8 bg-white/20 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-bold text-white">
                  100%
                </span>
                <span className="font-body text-sm">Natural</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Decorative elements */}
      <motion.div
        className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-white/5"
        style={{ y }}
      />
      <motion.div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5"
        style={{ y: useTransform(scrollYProgress, [0, 1], [-30, 30]) }}
      />
    </section>
  );
}
