'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useScroll, useTransform, useSpring, useMotionValue } from 'framer-motion';
import { ArrowRight, Leaf, ChevronDown } from 'lucide-react';

// Botanical SVG decorations
const LeafDecoration = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M50 5C50 5 20 30 20 60C20 80 35 95 50 95C65 95 80 80 80 60C80 30 50 5 50 5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <path d="M50 20V85" stroke="currentColor" strokeWidth="1" />
    <path d="M35 45C35 45 50 50 50 60" stroke="currentColor" strokeWidth="1" />
    <path d="M65 45C65 45 50 50 50 60" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const FloatingLeaf = ({ delay, x, size }: { delay: number; x: number; size: number }) => (
  <motion.div
    className="absolute text-brand-green/20"
    style={{ left: `${x}%`, top: -50 }}
    initial={{ y: -50, rotate: 0, opacity: 0 }}
    animate={{
      y: ['0vh', '110vh'],
      rotate: [0, 360],
      opacity: [0, 1, 1, 0],
    }}
    transition={{
      duration: 15 + Math.random() * 10,
      delay,
      repeat: Infinity,
      ease: 'linear',
    }}
  >
    <Leaf size={size} />
  </motion.div>
);

interface PremiumHeroProps {
  title?: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
  backgroundImage?: string;
  floatingImages?: string[];
}

export function PremiumHero({
  title = "Nature's Finest,\nDelivered Fresh",
  subtitle = "Discover handpicked organic foods sourced directly from sustainable farms. Pure ingredients, extraordinary taste.",
  ctaText = "Shop Collection",
  ctaLink = "/products",
  backgroundImage = "/images/hero-bg.jpg",
  floatingImages = [],
}: PremiumHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);
  const springY = useSpring(y, { stiffness: 100, damping: 30 });

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const leafX1 = useTransform(mouseX, v => v * 0.5);
  const leafY1 = useTransform(mouseY, v => v * 0.5);
  const leafX2 = useTransform(mouseX, v => v * -0.3);
  const leafY2 = useTransform(mouseY, v => v * -0.3);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 20);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 20);
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center overflow-hidden bg-brand-cream"
    >
      {/* Animated Background with Parallax */}
      <motion.div
        className="absolute inset-0 z-0"
        style={{ y: springY, scale }}
      >
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-cream via-brand-cream/95 to-brand-sand/90 z-10" />

        {/* Texture overlay */}
        <div
          className="absolute inset-0 z-20 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Background image if provided */}
        {backgroundImage && (
          <Image
            src={backgroundImage}
            alt="Hero background"
            fill
            className="object-cover"
            priority
          />
        )}
      </motion.div>

      {/* Floating Leaves Animation */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <FloatingLeaf
            key={i}
            delay={i * 2}
            x={10 + (i * 12)}
            size={16 + (i % 3) * 8}
          />
        ))}
      </div>

      {/* Decorative botanical elements */}
      <motion.div
        className="absolute top-20 left-10 text-brand-green/10 z-10"
        style={{ x: leafX1, y: leafY1 }}
      >
        <LeafDecoration className="w-32 h-32 md:w-48 md:h-48" />
      </motion.div>

      <motion.div
        className="absolute bottom-20 right-10 text-brand-mustard/10 z-10 rotate-180"
        style={{ x: leafX2, y: leafY2 }}
      >
        <LeafDecoration className="w-24 h-24 md:w-40 md:h-40" />
      </motion.div>

      {/* Main Content */}
      <motion.div
        className="relative z-20 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20"
        style={{ opacity }}
      >
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Text Content */}
          <div className="text-center lg:text-left">
            {/* Decorative line */}
            <motion.div
              className="flex items-center justify-center lg:justify-start gap-3 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="h-px w-12 bg-brand-mustard" />
              <span className="text-brand-mustard font-medium text-sm tracking-[0.2em] uppercase">
                Pure & Natural
              </span>
              <div className="h-px w-12 bg-brand-mustard" />
            </motion.div>

            {/* Main Title */}
            <motion.h1
              className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-brand-charcoal leading-[1.1] mb-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              {title.split('\n').map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="font-body text-lg md:text-xl text-brand-muted max-w-xl mx-auto lg:mx-0 mb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              {subtitle}
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              <Link
                href={ctaLink}
                className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 bg-brand-charcoal text-white rounded-full font-medium overflow-hidden transition-all duration-300 hover:shadow-brand-lg"
              >
                <span className="relative z-10">{ctaText}</span>
                <ArrowRight className="relative z-10 w-5 h-5 transition-transform group-hover:translate-x-1" />
                <div className="absolute inset-0 bg-brand-green transform scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100" />
              </Link>

              <Link
                href="/about"
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-brand-charcoal/20 text-brand-charcoal rounded-full font-medium transition-all duration-300 hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white"
              >
                Our Story
                <Leaf className="w-5 h-5 transition-transform group-hover:rotate-12" />
              </Link>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              className="flex items-center justify-center lg:justify-start gap-8 mt-12 pt-8 border-t border-brand-border"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.9 }}
            >
              {[
                { value: '100%', label: 'Pure' },
                { value: '5k+', label: 'Happy Customers' },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="font-display text-2xl font-bold text-brand-charcoal">
                    {stat.value}
                  </div>
                  <div className="text-sm text-brand-muted">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Floating Product Images */}
          <motion.div
            className="relative h-[400px] lg:h-[600px] hidden lg:block"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            {/* Main circular frame */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-[400px] h-[400px] lg:w-[500px] lg:h-[500px]">
                {/* Decorative circle */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-dashed border-brand-mustard/30"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
                />

                {/* Inner solid circle */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-brand-sand to-brand-cream shadow-brand-xl" />

                {/* Floating product images */}
                {floatingImages.length > 0 ? (
                  floatingImages.slice(0, 3).map((img, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-32 h-32 lg:w-40 lg:h-40 rounded-2xl overflow-hidden shadow-brand-lg bg-white"
                      style={{
                        top: i === 0 ? '5%' : i === 1 ? '60%' : '40%',
                        left: i === 0 ? '50%' : i === 1 ? '10%' : '70%',
                        transform: 'translate(-50%, -50%)',
                      }}
                      animate={{
                        y: [0, -15, 0],
                        rotate: [0, i % 2 === 0 ? 3 : -3, 0],
                      }}
                      transition={{
                        duration: 4 + i,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.5,
                      }}
                    >
                      <Image
                        src={img}
                        alt={`Product ${i + 1}`}
                        fill
                        className="object-cover"
                      />
                    </motion.div>
                  ))
                ) : (
                  // Placeholder floating elements
                  <>
                    <motion.div
                      className="absolute top-[10%] left-[60%] w-28 h-28 rounded-2xl bg-brand-mustard/20 backdrop-blur-sm"
                      animate={{ y: [0, -20, 0] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="absolute top-[50%] left-[15%] w-24 h-24 rounded-full bg-brand-green/20 backdrop-blur-sm"
                      animate={{ y: [0, -15, 0] }}
                      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                    />
                    <motion.div
                      className="absolute top-[70%] left-[70%] w-20 h-20 rounded-2xl bg-brand-terracotta/20 backdrop-blur-sm"
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                    />
                  </>
                )}

                {/* Center image/logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 lg:w-52 lg:h-52 rounded-full bg-white shadow-brand-lg flex items-center justify-center">
                  <div className="text-center">
                    <Leaf className="w-12 h-12 text-brand-green mx-auto mb-2" />
                    <span className="font-display text-xl font-bold text-brand-charcoal">
                      Purity Foods
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <motion.button
          onClick={() => {
            window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
          }}
          className="flex flex-col items-center gap-2 text-brand-muted hover:text-brand-charcoal transition-colors"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <ChevronDown className="w-5 h-5" />
        </motion.button>
      </motion.div>
    </section>
  );
}
