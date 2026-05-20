import { Metadata } from 'next';
import { FadeUp } from '@/components/motion/fade-in-view';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Purity Foods collects, uses, and protects your personal information.',
};

const sections = [
  {
    title: 'Information We Collect',
    content: `When you visit our website or place an order, we collect the following information:

- **Personal Information**: Name, email address, phone number, and shipping address provided during registration or checkout.
- **Payment Information**: Payment details are processed securely through Razorpay and are never stored on our servers.
- **Usage Data**: We collect anonymous data about how you interact with our website to improve your experience.
- **Communication Data**: Messages sent through our contact form or WhatsApp are stored to provide better customer support.`,
  },
  {
    title: 'How We Use Your Information',
    content: `Your information is used for the following purposes:

- Processing and fulfilling your orders
- Sending order confirmations, shipping updates, and delivery notifications via email and WhatsApp
- Responding to your customer service requests
- Improving our website and product offerings
- Sending promotional emails (only with your consent, and you can unsubscribe at any time)`,
  },
  {
    title: 'Information Sharing',
    content: `We do not sell or rent your personal information. We only share your data with:

- **Shipping Partners**: Your name, address, and phone number are shared with our courier partners for delivery.
- **Payment Processors**: Razorpay processes your payment information securely under their own privacy policy.
- **Legal Requirements**: We may disclose information if required by law or to protect our legal rights.`,
  },
  {
    title: 'Data Security',
    content: `We implement industry-standard security measures to protect your data:

- All data transmission is encrypted using SSL/TLS
- Payment processing is PCI-DSS compliant through Razorpay
- Access to personal data is restricted to authorized personnel only
- We regularly review and update our security practices`,
  },
  {
    title: 'Your Rights',
    content: `You have the right to:

- Access the personal data we hold about you
- Request correction of inaccurate information
- Request deletion of your account and associated data
- Opt out of marketing communications at any time
- Contact us with any privacy-related concerns`,
  },
  {
    title: 'Contact Us',
    content: `If you have questions about this privacy policy, please contact us at:

- **Email**: hello@naturelite.in
- **Phone**: +91 99999 99999
- **Address**: Jaipur, Rajasthan, India 302001`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <section className="py-16 lg:py-24">
        <div className="brand-container">
          <FadeUp>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h1 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal mb-4">
                Privacy Policy
              </h1>
              <p className="font-body text-lg text-brand-muted">
                Last updated: February 2026
              </p>
            </div>
          </FadeUp>

          <div className="max-w-3xl mx-auto">
            <FadeUp delay={0.1}>
              <div className="bg-white rounded-2xl p-8 shadow-brand-sm">
                <p className="font-body text-brand-muted leading-relaxed mb-8">
                  At Purity Foods, we are committed to protecting your privacy. This policy
                  explains how we collect, use, and safeguard your personal information when
                  you use our website and services.
                </p>

                <div className="space-y-8">
                  {sections.map((section) => (
                    <div key={section.title}>
                      <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-3">
                        {section.title}
                      </h2>
                      <div
                        className="font-body text-sm text-brand-muted leading-relaxed prose prose-brand max-w-none whitespace-pre-line"
                      >
                        {section.content}
                      </div>
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
