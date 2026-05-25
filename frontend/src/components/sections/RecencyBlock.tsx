'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldCheck, MessageCircle, ArrowRight } from 'lucide-react';

const WHATSAPP_QUICK_ORDER_URL =
  `https://wa.me/918817200740?text=${encodeURIComponent('Hi! I\'d like to place an order from Nature Lite Foods. Can you help me?')}`;

export default function RecencyBlock() {
  return (
    <section
      className="relative py-8 sm:py-10 overflow-hidden"
      style={{ background: 'linear-gradient(160deg,#040e02 0%,#0d2c07 100%)' }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          top: '-30%', left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 500,
          background: 'radial-gradient(ellipse,rgba(160,112,16,0.10) 0%,transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          opacity: 0.4, mixBlendMode: 'overlay',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.p
          style={{ fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(184,138,20,0.65)', fontFamily: 'monospace', marginBottom: 12 }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Our Promise
        </motion.p>
        <motion.h2
          className="font-display text-2xl sm:text-3xl font-bold mb-3"
          style={{ color: '#fff', letterSpacing: '-0.02em' }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          Shop with Confidence
        </motion.h2>
        <motion.p
          className="text-sm sm:text-base mb-10 max-w-xl mx-auto"
          style={{ color: 'rgba(255,255,255,0.48)', lineHeight: 1.65 }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Secure payment · WhatsApp support
        </motion.p>

        {/* Trust pills */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mb-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.18 }}
        >
          {[
            { Icon: ShieldCheck, label: 'FSSAI Certified' },
            { Icon: MessageCircle, label: 'WhatsApp Support' },
          ].map(({ Icon, label }) => (
            <div
              key={label}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)', fontSize: 13 }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: '#b88a14' }} />
              {label}
            </div>
          ))}
        </motion.div>

        {/* CTAs */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.26 }}
        >
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: '#a07010', color: '#fff', boxShadow: '0 4px 24px -4px rgba(160,112,16,0.55)', fontSize: 14 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#7a5408'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#a07010'; }}
          >
            See All Products
            <ArrowRight className="w-4 h-4" />
          </Link>

          <a
            href={WHATSAPP_QUICK_ORDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: '#25D366', color: '#fff', boxShadow: '0 4px 24px -4px rgba(37,211,102,0.40)', fontSize: 14 }}
          >
            <MessageCircle className="w-4 h-4" />
            Quick Order via WhatsApp
          </a>
        </motion.div>
      </div>
    </section>
  );
}
