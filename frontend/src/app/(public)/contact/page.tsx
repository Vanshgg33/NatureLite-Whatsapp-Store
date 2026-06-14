'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Mail,
  Phone,
  MapPin,
  MessageCircle,
  Send,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const contactSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  subject: z.string().min(5, 'Subject is required'),
  message: z.string().min(20, 'Message must be at least 20 characters'),
});

type ContactFormData = z.infer<typeof contactSchema>;

const STORE_WHATSAPP = '918817200740';
const STORE_PHONE_DISPLAY = '+91 88172 00740';

const contactInfo = [
  {
    icon: Phone,
    title: 'Phone',
    value: STORE_PHONE_DISPLAY,
    href: `tel:+${STORE_WHATSAPP}`,
    description: 'Mon-Sat, 9am-6pm IST',
  },
  {
    icon: Mail,
    title: 'Email',
    value: 'hello@naturelite.in',
    href: 'mailto:hello@naturelite.in',
    description: 'We reply within 24 hours',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp',
    value: STORE_PHONE_DISPLAY,
    href: `https://wa.me/${STORE_WHATSAPP}`,
    description: 'Quick responses',
  },
  {
    icon: MapPin,
    title: 'Address',
    value: 'Jaipur, Rajasthan',
    href: '#',
    description: 'India 302001',
  },
];

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    try {
      const lines = [
        `*New Contact Form Inquiry*`,
        ``,
        `*Name:* ${data.name}`,
        `*Email:* ${data.email}`,
        ...(data.phone ? [`*Phone:* ${data.phone}`] : []),
        `*Subject:* ${data.subject}`,
        ``,
        `*Message:*`,
        data.message,
      ];
      const waText = encodeURIComponent(lines.join('\n'));
      window.open(`https://wa.me/${STORE_WHATSAPP}?text=${waText}`, '_blank');

      setIsSubmitted(true);
      reset();
      toast({
        title: 'Opening WhatsApp…',
        description: "Your message is pre-filled — just hit Send.",
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to open WhatsApp. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      {/* Hero Section */}
      <section className="py-16 lg:py-24">
        <div className="brand-container">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-brand-charcoal mb-4">
              Get in Touch
            </h1>
            <p className="font-body text-lg text-brand-muted">
              Have questions about our products or need assistance? We&apos;re here to
              help.
            </p>
          </motion.div>

          {/* Contact Info Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {contactInfo.map((info, index) => (
              <motion.a
                key={info.title}
                href={info.href}
                target={info.href.startsWith('http') ? '_blank' : undefined}
                rel={info.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="bg-white rounded-2xl p-6 shadow-brand-sm hover:shadow-brand-md transition-shadow text-center group"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * index }}
              >
                <div className="w-14 h-14 mx-auto rounded-xl bg-brand-mustard/10 flex items-center justify-center mb-4 group-hover:bg-brand-mustard/20 transition-colors">
                  <info.icon className="w-6 h-6 text-brand-mustard" />
                </div>
                <h3 className="font-display text-lg font-semibold text-brand-charcoal mb-1">
                  {info.title}
                </h3>
                <p className="font-body text-brand-charcoal font-medium">
                  {info.value}
                </p>
                <p className="font-body text-sm text-brand-muted mt-1">
                  {info.description}
                </p>
              </motion.a>
            ))}
          </div>

          {/* Contact Form */}
          <div className="grid lg:grid-cols-5 gap-8">
            <motion.div
              className="lg:col-span-3 bg-white rounded-2xl p-8 shadow-brand-sm"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="font-display text-2xl font-semibold text-brand-charcoal mb-6">
                Send us a message
              </h2>

              {isSubmitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto rounded-full bg-brand-green/10 flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-brand-green" />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
                    Thank you!
                  </h3>
                  <p className="font-body text-brand-muted mb-6">
                    Your message has been sent. We&apos;ll get back to you soon.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setIsSubmitted(false)}
                    className="border-brand-charcoal"
                  >
                    Send another message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-body text-sm text-brand-text mb-1.5 block">
                        Name *
                      </label>
                      <Input
                        {...register('name')}
                        className={cn(errors.name && 'border-brand-error')}
                        placeholder="Your name"
                      />
                      {errors.name && (
                        <p className="text-xs text-brand-error mt-1">
                          {errors.name.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="font-body text-sm text-brand-text mb-1.5 block">
                        Email *
                      </label>
                      <Input
                        type="email"
                        {...register('email')}
                        className={cn(errors.email && 'border-brand-error')}
                        placeholder="you@example.com"
                      />
                      {errors.email && (
                        <p className="text-xs text-brand-error mt-1">
                          {errors.email.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-body text-sm text-brand-text mb-1.5 block">
                        Phone (Optional)
                      </label>
                      <Input {...register('phone')} placeholder="+91 99999 99999" />
                    </div>
                    <div>
                      <label className="font-body text-sm text-brand-text mb-1.5 block">
                        Subject *
                      </label>
                      <Input
                        {...register('subject')}
                        className={cn(errors.subject && 'border-brand-error')}
                        placeholder="How can we help?"
                      />
                      {errors.subject && (
                        <p className="text-xs text-brand-error mt-1">
                          {errors.subject.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      Message *
                    </label>
                    <textarea
                      {...register('message')}
                      className={cn(
                        'w-full min-h-[150px] px-4 py-3 rounded-xl border bg-background font-body text-brand-charcoal resize-none',
                        errors.message ? 'border-brand-error' : 'border-input'
                      )}
                      placeholder="Tell us more about your inquiry..."
                    />
                    {errors.message && (
                      <p className="text-xs text-brand-error mt-1">
                        {errors.message.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full sm:w-auto bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-xl px-8"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      'Sending...'
                    ) : (
                      <>
                        Send Message
                        <Send className="ml-2 w-4 h-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}
            </motion.div>

            {/* FAQ Section */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="bg-brand-brown rounded-2xl p-8 text-brand-cream">
                <h2 className="font-display text-2xl font-semibold mb-6">
                  Quick Answers
                </h2>
                <div className="space-y-6">
                  {[
                    {
                      q: 'How long does shipping take?',
                      a: 'We ship within 2-3 business days. Delivery typically takes 5-7 days pan-India.',
                    },
                    {
                      q: 'Do you offer returns?',
                      a: "Yes, we have a 30-day return policy for unopened products. Contact us if you're not satisfied.",
                    },
                    {
                      q: 'Are your products organic?',
                      a: 'We source from certified organic farms. All products are 100% natural with no additives.',
                    },
                    {
                      q: 'How should I store the oil?',
                      a: 'Store in a cool, dark place away from direct sunlight. Use within 6 months of opening.',
                    },
                  ].map((faq, i) => (
                    <div key={i}>
                      <h4 className="font-display font-semibold mb-2">{faq.q}</h4>
                      <p className="font-body text-sm text-brand-cream/70">{faq.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
