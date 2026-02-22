'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Leaf, Sparkles, Award, Truck, Shield, Users, Star, ShoppingBag, Heart } from 'lucide-react';

// Import components
import { FeaturedSection } from '@/components/ecommerce/featured-section';
import { TrustBadges, TrustBanner } from '@/components/ecommerce/trust-badges';
import { Testimonials } from '@/components/ecommerce/testimonials';
import { NewsletterSection } from '@/components/ecommerce/newsletter-section';
import { QuickViewModal } from '@/components/ecommerce/quick-view-modal';
import { api } from '@/lib/api';
import { Product, Category } from '@/types';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';

// Simplified Hero Section - No heavy GSAP animations
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center bg-gradient-to-br from-brand-cream via-brand-cream to-brand-sand overflow-hidden">
      {/* Simple background pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5C30 5 15 20 15 35C15 45 22 55 30 55C38 55 45 45 45 35C45 20 30 5 30 5Z' stroke='%232a5a3a' fill='none' stroke-width='1'/%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Decorative circles - CSS only */}
      <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-brand-green/5 blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-brand-mustard/10 blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text Content */}
          <div className="text-center lg:text-left">
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-green/10 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Sparkles className="w-4 h-4 text-brand-green" />
              <span className="text-sm text-brand-green font-medium">100% Certified Organic</span>
            </motion.div>

            <motion.h1
              className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-brand-charcoal leading-[1.1] mb-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Pure Nature,
              <br />
              <span className="text-brand-green">Delivered Fresh</span>
            </motion.h1>

            <motion.p
              className="text-lg text-brand-muted max-w-xl mx-auto lg:mx-0 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Experience the finest organic superfoods, handpicked from sustainable farms
              and delivered fresh to your doorstep.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Link
                href="/products"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-brand-charcoal text-white rounded-full font-semibold hover:bg-brand-green transition-colors"
              >
                Shop Now
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-brand-charcoal/20 text-brand-charcoal rounded-full font-semibold hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-all"
              >
                Our Story
                <Leaf className="w-5 h-5" />
              </Link>
            </motion.div>

            {/* Stats */}
            <motion.div
              className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-brand-border"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              {[
                { value: '50k+', label: 'Happy Customers' },
                { value: '500+', label: 'Products' },
                { value: '100%', label: 'Organic' },
              ].map((stat, i) => (
                <div key={i} className="text-center lg:text-left">
                  <div className="font-display text-2xl lg:text-3xl font-bold text-brand-charcoal">
                    {stat.value}
                  </div>
                  <div className="text-sm text-brand-muted">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Image Side */}
          <motion.div
            className="relative hidden lg:block"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="relative w-full aspect-square max-w-lg mx-auto">
              {/* Decorative ring */}
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-brand-mustard/30 animate-spin-slow" />

              {/* Main circle */}
              <div className="absolute inset-8 rounded-full bg-gradient-to-br from-brand-sand to-brand-cream shadow-brand-xl flex items-center justify-center">
                <div className="text-center">
                  <Leaf className="w-16 h-16 text-brand-green mx-auto mb-4" />
                  <span className="font-display text-2xl font-bold text-brand-charcoal">Naturelite</span>
                  <p className="text-sm text-brand-muted mt-2">Pure & Natural</p>
                </div>
              </div>

              {/* Floating badges */}
              <div className="absolute top-[10%] right-[5%] px-4 py-2 bg-white rounded-full shadow-brand-md animate-float">
                <span className="text-sm font-medium text-brand-green">🌿 Organic</span>
              </div>
              <div className="absolute bottom-[15%] left-[0%] px-4 py-2 bg-white rounded-full shadow-brand-md animate-float" style={{ animationDelay: '1s' }}>
                <span className="text-sm font-medium text-brand-mustard">⭐ Premium</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// Simplified Product Card
function ProductCard({
  product,
  onQuickView,
}: {
  product: Product;
  onQuickView: (product: Product) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const { addItem } = useCartStore();
  const { toast } = useToast();

  const discount = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  const handleAddToCart = async () => {
    try {
      await addItem({
        productId: product._id,
        name: product.name,
        slug: product.slug,
        image: product.images[0] || '',
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        gstPercentage: product.gstPercentage || 5,
      }, 1);
      toast({ title: 'Added to cart', description: `${product.name} added to your cart.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to add item.', variant: 'destructive' });
    }
  };

  return (
    <motion.div
      className="group relative bg-white rounded-2xl overflow-hidden shadow-brand-sm hover:shadow-brand-lg transition-shadow duration-300"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-brand-cream">
        <Link href={`/products/${product.slug}`}>
          <Image
            src={product.images[0] || '/images/placeholder-product.jpg'}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {discount > 0 && (
            <span className="px-2 py-1 bg-brand-terracotta text-white text-xs font-semibold rounded-full">
              -{discount}%
            </span>
          )}
        </div>

        {/* Wishlist */}
        <button className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center text-brand-charcoal hover:text-brand-terracotta transition-colors shadow-sm">
          <Heart className="w-4 h-4" />
        </button>

        {/* Quick actions on hover */}
        <div
          className={`absolute bottom-3 left-3 right-3 flex gap-2 transition-all duration-300 ${
            isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <button
            onClick={handleAddToCart}
            className="flex-1 py-2.5 bg-white text-brand-charcoal rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-brand-charcoal hover:text-white transition-colors shadow-md"
          >
            <ShoppingBag className="w-4 h-4" />
            Add to Cart
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {typeof product.category === 'object' && product.category?.name && (
          <span className="text-xs text-brand-muted uppercase tracking-wider">
            {product.category.name}
          </span>
        )}
        <Link href={`/products/${product.slug}`}>
          <h3 className="font-display text-lg font-semibold text-brand-charcoal mt-1 mb-2 line-clamp-2 hover:text-brand-green transition-colors">
            {product.name}
          </h3>
        </Link>

        <div className="flex items-center gap-1 mb-2">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`w-3.5 h-3.5 ${i < 4 ? 'fill-brand-mustard text-brand-mustard' : 'text-brand-border'}`}
            />
          ))}
          <span className="text-xs text-brand-muted ml-1">({product.totalSold || 0})</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-bold text-brand-charcoal">
            ₹{product.price.toLocaleString()}
          </span>
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="text-sm text-brand-muted line-through">
              ₹{product.compareAtPrice.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Best Sellers Section
function BestSellersSection({
  products,
  onQuickView,
}: {
  products: Product[];
  onQuickView: (product: Product) => void;
}) {
  return (
    <section className="py-20 bg-brand-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-brand-green" />
              <span className="text-brand-green font-medium text-sm tracking-wider uppercase">
                Customer Favorites
              </span>
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal">
              Best Sellers
            </h2>
          </div>
          <Link
            href="/products?sort=totalSold"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-charcoal text-white rounded-full font-medium hover:bg-brand-green transition-colors"
          >
            View All
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.slice(0, 8).map((product) => (
            <ProductCard key={product._id} product={product} onQuickView={onQuickView} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Categories Section
function CategoriesSection({ categories }: { categories: Category[] }) {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-px w-8 bg-brand-mustard" />
            <span className="text-brand-mustard font-medium text-sm tracking-wider uppercase">
              Categories
            </span>
            <div className="h-px w-8 bg-brand-mustard" />
          </div>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal">
            Shop by Collection
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.slice(0, 6).map((category, index) => (
            <motion.div
              key={category._id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <Link
                href={`/products?category=${category._id}`}
                className="group block relative h-64 rounded-2xl overflow-hidden"
              >
                {category.image && (
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-brand-charcoal/70 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-end p-6">
                  <h3 className="font-display text-xl font-bold text-white mb-2">
                    {category.name}
                  </h3>
                  <div className="flex items-center gap-2 text-white/80 text-sm font-medium group-hover:text-brand-mustard transition-colors">
                    <span>Shop Now</span>
                    <ArrowRight className="w-4 h-4" />
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

// Stats Section
function StatsSection() {
  const stats = [
    { value: '50,000+', label: 'Happy Customers', icon: Users },
    { value: '500+', label: 'Organic Products', icon: Leaf },
    { value: '100+', label: 'Cities Served', icon: Truck },
    { value: '15+', label: 'Awards Won', icon: Award },
  ];

  return (
    <section className="py-16 bg-brand-charcoal">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <stat.icon className="w-8 h-8 text-brand-mustard mx-auto mb-3" />
              <div className="font-display text-3xl lg:text-4xl font-bold text-white mb-1">
                {stat.value}
              </div>
              <div className="text-white/60 text-sm">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Process Section
function ProcessSection() {
  const processes = [
    { step: '01', title: 'Farm Selection', description: 'Certified organic farms across India', icon: '🌱' },
    { step: '02', title: 'Traditional Extraction', description: 'Cold-pressed using wooden churners', icon: '⚙️' },
    { step: '03', title: 'Quality Testing', description: 'Rigorous purity and freshness tests', icon: '🔬' },
    { step: '04', title: 'Fresh Delivery', description: 'Eco-friendly packaging, 48hr delivery', icon: '📦' },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-px w-8 bg-brand-green" />
            <span className="text-brand-green font-medium text-sm tracking-wider uppercase">
              Our Process
            </span>
            <div className="h-px w-8 bg-brand-green" />
          </div>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal">
            From Farm to Table
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {processes.map((process, index) => (
            <motion.div
              key={process.step}
              className="relative bg-brand-cream rounded-2xl p-6 hover:shadow-brand-md transition-shadow"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className="absolute -top-3 left-6 px-3 py-1 bg-brand-charcoal text-white text-sm font-medium rounded-full">
                {process.step}
              </div>
              <div className="text-3xl mb-4 mt-2">{process.icon}</div>
              <h3 className="font-display text-lg font-semibold text-brand-charcoal mb-2">
                {process.title}
              </h3>
              <p className="text-brand-muted text-sm">{process.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Loading Screen
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center">
      <div className="w-16 h-16 rounded-full bg-brand-mustard/20 flex items-center justify-center mb-6">
        <Leaf className="w-8 h-8 text-brand-mustard animate-pulse" />
      </div>
      <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-2">Naturelite</h1>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-brand-mustard"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}

// Main Home Page
export default function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [featuredRes, productsRes, categoriesRes] = await Promise.all([
          api.getFeaturedProducts(8),
          api.getProducts({ limit: 12, sortBy: 'totalSold', sortOrder: 'desc' }),
          api.getActiveCategories(),
        ]);

        setFeaturedProducts(featuredRes);
        setBestSellers(productsRes.items);
        setCategories(categoriesRes);
      } catch (error) {
        console.error('Failed to fetch homepage data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <main>
      {/* Trust Banner */}
      <TrustBanner />

      {/* Hero */}
      <HeroSection />

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <FeaturedSection
          title="Featured Products"
          subtitle="Handpicked selections from our organic collection"
          products={featuredProducts}
          categories={categories}
          viewAllLink="/products?featured=true"
        />
      )}

      {/* Categories */}
      {categories.length > 0 && <CategoriesSection categories={categories} />}

      {/* Trust Badges */}
      <TrustBadges variant="default" title="Why Choose Naturelite?" />

      {/* Stats */}
      <StatsSection />

      {/* Best Sellers */}
      {bestSellers.length > 0 && (
        <BestSellersSection products={bestSellers} onQuickView={setQuickViewProduct} />
      )}

      {/* Process */}
      <ProcessSection />

      {/* Testimonials */}
      <Testimonials variant="carousel" />

      {/* Newsletter */}
      <NewsletterSection variant="default" />

      {/* Quick View Modal */}
      <AnimatePresence>
        {quickViewProduct && (
          <QuickViewModal
            product={quickViewProduct}
            isOpen={!!quickViewProduct}
            onClose={() => setQuickViewProduct(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
