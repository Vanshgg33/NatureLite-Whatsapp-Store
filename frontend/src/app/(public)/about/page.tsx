import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Leaf, Heart, Users, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FadeUp, FadeIn } from '@/components/motion/fade-in-view';
import { TimelineSection } from '@/components/story/timeline-section';

export const metadata: Metadata = {
  title: 'Our Story',
  description:
    'Learn about Naturelite - our mission to bring traditional, pure food products to your kitchen.',
};

const values = [
  {
    icon: Leaf,
    title: 'Pure & Natural',
    description:
      'No additives, no preservatives. Just pure, natural ingredients the way nature intended.',
  },
  {
    icon: Heart,
    title: 'Made with Care',
    description:
      'Every product is crafted with love and attention to detail, honoring centuries-old traditions.',
  },
  {
    icon: Users,
    title: 'Community First',
    description:
      'We work directly with farming communities, ensuring fair practices and sustainable livelihoods.',
  },
  {
    icon: Award,
    title: 'Quality Assured',
    description:
      'Every batch is tested for purity and quality, meeting the highest standards.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      {/* Hero Section */}
      <section className="relative py-24 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-brown/10 to-transparent" />
        <div className="brand-container relative">
          <FadeUp>
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-block px-4 py-1.5 mb-4 text-sm font-body tracking-wider text-brand-brown bg-brand-brown/10 rounded-full">
                Our Story
              </span>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-brand-charcoal mb-6">
                Bringing Tradition Back to Your Kitchen
              </h1>
              <p className="font-body text-xl text-brand-muted leading-relaxed">
                We started Naturelite with a simple belief: food should be as pure as
                nature intended. No shortcuts, no compromises, just authentic taste.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="brand-container">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <FadeUp>
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-brand-sand via-brand-cream to-brand-sand">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-6 mb-6">
                      <div className="w-20 h-20 rounded-2xl bg-brand-green/10 flex items-center justify-center">
                        <Leaf className="w-10 h-10 text-brand-green" />
                      </div>
                      <div className="w-20 h-20 rounded-2xl bg-brand-mustard/10 flex items-center justify-center">
                        <Heart className="w-10 h-10 text-brand-mustard" />
                      </div>
                    </div>
                    <h3 className="font-display text-3xl font-bold text-brand-charcoal mb-2">
                      Naturelite
                    </h3>
                    <p className="font-body text-brand-muted text-lg">
                      Pure by Nature, Crafted with Care
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-6">
                      <div className="px-4 py-2 bg-white/80 rounded-full shadow-sm">
                        <span className="font-body text-sm text-brand-green font-medium">100% Organic</span>
                      </div>
                      <div className="px-4 py-2 bg-white/80 rounded-full shadow-sm">
                        <span className="font-body text-sm text-brand-brown font-medium">Since 2020</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FadeUp>
            <FadeUp delay={0.1}>
              <div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-brand-charcoal mb-6">
                  Our Mission
                </h2>
                <div className="space-y-4 font-body text-lg text-brand-text leading-relaxed">
                  <p>
                    In a world of processed and refined foods, we saw a need to return to
                    our roots. The oils and ghee our grandparents used weren&apos;t just
                    ingredients—they were carriers of tradition, health, and flavor.
                  </p>
                  <p>
                    We source directly from farmers who still follow traditional
                    practices. Our wood-pressed oils are extracted slowly, at low
                    temperatures, preserving every nutrient. Our bilona ghee is churned
                    from curd, not cream, just as it was done for centuries.
                  </p>
                  <p>
                    When you choose Naturelite, you&apos;re not just buying a product.
                    You&apos;re supporting sustainable farming, preserving traditional
                    knowledge, and bringing genuine purity to your family&apos;s meals.
                  </p>
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 lg:py-24 bg-brand-sand">
        <div className="brand-container">
          <FadeUp>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-brand-charcoal mb-4">
                What We Stand For
              </h2>
              <p className="font-body text-lg text-brand-muted">
                Our values guide everything we do, from sourcing to delivery.
              </p>
            </div>
          </FadeUp>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <FadeUp key={value.title} delay={0.1 * index}>
                <div className="bg-white rounded-2xl p-6 shadow-brand-sm h-full">
                  <div className="w-14 h-14 rounded-xl bg-brand-mustard/10 flex items-center justify-center mb-4">
                    <value.icon className="w-7 h-7 text-brand-mustard" />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
                    {value.title}
                  </h3>
                  <p className="font-body text-brand-muted leading-relaxed">
                    {value.description}
                  </p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <TimelineSection />

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-brand-brown">
        <div className="brand-container">
          <FadeIn>
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-brand-cream mb-6">
                Experience the Difference
              </h2>
              <p className="font-body text-lg text-brand-cream/80 mb-8">
                Ready to taste tradition? Explore our collection of pure, wood-pressed
                oils and authentic bilona ghee.
              </p>
              <Link href="/products">
                <Button
                  size="lg"
                  className="bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-full px-8"
                >
                  Shop Our Products
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
