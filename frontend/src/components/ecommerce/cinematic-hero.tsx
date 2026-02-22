'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Leaf, Play, Sparkles } from 'lucide-react';
import { SplitTextReveal, MaskReveal, GradientWipeText } from '@/components/motion/text-reveal';
import { MagneticButton } from '@/components/motion/magnetic-button';

gsap.registerPlugin(ScrollTrigger);

interface CinematicHeroProps {
  products?: Array<{
    id: string;
    name: string;
    image: string;
    price: number;
  }>;
}

export function CinematicHero({ products = [] }: CinematicHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Mouse tracking for parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 25, stiffness: 150 };
  const parallaxX = useSpring(mouseX, springConfig);
  const parallaxY = useSpring(mouseY, springConfig);

  // Transform values for parallax layers
  const layer1X = useTransform(parallaxX, [-0.5, 0.5], [-30, 30]);
  const layer1Y = useTransform(parallaxY, [-0.5, 0.5], [-30, 30]);
  const layer2X = useTransform(parallaxX, [-0.5, 0.5], [-15, 15]);
  const layer2Y = useTransform(parallaxY, [-0.5, 0.5], [-15, 15]);
  const layer3X = useTransform(parallaxX, [-0.5, 0.5], [-8, 8]);
  const layer3Y = useTransform(parallaxY, [-0.5, 0.5], [-8, 8]);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      mouseX.set((clientX / innerWidth) - 0.5);
      mouseY.set((clientY / innerHeight) - 0.5);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  // GSAP Scroll Animations
  useEffect(() => {
    if (!containerRef.current || !heroRef.current) return;

    const ctx = gsap.context(() => {
      // Hero zoom out effect on scroll
      gsap.to(heroRef.current, {
        scale: 0.9,
        borderRadius: '3rem',
        ease: 'none',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
        },
      });

      // Overlay fade in
      gsap.to(overlayRef.current, {
        opacity: 0.6,
        ease: 'none',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'center top',
          end: 'bottom top',
          scrub: 1,
        },
      });

      // Text parallax
      if (textRef.current) {
        gsap.to(textRef.current, {
          y: -150,
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });
      }

      // Image parallax
      if (imageWrapperRef.current) {
        gsap.to(imageWrapperRef.current, {
          y: 100,
          scale: 1.15,
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative h-[150vh]">
      {/* Sticky Hero Container */}
      <div
        ref={heroRef}
        className="sticky top-0 h-screen w-full overflow-hidden bg-brand-charcoal"
      >
        {/* Overlay for scroll effect */}
        <div
          ref={overlayRef}
          className="absolute inset-0 bg-brand-charcoal z-30 pointer-events-none opacity-0"
        />

        {/* Background Image with Parallax */}
        <div ref={imageWrapperRef} className="absolute inset-0 scale-110">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-charcoal/60 via-brand-charcoal/30 to-brand-charcoal z-10" />
          <Image
            src="/images/products/hero-organic.jpg"
            alt="Organic Products"
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Floating Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          {/* Animated organic shapes */}
          <motion.div
            className="absolute top-[15%] left-[10%] w-64 h-64 rounded-full"
            style={{
              x: layer1X,
              y: layer1Y,
              background: 'radial-gradient(circle, rgba(212,165,116,0.15) 0%, transparent 70%)',
            }}
          />
          <motion.div
            className="absolute bottom-[20%] right-[15%] w-96 h-96 rounded-full"
            style={{
              x: layer2X,
              y: layer2Y,
              background: 'radial-gradient(circle, rgba(42,90,58,0.2) 0%, transparent 70%)',
            }}
          />

          {/* Floating leaves */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute text-brand-mustard/20"
              style={{
                left: `${15 + i * 15}%`,
                top: `${20 + (i % 3) * 25}%`,
                x: i % 2 === 0 ? layer1X : layer2X,
                y: i % 2 === 0 ? layer1Y : layer2Y,
              }}
              animate={{
                rotate: [0, 10, -10, 0],
                y: [0, -20, 0],
              }}
              transition={{
                duration: 8 + i * 2,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.5,
              }}
            >
              <Leaf size={32 + i * 8} />
            </motion.div>
          ))}

          {/* Sparkle effects */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={`sparkle-${i}`}
              className="absolute w-1 h-1 bg-brand-mustard rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 4,
              }}
            />
          ))}
        </div>

        {/* Main Content */}
        <div ref={textRef} className="relative z-30 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left Content */}
              <div className="text-center lg:text-left">
                {/* Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={isLoaded ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 mb-8"
                >
                  <Sparkles className="w-4 h-4 text-brand-mustard" />
                  <span className="text-sm text-white/80 tracking-wide">
                    100% Certified Organic
                  </span>
                </motion.div>

                {/* Main Title with Split Animation */}
                <div className="mb-6">
                  <MaskReveal delay={0.4}>
                    <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold text-white leading-[0.95] tracking-tight">
                      Pure
                    </h1>
                  </MaskReveal>
                  <div className="flex items-center gap-4 lg:gap-6 justify-center lg:justify-start">
                    <MaskReveal delay={0.5}>
                      <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold leading-[0.95] tracking-tight">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-mustard via-brand-cream to-brand-mustard">
                          Nature
                        </span>
                      </h1>
                    </MaskReveal>
                    {/* Decorative line */}
                    <motion.div
                      className="hidden lg:block h-1 bg-gradient-to-r from-brand-mustard to-transparent rounded-full"
                      initial={{ width: 0 }}
                      animate={isLoaded ? { width: 120 } : {}}
                      transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <MaskReveal delay={0.6}>
                    <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold text-white leading-[0.95] tracking-tight">
                      Delivered
                    </h1>
                  </MaskReveal>
                </div>

                {/* Subtitle */}
                <motion.p
                  className="text-lg md:text-xl text-white/70 max-w-lg mx-auto lg:mx-0 mb-10 leading-relaxed"
                  initial={{ opacity: 0, y: 20 }}
                  animate={isLoaded ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.6, delay: 0.8 }}
                >
                  Experience the finest organic superfoods, handpicked from sustainable
                  farms and delivered fresh to your doorstep.
                </motion.p>

                {/* CTA Buttons */}
                <motion.div
                  className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
                  initial={{ opacity: 0, y: 20 }}
                  animate={isLoaded ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.6, delay: 1 }}
                >
                  <MagneticButton magneticStrength={0.3}>
                    <Link
                      href="/products"
                      className="group inline-flex items-center gap-3 px-8 py-4 bg-brand-mustard text-brand-charcoal rounded-full font-semibold text-lg transition-all duration-300 hover:bg-white"
                    >
                      <span>Shop Now</span>
                      <motion.div
                        animate={{ x: [0, 5, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <ArrowRight className="w-5 h-5" />
                      </motion.div>
                    </Link>
                  </MagneticButton>

                  <MagneticButton magneticStrength={0.3}>
                    <button className="group inline-flex items-center gap-3 px-8 py-4 border-2 border-white/30 text-white rounded-full font-semibold text-lg transition-all duration-300 hover:border-white hover:bg-white/10">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                      <span>Watch Story</span>
                    </button>
                  </MagneticButton>
                </motion.div>

                {/* Stats Row */}
                <motion.div
                  className="grid grid-cols-3 gap-8 mt-16 pt-8 border-t border-white/10"
                  initial={{ opacity: 0 }}
                  animate={isLoaded ? { opacity: 1 } : {}}
                  transition={{ duration: 0.6, delay: 1.2 }}
                >
                  {[
                    { value: '50k+', label: 'Happy Customers' },
                    { value: '500+', label: 'Organic Products' },
                    { value: '100%', label: 'Natural' },
                  ].map((stat, i) => (
                    <div key={i} className="text-center lg:text-left">
                      <div className="font-display text-3xl md:text-4xl font-bold text-white mb-1">
                        {stat.value}
                      </div>
                      <div className="text-sm text-white/50">{stat.label}</div>
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* Right Content - Featured Products */}
              <motion.div
                className="relative hidden lg:block"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isLoaded ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 1, delay: 0.5 }}
              >
                {/* Main product showcase */}
                <div className="relative">
                  {/* Glowing orb background */}
                  <motion.div
                    className="absolute inset-0 -inset-20"
                    style={{
                      background: 'radial-gradient(circle at center, rgba(212,165,116,0.3) 0%, transparent 60%)',
                      x: layer3X,
                      y: layer3Y,
                    }}
                  />

                  {/* Central product ring */}
                  <div className="relative w-[500px] h-[500px] mx-auto">
                    {/* Rotating border */}
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-dashed border-brand-mustard/30"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                    />

                    {/* Inner glow */}
                    <div className="absolute inset-8 rounded-full bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm" />

                    {/* Floating product cards */}
                    {(products.length > 0 ? products.slice(0, 3) : [
                      { id: '1', name: 'Organic Honey', image: '/images/products/honey.jpg', price: 599 },
                      { id: '2', name: 'Pure Ghee', image: '/images/products/ghee.jpg', price: 899 },
                      { id: '3', name: 'Mixed Nuts', image: '/images/products/nuts.jpg', price: 749 },
                    ]).map((product, i) => {
                      const angle = (i * 120 - 60) * (Math.PI / 180);
                      const radius = 180;
                      const x = Math.cos(angle) * radius;
                      const y = Math.sin(angle) * radius;

                      return (
                        <motion.div
                          key={product.id}
                          className="absolute w-36 h-36 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 overflow-hidden shadow-2xl"
                          style={{
                            left: `calc(50% + ${x}px - 72px)`,
                            top: `calc(50% + ${y}px - 72px)`,
                          }}
                          animate={{
                            y: [0, -15, 0],
                            rotate: [0, 5, -5, 0],
                          }}
                          transition={{
                            duration: 6 + i,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: i * 0.5,
                          }}
                          whileHover={{ scale: 1.1, zIndex: 10 }}
                        >
                          <Image
                            src={product.image}
                            alt={product.name}
                            fill
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="text-white text-xs font-medium truncate">
                              {product.name}
                            </p>
                            <p className="text-brand-mustard text-xs font-bold">
                              ₹{product.price}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}

                    {/* Center logo */}
                    <motion.div
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/30 flex items-center justify-center"
                      style={{ x: layer3X, y: layer3Y }}
                    >
                      <div className="text-center">
                        <Leaf className="w-10 h-10 text-brand-mustard mx-auto" />
                        <span className="text-white font-display font-bold text-sm mt-1 block">
                          Naturelite
                        </span>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30"
          initial={{ opacity: 0 }}
          animate={isLoaded ? { opacity: 1 } : {}}
          transition={{ delay: 1.5 }}
        >
          <motion.div
            className="flex flex-col items-center gap-3 cursor-pointer"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
          >
            <span className="text-white/50 text-xs tracking-[0.3em] uppercase">
              Scroll to Explore
            </span>
            <div className="w-6 h-10 rounded-full border-2 border-white/30 flex justify-center pt-2">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-brand-mustard"
                animate={{ y: [0, 16, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
