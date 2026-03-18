'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FeaturedProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  image: string;
  rating: number;
  badge?: string;
}

const featuredProducts: FeaturedProduct[] = [
  {
    id: '1',
    name: 'Wood-Pressed Mustard Oil',
    slug: 'wood-pressed-mustard-oil',
    description: 'Pure, pungent, and full of traditional flavor',
    price: 449,
    compareAtPrice: 599,
    image: '/images/products/mustard-oil.jpg',
    rating: 4.9,
    badge: 'Bestseller',
  },
  {
    id: '2',
    name: 'Bilona Ghee - A2 Gir Cow',
    slug: 'bilona-ghee-a2-gir-cow',
    description: 'Hand-churned from cultured curd, Vedic tradition',
    price: 1299,
    compareAtPrice: 1499,
    image: '/images/products/ghee.jpg',
    rating: 4.8,
    badge: 'Premium',
  },
  {
    id: '3',
    name: 'Cold-Pressed Groundnut Oil',
    slug: 'cold-pressed-groundnut-oil',
    description: 'Light, nutty, perfect for everyday cooking',
    price: 399,
    image: '/images/products/groundnut-oil.jpg',
    rating: 4.7,
  },
  {
    id: '4',
    name: 'Wood-Pressed Sesame Oil',
    slug: 'wood-pressed-sesame-oil',
    description: 'Rich in antioxidants, ideal for South Indian dishes',
    price: 549,
    image: '/images/products/sesame-oil.jpg',
    rating: 4.8,
  },
];

export function ProductShowcase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-brand-cream overflow-hidden"
    >
      <div className="brand-container">
        {/* Section Header */}
        <motion.div
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div>
            <span className="inline-block px-4 py-1.5 mb-4 text-sm font-body tracking-wider text-brand-mustard bg-brand-mustard/10 rounded-full">
              Our Collection
            </span>
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal">
              Pure & Natural
            </h2>
          </div>
          <Link href="/products">
            <Button
              variant="outline"
              className="border-brand-charcoal text-brand-charcoal hover:bg-brand-charcoal hover:text-brand-cream rounded-full"
            >
              View All Products
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </motion.div>

        {/* Product Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {featuredProducts.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.5,
                delay: 0.1 * index,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Link href={`/products/${product.slug}`} className="group block">
                <div className="relative bg-white rounded-2xl overflow-hidden shadow-brand-sm transition-all duration-normal group-hover:shadow-brand-lg group-hover:-translate-y-1">
                  {/* Image */}
                  <div className="relative aspect-square bg-brand-sand">
                    {/* Placeholder - replace with actual images */}
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-mustard/20 to-brand-brown/20">
                      <span className="font-display text-6xl text-brand-brown/20">
                        {(product.name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Badge */}
                    {product.badge && (
                      <span className="absolute top-3 left-3 px-3 py-1 text-xs font-body font-medium bg-brand-mustard text-white rounded-full">
                        {product.badge}
                      </span>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-brand-charcoal/0 group-hover:bg-brand-charcoal/10 transition-colors duration-normal" />
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    {/* Rating */}
                    <div className="flex items-center gap-1 mb-2">
                      <Star className="w-4 h-4 fill-brand-mustard text-brand-mustard" />
                      <span className="text-sm font-body font-medium text-brand-charcoal">
                        {product.rating}
                      </span>
                    </div>

                    {/* Name */}
                    <h3 className="font-display text-lg font-semibold text-brand-charcoal mb-1 group-hover:text-brand-brown transition-colors">
                      {product.name}
                    </h3>

                    {/* Description */}
                    <p className="font-body text-sm text-brand-muted mb-3 line-clamp-2">
                      {product.description}
                    </p>

                    {/* Price */}
                    <div className="flex items-center gap-2">
                      <span className="font-display text-xl font-bold text-brand-charcoal">
                        {formatPrice(product.price)}
                      </span>
                      {product.compareAtPrice && (
                        <span className="font-body text-sm text-brand-muted line-through">
                          {formatPrice(product.compareAtPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
