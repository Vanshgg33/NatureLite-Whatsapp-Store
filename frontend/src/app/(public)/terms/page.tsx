import { Metadata } from 'next';
import { FadeUp } from '@/components/motion/fade-in-view';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms and conditions for using the Purity Foods website and purchasing our products.',
};

const sections = [
  {
    title: '1. Acceptance of Terms',
    content: 'By accessing and using the Purity Foods website, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please do not use our website.',
  },
  {
    title: '2. Products & Pricing',
    content: 'All product descriptions, images, and prices on our website are as accurate as possible. However, we reserve the right to correct any errors. Prices are in Indian Rupees (INR) and include applicable GST unless stated otherwise. We reserve the right to change prices at any time without prior notice.',
  },
  {
    title: '3. Orders & Payment',
    content: 'By placing an order, you are making an offer to purchase. We reserve the right to refuse or cancel any order for reasons including product availability, pricing errors, or suspected fraud. Payment must be made at the time of order (for online payments) or at delivery (for COD). All online payments are processed securely through Razorpay.',
  },
  {
    title: '4. Shipping & Delivery',
    content: 'We aim to deliver all orders within the estimated timeframe. However, delivery dates are approximate and not guaranteed. We are not liable for delays caused by shipping carriers, natural disasters, or other circumstances beyond our control. Risk of loss transfers to you upon delivery.',
  },
  {
    title: '5. Returns & Refunds',
    content: 'Returns are accepted within 7 days of delivery for unopened products in original packaging. Damaged or incorrect products will be replaced free of charge. Opened food products cannot be returned for hygiene reasons. Refunds are processed within 5-7 business days to the original payment method. Please refer to our Returns Policy for full details.',
  },
  {
    title: '6. User Accounts',
    content: 'You are responsible for maintaining the confidentiality of your account credentials. You agree to provide accurate information during registration and keep it updated. We reserve the right to suspend or terminate accounts that violate these terms or engage in fraudulent activity.',
  },
  {
    title: '7. Intellectual Property',
    content: 'All content on this website, including text, images, logos, and designs, is the property of Purity Foods and is protected by copyright laws. You may not reproduce, distribute, or use any content without our written permission.',
  },
  {
    title: '8. Limitation of Liability',
    content: 'Purity Foods shall not be liable for any indirect, incidental, or consequential damages arising from the use of our website or products. Our total liability shall not exceed the amount paid for the specific product in question.',
  },
  {
    title: '9. Changes to Terms',
    content: 'We may update these terms from time to time. Continued use of our website after changes are posted constitutes acceptance of the revised terms. We encourage you to review this page periodically.',
  },
  {
    title: '10. Contact',
    content: 'For questions about these terms, contact us at naturelitefoods@gmail.com or call +91 88172 00740.',
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <section className="py-16 lg:py-24">
        <div className="brand-container">
          <FadeUp>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h1 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal mb-4">
                Terms of Service
              </h1>
              <p className="font-body text-lg text-brand-muted">
                Last updated: February 2026
              </p>
            </div>
          </FadeUp>

          <div className="max-w-3xl mx-auto">
            <FadeUp delay={0.1}>
              <div className="bg-white rounded-2xl p-8 shadow-brand-sm">
                <div className="space-y-6">
                  {sections.map((section) => (
                    <div key={section.title}>
                      <h2 className="font-display text-lg font-semibold text-brand-charcoal mb-2">
                        {section.title}
                      </h2>
                      <p className="font-body text-sm text-brand-muted leading-relaxed">
                        {section.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>
    </div>
  );
}
