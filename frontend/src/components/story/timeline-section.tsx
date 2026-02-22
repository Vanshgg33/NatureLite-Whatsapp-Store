'use client';

import { useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { Sprout, Wheat, Cog, Droplets, Package, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

const timelineSteps = [
  {
    icon: Sprout,
    title: 'Seed Selection',
    description:
      'We source the finest mustard seeds from trusted farms in Rajasthan, selected for their purity and oil content.',
    color: 'bg-brand-green',
  },
  {
    icon: Wheat,
    title: 'Sun Drying',
    description:
      'Seeds are naturally sun-dried for 3-4 days to achieve the perfect moisture content for extraction.',
    color: 'bg-brand-mustard',
  },
  {
    icon: Cog,
    title: 'Wood Pressing',
    description:
      'Using traditional wooden ghani, seeds are cold-pressed at low temperatures to preserve nutrients.',
    color: 'bg-brand-brown',
  },
  {
    icon: Droplets,
    title: 'Natural Settling',
    description:
      'Oil is left to settle naturally for 24-48 hours, allowing impurities to separate without chemicals.',
    color: 'bg-brand-green-light',
  },
  {
    icon: Package,
    title: 'Glass Bottling',
    description:
      'Pure oil is carefully bottled in dark glass containers to preserve freshness and prevent oxidation.',
    color: 'bg-brand-terracotta',
  },
  {
    icon: Truck,
    title: 'Farm to Home',
    description:
      'Directly shipped to your kitchen within days of pressing, ensuring maximum freshness.',
    color: 'bg-brand-mustard-dark',
  },
];

export function TimelineSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 0.5], ['0%', '100%']);

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-brand-sand overflow-hidden"
    >
      <div className="brand-container">
        {/* Section Header */}
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16 lg:mb-24"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-block px-4 py-1.5 mb-4 text-sm font-body tracking-wider text-brand-green bg-brand-green/10 rounded-full">
            Our Process
          </span>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal mb-4">
            The Traditional Way
          </h2>
          <p className="font-body text-lg text-brand-muted">
            From seed selection to your kitchen, every step follows time-honored
            traditions
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="relative max-w-4xl mx-auto">
          {/* Vertical line */}
          <div className="absolute left-4 lg:left-1/2 top-0 bottom-0 w-0.5 bg-brand-border lg:-translate-x-1/2">
            <motion.div
              className="w-full bg-brand-mustard origin-top"
              style={{ height: lineHeight }}
            />
          </div>

          {/* Timeline items */}
          <div className="space-y-12 lg:space-y-16">
            {timelineSteps.map((step, index) => {
              const Icon = step.icon;
              const isLeft = index % 2 === 0;

              return (
                <motion.div
                  key={step.title}
                  className={cn(
                    'relative pl-16 lg:pl-0',
                    isLeft ? 'lg:pr-[50%] lg:text-right' : 'lg:pl-[50%]'
                  )}
                  initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{
                    duration: 0.6,
                    delay: 0.1 * index,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {/* Icon - Mobile */}
                  <div
                    className={cn(
                      'absolute left-0 w-9 h-9 rounded-full flex items-center justify-center lg:hidden',
                      step.color
                    )}
                  >
                    <Icon className="w-4 h-4 text-white" />
                  </div>

                  {/* Icon - Desktop */}
                  <div
                    className={cn(
                      'hidden lg:flex absolute top-0 w-12 h-12 rounded-full items-center justify-center shadow-brand-md z-10',
                      step.color,
                      isLeft
                        ? 'left-[calc(50%-24px)]'
                        : 'left-[calc(50%-24px)]'
                    )}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>

                  {/* Content */}
                  <div
                    className={cn(
                      'bg-white rounded-xl p-6 shadow-brand-sm',
                      isLeft ? 'lg:mr-8' : 'lg:ml-8'
                    )}
                  >
                    <div
                      className={cn(
                        'flex items-center gap-2 mb-2',
                        isLeft ? 'lg:justify-end' : ''
                      )}
                    >
                      <span className="text-xs font-body font-medium text-brand-mustard">
                        Step {index + 1}
                      </span>
                    </div>
                    <h3 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
                      {step.title}
                    </h3>
                    <p className="font-body text-brand-muted leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
