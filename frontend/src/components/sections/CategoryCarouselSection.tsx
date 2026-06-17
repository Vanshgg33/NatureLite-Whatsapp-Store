'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Category } from '@/types';

interface Props {
  categories: Category[];
}

export default function CategoryCarouselSection({ categories }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = categories.filter((c) => c.isActive);
  if (visible.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -260 : 260, behavior: 'smooth' });
  };

  return (
    <section className="relative py-6 sm:py-8" style={{ background: '#faf5ec' }}>
      <div className="max-w-[1440px] mx-auto px-6 sm:px-8 lg:px-10">

        <h2
          className="text-center font-bold mb-6"
          style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', color: '#0b1c08', letterSpacing: '-0.02em' }}
        >
          Shop by Category
        </h2>

        <div className="relative">
          {/* Left arrow */}
          <button
            onClick={() => scroll('left')}
            className="absolute -left-4 top-[50px] z-10 w-9 h-9 flex items-center justify-center rounded-full shadow-md transition-all hover:scale-105 active:scale-95"
            style={{ background: '#fff', border: '1.5px solid rgba(26,82,16,0.20)', color: '#1a5210' }}
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Scrollable row */}
          <div
            ref={scrollRef}
            className="flex gap-5 overflow-x-auto px-2 pb-3 hide-scrollbar"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {visible.map((cat) => (
              <Link
                key={cat._id}
                href={`/products?category=${cat.slug}`}
                className="flex-shrink-0 flex flex-col items-center gap-2.5 group"
                style={{ width: 110 }}
              >
                {/* Image box */}
                <div
                  className="relative overflow-hidden transition-transform duration-300 group-hover:scale-[1.05]"
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 18,
                    background: 'linear-gradient(145deg, #fff8f0, #ede4d0)',
                    boxShadow: '0 3px 12px rgba(0,0,0,0.09)',
                    border: '1.5px solid rgba(200,150,12,0.16)',
                    flexShrink: 0,
                  }}
                >
                  {cat.image ? (
                    <Image
                      src={cat.image}
                      alt={cat.name}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                  ) : (
                    /* Placeholder when no image */
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ fontSize: 36 }}
                    >
                      🛒
                    </div>
                  )}
                </div>

                {/* Name */}
                <span
                  className="text-center font-semibold leading-tight"
                  style={{ fontSize: 12, color: '#1a2810', maxWidth: 100, wordBreak: 'break-word' }}
                >
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>

          {/* Right arrow */}
          <button
            onClick={() => scroll('right')}
            className="absolute -right-4 top-[50px] z-10 w-9 h-9 flex items-center justify-center rounded-full shadow-md transition-all hover:scale-105 active:scale-95"
            style={{ background: '#fff', border: '1.5px solid rgba(26,82,16,0.20)', color: '#1a5210' }}
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}
