'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Leaf,
  Truck,
  Shield,
  Award,
  Recycle,
  Heart,
  Clock,
  BadgeCheck,
} from 'lucide-react';

interface Badge {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const defaultBadges: Badge[] = [
  {
    icon: <Leaf className="w-7 h-7" />,
    title: '100% Organic',
    description: 'Certified organic ingredients with no harmful chemicals',
  },
  {
    icon: <Truck className="w-7 h-7" />,
    title: 'Free Shipping',
    description: 'Free delivery on all orders above ₹499',
  },
  {
    icon: <Shield className="w-7 h-7" />,
    title: 'Secure Payment',
    description: 'Your transactions are safe and encrypted',
  },
  {
    icon: <Award className="w-7 h-7" />,
    title: 'Premium Quality',
    description: 'Handpicked products meeting strict standards',
  },
];

const certifications: Badge[] = [
  {
    icon: <BadgeCheck className="w-6 h-6" />,
    title: 'FSSAI Certified',
    description: 'Food Safety Standards',
  },
  {
    icon: <Recycle className="w-6 h-6" />,
    title: 'Eco-Friendly',
    description: 'Sustainable Packaging',
  },
  {
    icon: <Heart className="w-6 h-6" />,
    title: 'Made with Love',
    description: 'Artisan Crafted',
  },
  {
    icon: <Clock className="w-6 h-6" />,
    title: 'Fresh Daily',
    description: 'Farm to Table',
  },
];

interface TrustBadgesProps {
  badges?: Badge[];
  variant?: 'default' | 'compact' | 'glass';
  showCertifications?: boolean;
  title?: string;
}

export function TrustBadges({
  badges = defaultBadges,
  variant = 'default',
  showCertifications = true,
  title,
}: TrustBadgesProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
    },
  };

  if (variant === 'compact') {
    return (
      <section ref={sectionRef} className="py-8 bg-brand-sand/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="flex flex-wrap justify-center items-center gap-8 lg:gap-16"
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
          >
            {badges.map((badge, index) => (
              <motion.div
                key={index}
                className="flex items-center gap-3 text-brand-charcoal"
                variants={itemVariants}
              >
                <div className="text-brand-green">{badge.icon}</div>
                <span className="font-medium">{badge.title}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    );
  }

  if (variant === 'glass') {
    return (
      <section
        ref={sectionRef}
        className="relative py-20 lg:py-28 overflow-hidden"
      >
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-green/10 via-brand-cream to-brand-mustard/10" />

        {/* Glassmorphism pattern */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-brand-green/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-brand-mustard/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {title && (
            <motion.h2
              className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
            >
              {title}
            </motion.h2>
          )}

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
          >
            {badges.map((badge, index) => (
              <motion.div
                key={index}
                className="group relative p-8 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-brand-md hover:shadow-brand-xl transition-all duration-500 hover:-translate-y-1"
                variants={itemVariants}
              >
                {/* Icon */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-green/20 to-brand-green/5 flex items-center justify-center text-brand-green mb-5 group-hover:scale-110 transition-transform duration-300">
                  {badge.icon}
                </div>

                {/* Content */}
                <h3 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
                  {badge.title}
                </h3>
                <p className="text-brand-muted text-sm leading-relaxed">
                  {badge.description}
                </p>

                {/* Decorative corner */}
                <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-brand-mustard/30 rounded-tr-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </motion.div>
            ))}
          </motion.div>

          {/* Certifications row */}
          {showCertifications && (
            <motion.div
              className="mt-16 pt-12 border-t border-brand-border/50"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <p className="text-center text-sm text-brand-muted uppercase tracking-wider mb-8">
                Our Certifications & Commitments
              </p>
              <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-12">
                {certifications.map((cert, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center gap-3 px-5 py-3 rounded-full bg-white/50 backdrop-blur-sm border border-white/50"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.3, delay: 0.7 + index * 0.1 }}
                  >
                    <div className="text-brand-mustard">{cert.icon}</div>
                    <div>
                      <div className="font-medium text-brand-charcoal text-sm">
                        {cert.title}
                      </div>
                      <div className="text-xs text-brand-muted">
                        {cert.description}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </section>
    );
  }

  // Default variant
  return (
    <section ref={sectionRef} className="py-16 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {title && (
          <motion.h2
            className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            {title}
          </motion.h2>
        )}

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
        >
          {badges.map((badge, index) => (
            <motion.div
              key={index}
              className="group text-center"
              variants={itemVariants}
            >
              {/* Icon Circle */}
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="absolute inset-0 rounded-full bg-brand-cream group-hover:bg-brand-green/10 transition-colors duration-300" />
                <div className="absolute inset-0 flex items-center justify-center text-brand-green">
                  {badge.icon}
                </div>
                {/* Rotating border */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-dashed border-brand-mustard/30"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                />
              </div>

              {/* Content */}
              <h3 className="font-display text-lg font-semibold text-brand-charcoal mb-2">
                {badge.title}
              </h3>
              <p className="text-brand-muted text-sm max-w-xs mx-auto">
                {badge.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// Horizontal scrolling banner variant
export function TrustBanner() {
  const items = [
    'Free Shipping on Orders ₹499+',
    '100% Organic Certified',
    'Farm Fresh Quality',
    'Secure Checkout',
    'Easy Returns',
    'Customer Support 24/7',
  ];

  return (
    <div className="bg-brand-charcoal text-white py-3 overflow-hidden">
      <motion.div
        className="flex whitespace-nowrap"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      >
        {[...items, ...items].map((item, index) => (
          <span key={index} className="mx-8 text-sm flex items-center gap-2">
            <Leaf className="w-4 h-4 text-brand-mustard" />
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
