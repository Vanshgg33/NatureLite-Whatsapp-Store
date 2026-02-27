'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import dynamic from 'next/dynamic';

const StoryProcessScene = dynamic(
  () => import('@/components/three/scenes/StoryProcessScene').then(mod => mod.StoryProcessScene),
  { ssr: false }
);

const stages = [
  {
    step: '01',
    title: 'Farm Selection',
    description: 'We partner with certified organic farms across India, handpicking only the finest sources for your table.',
    range: [0, 0.25] as [number, number],
    align: 'left' as const,
  },
  {
    step: '02',
    title: 'Traditional Extraction',
    description: 'Cold-pressed using age-old wooden Ghani churners at temperatures below 50°C, preserving every nutrient.',
    range: [0.25, 0.5] as [number, number],
    align: 'right' as const,
  },
  {
    step: '03',
    title: 'Quality Testing',
    description: 'Every batch undergoes rigorous purity and freshness testing. Only the best makes it to your kitchen.',
    range: [0.5, 0.75] as [number, number],
    align: 'left' as const,
  },
  {
    step: '04',
    title: 'Fresh to You',
    description: 'Eco-friendly packaging, sealed for freshness. Delivered to your doorstep within 48 hours.',
    range: [0.75, 1.0] as [number, number],
    align: 'right' as const,
  },
];

export default function OurStorySection() {
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

  const showCTA = scrollProgress > 0.9;
  const activeStage = Math.min(3, Math.floor(scrollProgress * 4));

  return (
    <section ref={sectionRef} className="relative h-[250vh]" style={{ background: '#1A2E23' }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* 3D Canvas */}
        <div className="absolute inset-0">
          {isVisible && <StoryProcessScene progress={scrollProgress} />}
        </div>

        {/* Section title (appears briefly at start) */}
        <div
          className="absolute top-8 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none"
          style={{
            opacity: scrollProgress < 0.08 ? 1 : Math.max(0, 1 - (scrollProgress - 0.08) / 0.05),
          }}
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-px w-8 bg-brand-green-light" />
            <span className="text-brand-green-light font-medium text-xs tracking-[0.2em] uppercase">
              Our Process
            </span>
            <div className="h-px w-8 bg-brand-green-light" />
          </div>
          <h2 className="font-display text-2xl lg:text-4xl font-bold text-white">
            From Farm to Table
          </h2>
        </div>

        {/* Stage text overlays */}
        <div className="relative z-10 h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pointer-events-none">
          {stages.map((stage, index) => {
            const stageProgress = scrollProgress >= stage.range[0] && scrollProgress < stage.range[1]
              ? (scrollProgress - stage.range[0]) / (stage.range[1] - stage.range[0])
              : scrollProgress >= stage.range[1] ? 1 : 0;

            const opacity = stageProgress > 0 && stageProgress < 1
              ? Math.sin(stageProgress * Math.PI)
              : 0;

            const translateY = stageProgress < 0.5
              ? (1 - stageProgress * 2) * 30
              : (stageProgress - 0.5) * 2 * -30;

            return (
              <div
                key={index}
                className={`absolute top-1/2 max-w-md ${
                  stage.align === 'left'
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
                  <span className="font-display text-6xl lg:text-7xl font-bold text-white/8">
                    {stage.step}
                  </span>
                  <div className="h-px w-12 bg-brand-green-light" />
                  <h3 className="font-display text-3xl lg:text-5xl font-bold text-white">
                    {stage.title}
                  </h3>
                  <p className="text-white/60 text-base lg:text-lg leading-relaxed">
                    {stage.description}
                  </p>
                </div>
              </div>
            );
          })}

          {/* CTA at end */}
          <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center pointer-events-auto"
            style={{
              opacity: showCTA ? 1 : 0,
              transform: `translateX(-50%) translateY(${showCTA ? 0 : 20}px)`,
              transition: 'opacity 0.5s ease, transform 0.5s ease',
            }}
          >
            <Link
              href="/products"
              className="inline-flex items-center gap-2 px-8 py-4 bg-brand-green text-white rounded-full text-base font-semibold hover:bg-brand-green-light transition-colors"
            >
              Shop Our Collection
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Stage progress indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {stages.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ${
                i <= activeStage ? 'w-6 bg-brand-green' : 'w-6 bg-white/15'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Dark-to-light gradient transition */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[200px] pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, transparent, #F7F4F0)',
        }}
      />
    </section>
  );
}
