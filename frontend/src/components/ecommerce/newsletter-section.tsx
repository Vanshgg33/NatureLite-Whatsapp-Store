'use client';

import { useRef, useState } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { Mail, ArrowRight, Check, Leaf, Sparkles, Gift } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface NewsletterSectionProps {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonText?: string;
  variant?: 'default' | 'minimal' | 'full-width';
  onSubmit?: (email: string) => Promise<void>;
}

export function NewsletterSection({
  title = "Get 10% Off Your First Order",
  subtitle = "Plus exclusive organic recipes & wellness tips delivered weekly. No spam, ever.",
  placeholder = "Enter your email",
  buttonText = "Claim My 10% Off",
  variant = 'default',
  onSubmit,
}: NewsletterSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setStatus('error');
      setErrorMessage('Please enter a valid email address');
      return;
    }

    setStatus('loading');

    try {
      if (onSubmit) {
        await onSubmit(email);
      } else {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      setStatus('success');
      setEmail('');
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    }
  };

  if (variant === 'minimal') {
    return (
      <section ref={sectionRef} className="py-12 bg-brand-cream">
        <div className="max-w-xl mx-auto px-4 sm:px-6">
          <motion.form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <div className="flex-1 relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setStatus('idle');
                }}
                placeholder={placeholder}
                className="w-full pl-12 pr-4 py-3 rounded-full border-brand-border"
                disabled={status === 'loading' || status === 'success'}
              />
            </div>
            <Button
              type="submit"
              disabled={status === 'loading' || status === 'success'}
              variant="brand-dark"
              className="px-6 py-3 hover:bg-brand-green"
            >
              {status === 'loading' ? (
                <motion.div
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              ) : status === 'success' ? (
                <>
                  <Check className="w-5 h-5" />
                  Subscribed!
                </>
              ) : (
                buttonText
              )}
            </Button>
          </motion.form>
        </div>
      </section>
    );
  }

  if (variant === 'full-width') {
    return (
      <section ref={sectionRef} className="relative py-12 sm:py-16 overflow-hidden">
        {/* Background with organic texture */}
        <div className="absolute inset-0 bg-brand-charcoal">
          {/* Decorative pattern */}
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5C30 5 15 20 15 35C15 45 22 55 30 55C38 55 45 45 45 35C45 20 30 5 30 5Z' stroke='white' fill='none' stroke-width='1'/%3E%3C/svg%3E")`,
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        {/* Floating elements */}
        <motion.div
          className="absolute top-20 left-20 text-brand-mustard/20"
          animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Leaf className="w-24 h-24" />
        </motion.div>
        <motion.div
          className="absolute bottom-20 right-20 text-brand-green/20"
          animate={{ y: [0, 20, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Leaf className="w-32 h-32" />
        </motion.div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <Sparkles className="w-10 h-10 text-brand-mustard mx-auto mb-6" />

            <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
              {title}
            </h2>
            <p className="text-white/70 text-lg max-w-xl mx-auto mb-10">
              {subtitle}
            </p>

            <form onSubmit={handleSubmit} className="max-w-md mx-auto">
              <div className="relative">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setStatus('idle');
                  }}
                  placeholder={placeholder}
                  className="w-full px-6 py-4 pr-36 rounded-full bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder:text-white/50 focus:border-brand-mustard"
                  disabled={status === 'loading' || status === 'success'}
                />
                <Button
                  type="submit"
                  disabled={status === 'loading' || status === 'success'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-brand-mustard text-brand-charcoal rounded-full font-medium hover:bg-white"
                >
                  {status === 'loading' ? (
                    <motion.div
                      className="w-5 h-5 border-2 border-brand-charcoal/30 border-t-brand-charcoal rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                  ) : status === 'success' ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <>
                      {buttonText}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>

              <AnimatePresence>
                {status === 'success' && (
                  <motion.p
                    className="text-brand-mustard mt-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    Welcome to the Nature Lite Foods family!
                  </motion.p>
                )}
                {status === 'error' && (
                  <motion.p
                    className="text-brand-error mt-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    {errorMessage}
                  </motion.p>
                )}
              </AnimatePresence>
            </form>

            <p className="text-white/40 text-sm mt-6">
              No spam, unsubscribe anytime. We respect your privacy.
            </p>
          </motion.div>
        </div>
      </section>
    );
  }

  // Default variant
  return (
    <section
      ref={sectionRef}
      className="relative py-20 lg:py-28 overflow-hidden"
    >
      {/* Background with organic pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-cream via-brand-sand/50 to-brand-cream" />

      {/* Decorative circles */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-brand-green/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand-mustard/5 rounded-full translate-x-1/2 translate-y-1/2" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <div className="h-px w-8 bg-brand-mustard" />
              <span className="text-brand-mustard font-medium text-sm tracking-wider uppercase">
                Stay Connected
              </span>
            </div>

            <h2 className="font-display text-3xl lg:text-4xl font-bold text-brand-charcoal mb-4">
              {title}
            </h2>
            <p className="text-brand-muted text-lg mb-8">
              {subtitle}
            </p>

            {/* Benefits */}
            <div className="space-y-4">
              {[
                'Instant 10% discount code on sign-up',
                'Early access to new products',
                'Seasonal organic recipes',
                'Health & wellness tips from experts',
              ].map((benefit, index) => (
                <motion.div
                  key={index}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                >
                  <div className="w-6 h-6 rounded-full bg-brand-green/10 flex items-center justify-center">
                    <Check className="w-4 h-4 text-brand-green" />
                  </div>
                  <span className="text-brand-text">{benefit}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Form Card */}
          <motion.div
            className="bg-white rounded-3xl p-8 lg:p-10 shadow-brand-xl"
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-brand-mustard/10 flex items-center justify-center mx-auto mb-4">
                <Gift className="w-7 h-7 text-brand-mustard" />
              </div>
              <h3 className="font-display text-xl font-semibold text-brand-charcoal">
                Your 10% Welcome Gift Awaits
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="newsletter-email"
                  className="block text-sm font-medium text-brand-charcoal mb-2"
                >
                  Email Address
                </label>
                <Input
                  id="newsletter-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setStatus('idle');
                  }}
                  placeholder={placeholder}
                  className="w-full px-5 py-4 rounded-2xl border-brand-border bg-brand-cream/50 focus:border-brand-charcoal focus:bg-white"
                  disabled={status === 'loading' || status === 'success'}
                />
              </div>

              <motion.button
                type="submit"
                disabled={status === 'loading' || status === 'success'}
                className="w-full py-4 bg-brand-charcoal text-white rounded-2xl font-medium hover:bg-brand-green transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {status === 'loading' ? (
                  <motion.div
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                ) : status === 'success' ? (
                  <>
                    <Check className="w-5 h-5" />
                    Successfully Subscribed!
                  </>
                ) : (
                  <>
                    {buttonText}
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </motion.button>

              <AnimatePresence>
                {status === 'error' && (
                  <motion.p
                    className="text-brand-error text-sm text-center"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    {errorMessage}
                  </motion.p>
                )}
              </AnimatePresence>
            </form>

            <p className="text-brand-muted text-xs text-center mt-6">
              By subscribing, you agree to our Privacy Policy and consent to receive updates.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
