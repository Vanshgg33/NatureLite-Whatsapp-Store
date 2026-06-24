'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { Users, Star, BadgeCheck } from 'lucide-react';
import { ScrollReveal } from '@/components/ui/scroll-reveal';

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
  { numericValue: 5000, suffix: '+', label: 'Happy Families', icon: Users },
];

const testimonial = {
  name: 'Priya Sharma',
  location: 'Mumbai',
  rating: 5,
  text: "Switched to Nature Lite Foods's wood-pressed oils 6 months ago — my cholesterol dropped 20 points and my skin has never looked better. The cold-pressed groundnut oil tastes exactly like what my grandmother used to make.",
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
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: 'rgba(26,82,16,0.10)', border: '1px solid rgba(26,82,16,0.12)' }}
      >
        <stat.icon className="w-6 h-6" style={{ color: '#1a5210' }} />
      </div>
      <div
        className="font-display text-3xl lg:text-4xl font-bold mb-1"
        style={{ color: '#0b1c08', letterSpacing: '-0.025em' }}
      >
        {count.toLocaleString()}{stat.suffix}
      </div>
      <div className="text-sm" style={{ color: 'rgba(46,66,37,0.55)' }}>{stat.label}</div>
    </motion.div>
  );
}

function StatsRow() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  return (
    <div ref={sectionRef} className="flex justify-center gap-8">
      {statsData.map((stat, index) => (
        <StatItem key={stat.label} stat={stat} isInView={isInView} index={index} />
      ))}
    </div>
  );
}

export default function SocialProofSection() {
  return (
    <section className="relative" style={{ background: '#f2ece0' }}>

      {/* Stats band */}
      <div className="py-8 lg:py-10" style={{ borderBottom: '1px solid rgba(26,82,16,0.08)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal className="text-center mb-6">
            <p style={{ fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: '#a07010', fontFamily: 'monospace', marginBottom: 8 }}>
              Our Impact
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: '#0b1c08', letterSpacing: '-0.02em' }}>
              Trusted by Families Across India
            </h2>
          </ScrollReveal>
          <StatsRow />
        </div>
      </div>

      {/* Featured testimonial */}
      <div className="py-8 lg:py-10">
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
                <Star key={i} className="w-5 h-5" style={{ fill: '#a07010', color: '#a07010' }} />
              ))}
            </div>

            {/* Large quote mark */}
            <div className="font-display text-6xl font-bold leading-none mb-2" style={{ color: 'rgba(26,82,16,0.15)' }}>&ldquo;</div>

            {/* Quote */}
            <blockquote
              className="font-display text-base sm:text-xl lg:text-2xl leading-relaxed mb-8 max-w-3xl mx-auto px-2 sm:px-0"
              style={{ color: '#0b1c08', letterSpacing: '-0.01em' }}
            >
              {testimonial.text}
            </blockquote>

            {/* Author */}
            <div className="flex items-center justify-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(26,82,16,0.12)' }}
              >
                <span className="font-semibold text-lg" style={{ color: '#1a5210' }}>
                  {(testimonial.name || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="text-left">
                <div className="font-medium flex items-center gap-2" style={{ color: '#0b1c08' }}>
                  {testimonial.name}
                  {testimonial.verified && (
                    <BadgeCheck className="w-4 h-4" style={{ color: '#1a5210' }} />
                  )}
                </div>
                <div className="text-sm" style={{ color: 'rgba(46,66,37,0.52)' }}>
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
