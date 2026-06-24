'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import dynamic from 'next/dynamic';

const ProductShowcaseScene = dynamic(
  () => import('@/components/three/scenes/ProductShowcaseScene').then(mod => mod.ProductShowcaseScene),
  { ssr: false }
);

const products = [
  {
    id: 'oil-bottle',
    name: 'Cold-Pressed Oil',
    subtitle: 'TRADITIONAL WOOD-PRESSED',
    description: 'Pure organic oil extracted using age-old wooden Ghani methods. No chemicals, no heat — just nature.',
    tags: ['100% Pure', 'Farm Fresh', 'No Additives'],
    link: '/products',
    range: [0, 0.45] as [number, number],
    align: 'left' as const,
  },
  {
    id: 'dry-fruit-box',
    name: 'Premium Dry Fruits',
    subtitle: 'HANDPICKED & FARM-FRESH',
    description: 'Carefully selected premium dry fruits, packed in eco-friendly boxes. Perfect for gifting and daily nutrition.',
    tags: ['Premium Quality', 'Eco Packaging', 'Rich Nutrition'],
    link: '/products',
    range: [0.55, 1.0] as [number, number],
    align: 'right' as const,
  },
];

export default function ProductShowcaseSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(section);

    const handleScroll = () => {
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const sectionHeight = section.offsetHeight - window.innerHeight;
      if (sectionHeight <= 0) return;
      const progress = Math.max(0, Math.min(1, -rect.top / sectionHeight));
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const activeProductIndex = scrollProgress < 0.5 ? 0 : 1;

  return (
    <section ref={sectionRef} className="relative h-[300vh]" style={{ background: '#1A2E23' }}>
      {/* White-to-dark transition at top */}
      <div
        className="absolute top-0 left-0 right-0 h-[120px] z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, #ffffff, #1A2E23)' }}
      />

      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* 3D Canvas */}
        <div className="absolute inset-0">
          {isVisible && <ProductShowcaseScene progress={scrollProgress} />}
        </div>

        {/* Text Overlays */}
        <div className="relative z-10 h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pointer-events-none">
          {products.map((product) => {
            const [start, end] = product.range;
            const stageProgress = scrollProgress >= start && scrollProgress < end
              ? (scrollProgress - start) / (end - start)
              : scrollProgress >= end ? 1 : 0;

            const opacity = stageProgress > 0 && stageProgress < 1
              ? Math.sin(stageProgress * Math.PI)
              : 0;

            const translateY = stageProgress < 0.5
              ? (1 - stageProgress * 2) * 30
              : (stageProgress - 0.5) * 2 * -30;

            return (
              <div
                key={product.id}
                className={`absolute top-1/2 max-w-lg ${
                  product.align === 'left'
                    ? 'left-4 sm:left-8 lg:left-12'
                    : 'right-4 sm:right-8 lg:right-12'
                }`}
                style={{
                  opacity,
                  transform: `translateY(calc(-50% + ${translateY}px))`,
                  transition: 'none',
                }}
              >
                <div className="space-y-4">
                  <span className="text-brand-mustard font-medium text-xs tracking-[0.2em]">
                    {product.subtitle}
                  </span>

                  <h3 className="font-display text-3xl lg:text-5xl font-bold text-white">
                    {product.name}
                  </h3>

                  <p className="text-white/60 text-base lg:text-lg leading-relaxed">
                    {product.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {product.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-full bg-white/10 text-white/70 text-xs font-medium border border-white/10"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="pt-4 pointer-events-auto">
                    <Link
                      href={product.link}
                      className="inline-flex items-center gap-2 px-7 py-3.5 bg-brand-green text-white rounded-full font-semibold hover:bg-brand-green-light transition-colors"
                    >
                      Shop Now
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress dots */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-10">
          {products.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === activeProductIndex
                  ? 'w-8 bg-brand-green'
                  : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
