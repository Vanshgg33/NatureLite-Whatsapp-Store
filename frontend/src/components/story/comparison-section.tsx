'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Factory, TreeDeciduous, Zap, Clock, Flame, Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComparisonItem {
  label: string;
  modern: { value: number; description: string };
  traditional: { value: number; description: string };
}

const comparisonData: ComparisonItem[] = [
  {
    label: 'Extraction Temperature',
    modern: { value: 80, description: 'High heat (100-120°C)' },
    traditional: { value: 20, description: 'Cold pressed (<40°C)' },
  },
  {
    label: 'Processing Time',
    modern: { value: 95, description: 'Minutes' },
    traditional: { value: 40, description: 'Hours of slow pressing' },
  },
  {
    label: 'Nutrient Retention',
    modern: { value: 30, description: '30-40% retained' },
    traditional: { value: 95, description: '95%+ retained' },
  },
  {
    label: 'Natural Aroma',
    modern: { value: 15, description: 'Deodorized' },
    traditional: { value: 100, description: 'Full natural aroma' },
  },
];

export function ComparisonSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-brand-cream overflow-hidden"
    >
      <div className="brand-container">
        {/* Section Header */}
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-block px-4 py-1.5 mb-4 text-sm font-body tracking-wider text-brand-brown bg-brand-brown/10 rounded-full">
            The Difference
          </span>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal mb-4">
            Modern vs Traditional
          </h2>
          <p className="font-body text-lg text-brand-muted">
            Understanding why traditional methods produce superior quality oils
          </p>
        </motion.div>

        {/* Comparison Cards */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Modern Processing */}
          <motion.div
            className="bg-white rounded-2xl p-8 shadow-brand-md"
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center">
                <Factory className="w-7 h-7 text-gray-500" />
              </div>
              <div>
                <h3 className="font-display text-2xl font-semibold text-brand-charcoal">
                  Modern Processing
                </h3>
                <p className="font-body text-brand-muted">Industrial methods</p>
              </div>
            </div>

            <div className="space-y-6">
              {comparisonData.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                >
                  <div className="flex justify-between mb-2">
                    <span className="font-body text-sm text-brand-text">
                      {item.label}
                    </span>
                    <span className="font-body text-xs text-brand-muted">
                      {item.modern.description}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gray-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={isInView ? { width: `${item.modern.value}%` } : {}}
                      transition={{ duration: 0.8, delay: 0.4 + index * 0.1 }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="flex items-center gap-3 text-gray-500">
                <Zap className="w-5 h-5" />
                <span className="font-body text-sm">
                  Fast but loses essential nutrients
                </span>
              </div>
            </div>
          </motion.div>

          {/* Traditional Processing */}
          <motion.div
            className="bg-brand-brown rounded-2xl p-8 shadow-brand-lg"
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-xl bg-brand-mustard/20 flex items-center justify-center">
                <TreeDeciduous className="w-7 h-7 text-brand-mustard" />
              </div>
              <div>
                <h3 className="font-display text-2xl font-semibold text-brand-cream">
                  Traditional Method
                </h3>
                <p className="font-body text-brand-cream/70">
                  Wood-pressed extraction
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {comparisonData.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                >
                  <div className="flex justify-between mb-2">
                    <span className="font-body text-sm text-brand-cream/90">
                      {item.label}
                    </span>
                    <span className="font-body text-xs text-brand-cream/60">
                      {item.traditional.description}
                    </span>
                  </div>
                  <div className="h-2 bg-brand-brown-light/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-brand-mustard rounded-full"
                      initial={{ width: 0 }}
                      animate={
                        isInView ? { width: `${item.traditional.value}%` } : {}
                      }
                      transition={{ duration: 0.8, delay: 0.5 + index * 0.1 }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-brand-cream/10">
              <div className="flex items-center gap-3 text-brand-cream/80">
                <Leaf className="w-5 h-5 text-brand-mustard" />
                <span className="font-body text-sm">
                  Slow pressed, maximum nutrition preserved
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
