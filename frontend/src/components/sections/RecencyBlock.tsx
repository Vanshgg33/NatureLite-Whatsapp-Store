'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldCheck, RefreshCw, MessageCircle, ArrowRight } from 'lucide-react';

/**
 * Recency block: last thing before footer (psychology — they remember this).
 * Strong CTA + trust line to close the page.
 */
export default function RecencyBlock() {
  return (
    <section className="relative py-14 sm:py-18 bg-brand-charcoal text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.h2
          className="font-display text-2xl sm:text-3xl font-bold mb-2"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Shop with confidence
        </motion.h2>
        <motion.p
          className="text-white/70 text-sm sm:text-base mb-8 max-w-xl mx-auto"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Free returns · Secure payment · WhatsApp support
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <span className="inline-flex items-center gap-2 text-white/80 text-sm">
            <ShieldCheck className="w-4 h-4 text-brand-mustard" />
            Secure
          </span>
          <span className="inline-flex items-center gap-2 text-white/80 text-sm">
            <RefreshCw className="w-4 h-4 text-brand-mustard" />
            Free returns
          </span>
          <a
            href="https://wa.me/919999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-white/80 text-sm hover:text-brand-mustard transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </a>
        </motion.div>
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-mustard text-white font-semibold rounded-full hover:opacity-90 transition-opacity"
          >
            See all products
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
