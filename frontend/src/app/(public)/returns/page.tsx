import { Metadata } from 'next';
import { RotateCcw, Clock, CheckCircle, AlertTriangle, Mail, Phone } from 'lucide-react';
import { FadeUp } from '@/components/motion/fade-in-view';

export const metadata: Metadata = {
  title: 'Returns & Refunds',
  description: 'Our hassle-free return and refund policy for all Naturelite products.',
};

const policies = [
  {
    icon: Clock,
    title: '7-Day Return Window',
    description: 'You can request a return within 7 days of delivery for unopened products in their original packaging.',
  },
  {
    icon: CheckCircle,
    title: 'Quality Guarantee',
    description: 'If you receive a damaged or incorrect product, we will replace it immediately at no extra cost.',
  },
  {
    icon: RotateCcw,
    title: 'Refund Process',
    description: 'Refunds are initiated within 2-3 business days of receiving the returned product. Amount is credited to the original payment method within 5-7 days.',
  },
  {
    icon: AlertTriangle,
    title: 'Non-Returnable Items',
    description: 'Opened food products, perishable items, and products with broken seals cannot be returned for hygiene reasons.',
  },
];

export default function ReturnsPage() {
  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <section className="py-16 lg:py-24">
        <div className="brand-container">
          <FadeUp>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h1 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal mb-4">
                Returns & Refunds
              </h1>
              <p className="font-body text-lg text-brand-muted">
                We want you to be completely satisfied with your purchase.
              </p>
            </div>
          </FadeUp>

          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
            {policies.map((item, index) => (
              <FadeUp key={item.title} delay={0.05 * index}>
                <div className="bg-white rounded-2xl p-6 shadow-brand-sm h-full">
                  <div className="w-12 h-12 rounded-xl bg-brand-mustard/10 flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-brand-mustard" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-brand-charcoal mb-2">
                    {item.title}
                  </h3>
                  <p className="font-body text-sm text-brand-muted leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </FadeUp>
            ))}
          </div>

          <FadeUp delay={0.2}>
            <div className="bg-brand-brown rounded-2xl p-8 text-center max-w-2xl mx-auto">
              <h2 className="font-display text-xl font-semibold text-brand-cream mb-3">
                Need to Return Something?
              </h2>
              <p className="font-body text-brand-cream/70 mb-4">
                Contact our support team and we&apos;ll guide you through the process.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="mailto:hello@naturelite.in"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-mustard text-white rounded-full font-body font-medium hover:bg-brand-mustard-dark transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  hello@naturelite.in
                </a>
                <a
                  href="tel:+919999999999"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-brand-cream rounded-full font-body font-medium hover:bg-white/20 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  +91 99999 99999
                </a>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </div>
  );
}
