'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PremiumProductCard } from '@/components/ecommerce/premium-product-card';
import { QuickViewModal } from '@/components/ecommerce/quick-view-modal';
import { Product } from '@/types';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Magnetic } from '@/components/ui/magnetic';
import { useSiteSettings } from '@/lib/site-settings-context';

interface FeaturedProductsSectionProps {
  products: Product[];
}

export default function FeaturedProductsSection({ products }: FeaturedProductsSectionProps) {
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [quickViewVariantSku, setQuickViewVariantSku] = useState<string | undefined>(undefined);
  const { banners } = useSiteSettings();
  const activeProme = (banners?.promoBanners ?? []).find((b) => b.isActive && (b.imageUrl || b.videoUrl));

  const featured = useMemo(
    () => [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [products],
  );

  if (products.length === 0) return null;

  return (
    <>
      {/* Promotional banner — above the green section */}
      {activeProme && (
        <div style={{ background: '#f2ece0' }}>
          <div className="overflow-hidden">
            {activeProme.linkUrl ? (
              <Link href={activeProme.linkUrl} className="block">
                {activeProme.videoUrl ? (
                  <video src={activeProme.videoUrl} className="w-full object-cover max-h-[300px]" autoPlay muted loop playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeProme.imageUrl} alt="Promotional banner" className="w-full object-cover max-h-[300px]" />
                )}
              </Link>
            ) : activeProme.videoUrl ? (
              <video src={activeProme.videoUrl} className="w-full object-cover max-h-[300px]" autoPlay muted loop playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeProme.imageUrl} alt="Promotional banner" className="w-full object-cover max-h-[300px]" />
            )}
          </div>
        </div>
      )}

    <section
      className="relative py-8 sm:py-12 overflow-hidden"
      style={{ background: 'linear-gradient(160deg,#040e02 0%,#0c2206 60%,#051802 100%)' }}
    >
      {/* Ambient glow — top center amber */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          top: '-15%', left: '50%', transform: 'translateX(-50%)',
          width: 900, height: 600,
          background: 'radial-gradient(ellipse,rgba(160,112,16,0.09) 0%,transparent 65%)',
          filter: 'blur(90px)',
        }}
      />
      {/* Bottom-right forest glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          bottom: '-10%', right: '-5%',
          width: 500, height: 500,
          background: 'radial-gradient(ellipse,rgba(26,82,16,0.18) 0%,transparent 70%)',
          filter: 'blur(70px)',
        }}
      />

      {/* Grain texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          opacity: 0.45, mixBlendMode: 'overlay',
        }}
      />

      <div className="relative z-10 max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6">

        {/* Header row */}
        <div className="flex items-end justify-between mb-4 sm:mb-5">
          <div>
            <motion.div
              className="inline-flex items-center gap-2 mb-3"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'rgba(184,138,20,0.65)' }} />
              <p style={{ fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(184,138,20,0.65)', fontFamily: 'monospace' }}>
                Fresh arrivals
              </p>
            </motion.div>

            <motion.h2
              className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold"
              style={{ color: '#fff8f0', letterSpacing: '-0.02em' }}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.06 }}
            >
              New Arrivals
            </motion.h2>

            <div
              style={{
                width: 48, height: 2.5,
                background: 'linear-gradient(90deg,#a07010,#1a5210)',
                margin: '10px 0 0', borderRadius: 2,
              }}
            />
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.18 }}
            className="hidden sm:block"
          >
            <Magnetic strength={0.3}>
              <Link
                href="/products?sort=newest"
                data-cursor="VIEW"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                style={{
                  background: 'rgba(160,112,16,0.12)',
                  border: '1px solid rgba(160,112,16,0.25)',
                  color: 'rgba(184,138,20,0.85)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(160,112,16,0.22)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(160,112,16,0.12)'; }}
              >
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Magnetic>
          </motion.div>
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {featured.map((product, index) => (
            <motion.div
              key={product._id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.50, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }}
            >
              <PremiumProductCard
                product={product}
                index={index}
                showMostPopular={index === 0}
                compact
                onQuickView={product.variants?.length > 0 ? (p, sku) => { setQuickViewProduct(p); setQuickViewVariantSku(sku); } : undefined}
              />
            </motion.div>
          ))}
        </div>

        {/* Mobile CTA */}
        <div className="text-center mt-8 sm:hidden">
          <Link
            href="/products?sort=newest"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
            style={{ background: '#a07010', color: '#fff' }}
          >
            See All New Arrivals <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <QuickViewModal
        product={quickViewProduct}
        isOpen={!!quickViewProduct}
        initialVariantSku={quickViewVariantSku}
        onClose={() => { setQuickViewProduct(null); setQuickViewVariantSku(undefined); }}
      />
    </section>
    </>
  );
}
