'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { Users, Leaf, Truck, Award, Star, BadgeCheck } from 'lucide-react';

function useCountUp(end: number, duration: number = 2000, start: boolean = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    let raf: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * end));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [end, duration, start]);
  return count;
}

const statsData = [
  { numericValue: 50000, suffix: '+', label: 'Happy Customers', icon: Users },
  { numericValue: 500, suffix: '+', label: 'Organic Products', icon: Leaf },
  { numericValue: 100, suffix: '+', label: 'Cities Served', icon: Truck },
  { numericValue: 15, suffix: '+', label: 'Awards Won', icon: Award },
];

const testimonial = {
  name: 'Priya Sharma',
  location: 'Mumbai',
  rating: 5,
  text: "Switched to Naturelite's wood-pressed oils 6 months ago — my cholesterol dropped 20 points and my skin has never looked better. The cold-pressed groundnut oil tastes exactly like what my grandmother used to make.",
  productName: 'Wood-Pressed Groundnut Oil',
  verified: true,
};

function StatItem({ stat, isInView, index }: { stat: typeof statsData[0]; isInView: boolean; index: number }) {
  const count = useCountUp(stat.numericValue, 2000, isInView);

  return (
    <motion.div
      className="text-center"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center mx-auto mb-3">
        <stat.icon className="w-6 h-6 text-brand-green" />
      </div>
      <div className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal mb-1">
        {count.toLocaleString()}{stat.suffix}
      </div>
      <div className="text-brand-muted text-sm">{stat.label}</div>
    </motion.div>
  );
}

function StatsRow() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  return (
    <div ref={sectionRef} className="grid grid-cols-2 lg:grid-cols-4 gap-8">
      {statsData.map((stat, index) => (
        <StatItem key={stat.label} stat={stat} isInView={isInView} index={index} />
      ))}
    </div>
  );
}

export default function SocialProofSection() {
  return (
    <section className="relative bg-brand-cream">
      {/* Stats */}
      <div className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <StatsRow />
        </div>
      </div>

      {/* Featured testimonial */}
      <div className="py-16 lg:py-20 border-t border-brand-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {/* Stars */}
            <div className="flex items-center justify-center gap-1 mb-6">
              {[...Array(testimonial.rating)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-brand-mustard text-brand-mustard" />
              ))}
            </div>

            {/* Quote */}
            <blockquote className="font-display text-xl lg:text-2xl text-brand-charcoal leading-relaxed mb-8 max-w-3xl mx-auto">
              &ldquo;{testimonial.text}&rdquo;
            </blockquote>

            {/* Author */}
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-green/15 flex items-center justify-center">
                <span className="text-brand-green font-semibold text-lg">
                  {(testimonial.name || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="text-left">
                <div className="text-brand-charcoal font-medium flex items-center gap-2">
                  {testimonial.name}
                  {testimonial.verified && (
                    <BadgeCheck className="w-4 h-4 text-brand-green" />
                  )}
                </div>
                <div className="text-brand-muted text-sm">
                  {testimonial.location} · {testimonial.productName}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
