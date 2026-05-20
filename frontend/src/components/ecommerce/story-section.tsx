'use client';

import { useRef, useEffect } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Leaf, Heart, Shield, Truck, Award, Users } from 'lucide-react';
import { MaskReveal, TextReveal } from '@/components/motion/text-reveal';

gsap.registerPlugin(ScrollTrigger);

const storyBlocks = [
  {
    id: 1,
    icon: Leaf,
    title: 'From Farm to Table',
    subtitle: 'Direct Sourcing',
    description: 'We partner directly with organic farmers across India, ensuring the freshest produce reaches your kitchen within 48 hours of harvest.',
    image: '/images/story/farm.jpg',
    stat: { value: '200+', label: 'Partner Farms' },
    color: 'brand-green',
  },
  {
    id: 2,
    icon: Shield,
    title: 'Certified Purity',
    subtitle: 'Quality Assurance',
    description: 'Every product undergoes rigorous quality testing. We hold certifications from FSSAI, India Organic, and international standards.',
    image: '/images/story/quality.jpg',
    stat: { value: '100%', label: 'Certified Organic' },
    color: 'brand-mustard',
  },
  {
    id: 3,
    icon: Heart,
    title: 'Crafted with Love',
    subtitle: 'Traditional Methods',
    description: 'Our products are made using time-honored traditional methods, preserving nutrients and authentic flavors passed down through generations.',
    image: '/images/story/craft.jpg',
    stat: { value: '50+', label: 'Years of Heritage' },
    color: 'brand-terracotta',
  },
];

export function StorySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  const progressWidth = useTransform(smoothProgress, [0, 1], ['0%', '100%']);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      // Parallax images
      gsap.utils.toArray<HTMLElement>('.story-image').forEach((image) => {
        gsap.to(image, {
          yPercent: -20,
          ease: 'none',
          scrollTrigger: {
            trigger: image,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        });
      });

      // Horizontal scroll for story cards on mobile
      const cards = gsap.utils.toArray<HTMLElement>('.story-card');
      cards.forEach((card, i) => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 100, rotateX: -15 },
          {
            opacity: 1,
            y: 0,
            rotateX: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 85%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative py-32 bg-brand-cream overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <pattern id="story-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M20 5C20 5 10 15 10 25C10 32 15 38 20 38C25 38 30 32 30 25C30 15 20 5 20 5Z"
              stroke="currentColor" fill="none" strokeWidth="0.5" className="text-brand-green" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#story-pattern)" />
        </svg>
      </div>

      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-brand-border z-50">
        <motion.div
          ref={progressRef}
          className="h-full bg-gradient-to-r from-brand-green via-brand-mustard to-brand-terracotta"
          style={{ width: progressWidth }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-24">
          <TextReveal>
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="h-px w-12 bg-brand-mustard" />
              <span className="text-brand-mustard font-medium text-sm tracking-[0.2em] uppercase">
                Our Journey
              </span>
              <div className="h-px w-12 bg-brand-mustard" />
            </div>
          </TextReveal>

          <MaskReveal delay={0.2}>
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-brand-charcoal mb-6">
              The Purity Foods Story
            </h2>
          </MaskReveal>

          <TextReveal delay={0.4}>
            <p className="text-xl text-brand-muted max-w-2xl mx-auto">
              A commitment to purity, sustainability, and the authentic flavors of nature
            </p>
          </TextReveal>
        </div>

        {/* Story Blocks */}
        <div className="space-y-32 lg:space-y-48">
          {storyBlocks.map((block, index) => (
            <div
              key={block.id}
              className={`story-card grid lg:grid-cols-2 gap-12 lg:gap-20 items-center ${
                index % 2 === 1 ? 'lg:flex-row-reverse' : ''
              }`}
              style={{ perspective: 1000 }}
            >
              {/* Image Side */}
              <div className={`relative ${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                <div className="relative aspect-[4/3] rounded-3xl overflow-hidden">
                  {/* Image with parallax */}
                  <div className="story-image absolute inset-0 scale-125">
                    <Image
                      src={block.image}
                      alt={block.title}
                      fill
                      className="object-cover"
                    />
                  </div>

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-charcoal/40 to-transparent" />

                  {/* Floating stat card */}
                  <motion.div
                    className={`absolute ${
                      index % 2 === 0 ? '-right-6 -bottom-6' : '-left-6 -bottom-6'
                    } bg-white rounded-2xl p-6 shadow-brand-xl`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    viewport={{ once: true }}
                  >
                    <div className={`text-4xl font-display font-bold text-${block.color}`}>
                      {block.stat.value}
                    </div>
                    <div className="text-brand-muted text-sm mt-1">{block.stat.label}</div>
                  </motion.div>
                </div>

                {/* Decorative elements */}
                <div
                  className={`absolute ${
                    index % 2 === 0 ? '-left-8 -top-8' : '-right-8 -top-8'
                  } w-32 h-32 rounded-full bg-${block.color}/10 -z-10`}
                />
              </div>

              {/* Content Side */}
              <div className={index % 2 === 1 ? 'lg:order-1' : ''}>
                <motion.div
                  initial={{ opacity: 0, x: index % 2 === 0 ? 50 : -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8 }}
                  viewport={{ once: true }}
                >
                  {/* Icon */}
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-${block.color}/10 mb-6`}>
                    <block.icon className={`w-8 h-8 text-${block.color}`} />
                  </div>

                  {/* Subtitle */}
                  <span className={`text-${block.color} font-medium text-sm tracking-wider uppercase`}>
                    {block.subtitle}
                  </span>

                  {/* Title */}
                  <h3 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal mt-3 mb-6">
                    {block.title}
                  </h3>

                  {/* Description */}
                  <p className="text-lg text-brand-muted leading-relaxed mb-8">
                    {block.description}
                  </p>

                  {/* Decorative line */}
                  <div className="flex items-center gap-4">
                    <div className={`h-1 w-24 bg-${block.color} rounded-full`} />
                    <span className="text-brand-muted text-sm">0{index + 1}</span>
                  </div>
                </motion.div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Stats Bar */}
        <motion.div
          className="mt-32 grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 p-8 lg:p-12 bg-brand-charcoal rounded-3xl"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          {[
            { icon: Users, value: '50,000+', label: 'Happy Customers' },
            { icon: Truck, value: '100+', label: 'Cities Served' },
            { icon: Award, value: '15+', label: 'Awards Won' },
            { icon: Leaf, value: '500+', label: 'Organic Products' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
            >
              <stat.icon className="w-8 h-8 text-brand-mustard mx-auto mb-4" />
              <div className="font-display text-3xl lg:text-4xl font-bold text-white mb-2">
                {stat.value}
              </div>
              <div className="text-white/60 text-sm">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
