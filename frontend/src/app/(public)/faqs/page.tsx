'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const faqs = [
  {
    category: 'Products',
    items: [
      {
        q: 'Are your products 100% organic?',
        a: 'Yes, all our products are sourced from certified organic farms. We never use chemicals, additives, or preservatives in any of our products.',
      },
      {
        q: 'What is wood-pressed / cold-pressed oil?',
        a: 'Wood-pressed oils are extracted using traditional wooden churners (ghani) at low temperatures. This preserves the natural nutrients, flavor, and aroma of the oil, unlike refined oils that use heat and chemicals.',
      },
      {
        q: 'What is Bilona ghee?',
        a: 'Bilona ghee is made using the traditional method where curd (not cream) is churned to extract butter, which is then slowly heated to make ghee. This process is more time-consuming but produces superior quality ghee.',
      },
      {
        q: 'How should I store the products?',
        a: 'Store oils and ghee in a cool, dark place away from direct sunlight. Keep the lid tightly closed after use. Products should be used within 6 months of opening for best quality.',
      },
    ],
  },
  {
    category: 'Orders & Shipping',
    items: [
      {
        q: 'How long does delivery take?',
        a: 'Standard delivery takes 5-7 business days pan-India. Metro cities typically receive orders within 3-5 days. You can track your order using the tracking link sent via email.',
      },
      {
        q: 'Is there free shipping?',
        a: 'Yes! We offer free shipping on all orders above ₹999. For orders below this amount, a flat shipping charge of ₹50 applies.',
      },
      {
        q: 'Can I track my order?',
        a: 'Yes, once your order is shipped, you will receive an AWB tracking number and a tracking link via email and WhatsApp. You can also track orders from your account dashboard.',
      },
      {
        q: 'Do you deliver internationally?',
        a: 'Currently, we only deliver within India. We are working on expanding our delivery to other countries soon.',
      },
    ],
  },
  {
    category: 'Returns & Payments',
    items: [
      {
        q: 'What is your return policy?',
        a: 'We accept returns within 7 days of delivery for unopened products. If you receive a damaged or incorrect product, we will replace it immediately. Please visit our Returns page for full details.',
      },
      {
        q: 'What payment methods do you accept?',
        a: 'We accept Cash on Delivery (COD), UPI (Google Pay, PhonePe, etc.), and Credit/Debit Cards (Visa, Mastercard, RuPay) through our secure Razorpay payment gateway.',
      },
      {
        q: 'How long do refunds take?',
        a: 'Refunds are initiated within 2-3 business days of receiving the returned product. The amount is credited to your original payment method within 5-7 business days.',
      },
    ],
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-brand-border last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-5 text-left"
      >
        <span className="font-display font-medium text-brand-charcoal pr-4">
          {question}
        </span>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-brand-muted flex-shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="font-body text-sm text-brand-muted leading-relaxed pb-5">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqsPage() {
  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <section className="py-16 lg:py-24">
        <div className="brand-container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal mb-4">
              Frequently Asked Questions
            </h1>
            <p className="font-body text-lg text-brand-muted">
              Find answers to common questions about our products, shipping, and more.
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-8">
            {faqs.map((section) => (
              <div key={section.category}>
                <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-4">
                  {section.category}
                </h2>
                <div className="bg-white rounded-2xl shadow-brand-sm px-6">
                  {section.items.map((faq) => (
                    <FaqItem
                      key={faq.q}
                      question={faq.q}
                      answer={faq.a}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
