import { Metadata } from 'next';
import { Truck, Clock, MapPin, Package, IndianRupee, ShieldCheck } from 'lucide-react';
import { FadeUp } from '@/components/motion/fade-in-view';

export const metadata: Metadata = {
  title: 'Shipping Policy',
  description: 'Learn about our shipping methods, delivery times, and free shipping policy.',
};

const shippingInfo = [
  {
    icon: Clock,
    title: 'Processing Time',
    description: 'Orders are processed within 1-2 business days. You will receive updates by email and WhatsApp as your order moves to out for delivery.',
  },
  {
    icon: Truck,
    title: 'Delivery Time',
    description: 'Standard delivery takes 5-7 business days across India. Metro cities may receive orders within 3-5 days.',
  },
  {
    icon: IndianRupee,
    title: 'Free Shipping',
    description: 'Enjoy free shipping on all orders above ₹999. Orders below this amount will have a flat shipping charge of ₹50.',
  },
  {
    icon: MapPin,
    title: 'Delivery Coverage',
    description: 'We deliver pan-India to all serviceable pin codes. Remote areas may take 2-3 additional days.',
  },
  {
    icon: Package,
    title: 'Packaging',
    description: 'All products are carefully packed in eco-friendly, leak-proof packaging to ensure they reach you in perfect condition.',
  },
  {
    icon: ShieldCheck,
    title: 'Order Tracking',
    description: 'When your order is out for delivery, you may receive an AWB number and tracking link via email and WhatsApp when applicable.',
  },
];

export default function ShippingPage() {
  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <section className="py-16 lg:py-24">
        <div className="brand-container">
          <FadeUp>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h1 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal mb-4">
                Shipping Policy
              </h1>
              <p className="font-body text-lg text-brand-muted">
                We ensure your products reach you fresh and on time.
              </p>
            </div>
          </FadeUp>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {shippingInfo.map((item, index) => (
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
        </div>
      </section>
    </div>
  );
}
