'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { Star, Quote, ChevronLeft, ChevronRight, Leaf, BadgeCheck } from 'lucide-react';

interface Testimonial {
  id: string;
  name: string;
  location: string;
  avatar?: string;
  rating: number;
  text: string;
  productName?: string;
  date?: string;
  verified?: boolean;
}

const defaultTestimonials: Testimonial[] = [
  {
    id: '1',
    name: 'Priya Sharma',
    location: 'Mumbai',
    rating: 5,
    text: "Switched to NatureLite's wood-pressed oils 6 months ago — my cholesterol dropped 20 points and my skin has never looked better. The cold-pressed groundnut oil tastes exactly like what my grandmother used to make.",
    productName: 'Wood-Pressed Groundnut Oil',
    date: '2 weeks ago',
    verified: true,
  },
  {
    id: '2',
    name: 'Rahul Verma',
    location: 'Delhi',
    rating: 5,
    text: "My 4-year-old used to refuse vegetables. Started cooking with their A2 Bilona Ghee and he now asks for seconds! The aroma is incredible — you can actually taste the difference from store-bought ghee.",
    productName: 'A2 Bilona Ghee',
    date: '1 month ago',
    verified: true,
  },
  {
    id: '3',
    name: 'Anita Patel',
    location: 'Bangalore',
    rating: 5,
    text: "After switching to NatureLite's organic turmeric and honey, my seasonal allergies have reduced dramatically. As a nutritionist, I now recommend them to all my clients. The purity is unmatched.",
    productName: 'Organic Turmeric & Honey',
    date: '3 weeks ago',
    verified: true,
  },
  {
    id: '4',
    name: 'Vikram Singh',
    location: 'Jaipur',
    rating: 5,
    text: "Ordered the immunity combo pack during monsoon season. My entire family of 5 got through without a single sick day — that's a first! Already on my 4th reorder. The quality is consistently outstanding.",
    productName: 'Immunity Combo Pack',
    date: '1 week ago',
    verified: true,
  },
];

interface TestimonialsProps {
  testimonials?: Testimonial[];
  variant?: 'carousel' | 'grid' | 'featured';
  title?: string;
  subtitle?: string;
  autoPlay?: boolean;
  autoPlayInterval?: number;
}

export function Testimonials({
  testimonials = defaultTestimonials,
  variant = 'carousel',
  title = "What Our Customers Say",
  subtitle = "Real stories from our organic food community",
  autoPlay = false,
  autoPlayInterval = 8000,
}: TestimonialsProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(autoPlay);

  useEffect(() => {
    if (!isAutoPlaying || variant !== 'carousel') return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [isAutoPlaying, autoPlayInterval, testimonials.length, variant]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const nextSlide = () => goToSlide((currentIndex + 1) % testimonials.length);
  const prevSlide = () => goToSlide((currentIndex - 1 + testimonials.length) % testimonials.length);

  const renderStars = (rating: number) => (
    <div className="flex gap-1">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < rating
              ? 'fill-brand-mustard text-brand-mustard'
              : 'text-brand-border'
          }`}
        />
      ))}
    </div>
  );

  if (variant === 'grid') {
    return (
      <section ref={sectionRef} className="py-20 lg:py-28 bg-brand-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal mb-4">
              {title}
            </h2>
            <p className="text-brand-muted max-w-xl mx-auto">{subtitle}</p>
          </motion.div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.id}
                className="bg-white rounded-3xl p-8 shadow-brand-md"
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                {/* Quote icon */}
                <Quote className="w-10 h-10 text-brand-mustard/20 mb-4" />

                {/* Text */}
                <p className="text-brand-text leading-relaxed mb-6">
                  "{testimonial.text}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-brand-cream overflow-hidden">
                    {testimonial.avatar ? (
                      <Image
                        src={testimonial.avatar}
                        alt={testimonial.name}
                        width={48}
                        height={48}
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-brand-charcoal font-semibold">
                        {testimonial.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-brand-charcoal">
                        {testimonial.name}
                      </span>
                      {testimonial.verified && (
                        <span className="inline-flex items-center gap-1 text-xs text-brand-green font-medium">
                          <BadgeCheck className="w-3.5 h-3.5" /> Verified
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-brand-muted">
                      {testimonial.location}
                    </div>
                  </div>
                  {renderStars(testimonial.rating)}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (variant === 'featured') {
    const featured = testimonials[currentIndex];
    return (
      <section
        ref={sectionRef}
        className="relative py-24 lg:py-32 overflow-hidden"
      >
        {/* Background decorations */}
        <div className="absolute inset-0 bg-gradient-to-b from-white via-brand-cream/50 to-white" />
        <div className="absolute top-10 left-10 text-brand-green/5">
          <Leaf className="w-64 h-64" />
        </div>
        <div className="absolute bottom-10 right-10 text-brand-mustard/5 rotate-180">
          <Leaf className="w-48 h-48" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Header */}
          <motion.div
            className="mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal mb-4">
              {title}
            </h2>
          </motion.div>

          {/* Featured testimonial */}
          <AnimatePresence mode="wait">
            <motion.div
              key={featured.id}
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              {/* Large quote */}
              <Quote className="w-16 h-16 text-brand-mustard/30 mx-auto mb-8" />

              {/* Text */}
              <p className="text-xl lg:text-2xl text-brand-text leading-relaxed mb-10 font-body">
                "{featured.text}"
              </p>

              {/* Author */}
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-brand-cream overflow-hidden ring-4 ring-brand-mustard/20">
                  {featured.avatar ? (
                    <Image
                      src={featured.avatar}
                      alt={featured.name}
                      width={64}
                      height={64}
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-semibold text-brand-charcoal">
                      {featured.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-display text-lg font-semibold text-brand-charcoal">
                      {featured.name}
                    </span>
                    {featured.verified && (
                      <span className="inline-flex items-center gap-1 text-xs text-brand-green font-medium">
                        <BadgeCheck className="w-3.5 h-3.5" /> Verified
                      </span>
                    )}
                  </div>
                  <div className="text-brand-muted">{featured.location}</div>
                </div>
                <div className="flex gap-1">
                  {renderStars(featured.rating)}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 mt-12">
            <button
              onClick={prevSlide}
              className="w-10 h-10 rounded-full bg-white shadow-brand-sm flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-all duration-300"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentIndex
                      ? 'bg-brand-charcoal w-8'
                      : 'bg-brand-border hover:bg-brand-muted'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={nextSlide}
              className="w-10 h-10 rounded-full bg-white shadow-brand-sm flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-all duration-300"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Default carousel variant
  return (
    <section ref={sectionRef} className="py-20 lg:py-28 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal mb-4">
            {title}
          </h2>
          <p className="text-brand-muted max-w-xl mx-auto">{subtitle}</p>
        </motion.div>

        {/* Carousel */}
        <div className="relative">
          <div className="overflow-hidden">
            <motion.div
              className="flex"
              animate={{ x: `-${currentIndex * 100}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {testimonials.map((testimonial) => (
                <div
                  key={testimonial.id}
                  className="w-full flex-shrink-0 px-4"
                >
                  <div className="max-w-3xl mx-auto bg-brand-cream rounded-3xl p-8 lg:p-12">
                    <div className="flex flex-col lg:flex-row gap-8 items-center">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <div className="w-24 h-24 rounded-full bg-white overflow-hidden shadow-brand-md">
                          {testimonial.avatar ? (
                            <Image
                              src={testimonial.avatar}
                              alt={testimonial.name}
                              width={96}
                              height={96}
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-3xl font-semibold text-brand-charcoal">
                              {testimonial.name.charAt(0)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 text-center lg:text-left">
                        {renderStars(testimonial.rating)}
                        <p className="text-lg text-brand-text leading-relaxed mt-4 mb-6">
                          "{testimonial.text}"
                        </p>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-brand-charcoal">
                              {testimonial.name}
                            </span>
                            {testimonial.verified && (
                              <span className="inline-flex items-center gap-1 text-xs text-brand-green font-medium">
                                <BadgeCheck className="w-3.5 h-3.5" /> Verified
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-brand-muted">
                            {testimonial.location}
                            {testimonial.productName && (
                              <span> · Purchased {testimonial.productName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-brand-lg flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-all duration-300 -translate-x-2 lg:-translate-x-6"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            onClick={nextSlide}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-brand-lg flex items-center justify-center text-brand-charcoal hover:bg-brand-charcoal hover:text-white transition-all duration-300 translate-x-2 lg:translate-x-6"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-brand-charcoal w-8'
                  : 'bg-brand-border hover:bg-brand-muted'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
