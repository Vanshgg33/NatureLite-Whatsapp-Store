'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Instagram, Facebook, Youtube, ShieldCheck, Leaf, CreditCard, ArrowRight, Mail } from 'lucide-react';

const FOOTER_BG = '#061703';

const links = {
  shop: [
    { name: 'All Products',       href: '/products'                         },
    { name: 'Cold-Pressed Oils',  href: '/products?category=oils'           },
    { name: 'Wood-Pressed Oils',  href: '/products?category=wood-pressed'   },
    { name: 'Traditional Ghee',   href: '/products?category=ghee'           },
  ],
  company: [
    { name: 'About Us',     href: '/about'          },
    { name: 'Our Process',  href: '/about#process'  },
    { name: 'Contact',      href: '/contact'        },
    { name: 'FAQs',         href: '/faqs'           },
  ],
  quickLinks: [
    { name: 'Special Offers', href: '/products?sort=discount' },
    { name: 'About Us',       href: '/about'                  },
    { name: 'FAQs',           href: '/faqs'                   },
    { name: 'Track Order',    href: '/account/orders'         },
  ],
};

function FooterLinkGroup({ title, items }: { title: string; items: { name: string; href: string }[] }) {
  return (
    <div>
      <p style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,245,225,0.35)', marginBottom: 18, fontFamily: 'monospace' }}>
        {title}
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.name}>
            <Link
              href={item.href}
              className="text-sm transition-colors duration-200"
              style={{ color: 'rgba(255,245,225,0.55)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(160,112,16,0.95)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,245,225,0.55)')}
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewsletterStrip() {
  const [email, setEmail] = useState('');
  const [done, setDone]   = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.includes('@')) setDone(true);
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{ borderBottom: '1px solid rgba(255,245,225,0.07)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(160,112,16,0.70)', marginBottom: 6, fontFamily: 'monospace' }}>
            Newsletter
          </p>
          <h3 className="font-display font-bold text-xl sm:text-2xl" style={{ color: '#fff8f0', letterSpacing: '-0.01em' }}>
            Stay updated with new launches
          </h3>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,245,225,0.45)' }}>
            Plus organic recipes & wellness tips, weekly.
          </p>
        </div>

        {done ? (
          <div className="flex items-center gap-2 px-6 py-3 rounded-full" style={{ background: 'rgba(160,112,16,0.15)', border: '1px solid rgba(160,112,16,0.3)' }}>
            <span style={{ color: '#a07010', fontSize: 13 }}>✦ You&apos;re on the list</span>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col sm:flex-row items-stretch gap-2 w-full sm:w-auto sm:gap-0">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 sm:w-56 px-4 py-3 rounded-full sm:rounded-r-none text-sm outline-none"
              style={{ background: 'rgba(255,245,225,0.07)', border: '1px solid rgba(255,245,225,0.12)', color: '#fff8f0' }}
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-full sm:rounded-l-none text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: '#a07010', color: '#fff' }}
            >
              Subscribe <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden" style={{ background: FOOTER_BG }}>
      {/* Amber top edge glow */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(160,112,16,0.45), transparent)' }} />

      {/* Grain texture overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.18 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          opacity: 0.5,
          mixBlendMode: 'overlay',
          zIndex: 0,
        }}
      />

      {/* Ambient forest glow — bottom center */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{ width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(26,82,16,0.14) 0%, transparent 70%)', filter: 'blur(60px)', zIndex: 0 }}
      />
      {/* Subtle amber glow top-right */}
      <div
        className="pointer-events-none absolute top-0 right-0"
        style={{ width: 400, height: 300, background: 'radial-gradient(ellipse, rgba(160,112,16,0.07) 0%, transparent 70%)', filter: 'blur(50px)', zIndex: 0 }}
      />

      {/* "PURE." watermark */}
      <div
        className="pointer-events-none select-none absolute bottom-10 right-6 font-display font-black leading-none"
        style={{ fontSize: 'clamp(5rem, 14vw, 13rem)', color: 'rgba(255,245,225,0.025)', zIndex: 0, letterSpacing: '-0.04em' }}
        aria-hidden
      >
        PURE.
      </div>

      <div className="relative z-10">
        {/* Trust strip */}
        <div style={{ borderBottom: '1px solid rgba(255,245,225,0.07)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex flex-wrap justify-center items-center gap-5 sm:gap-12">
              {[
                { icon: ShieldCheck, label: 'FSSAI Certified' },
                { icon: Leaf,        label: '100% Organic'    },
                { icon: CreditCard,  label: 'Secure Payments' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: '#a07010' }} />
                  <span className="text-xs font-medium" style={{ color: 'rgba(255,245,225,0.45)', letterSpacing: '0.04em' }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Newsletter */}
        <NewsletterStrip />

        {/* Main columns */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 lg:py-20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 sm:gap-10 lg:gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" className="inline-flex mb-5">
              <Image
                src="/images/logo.png"
                alt="Nature Lite Foods"
                width={64}
                height={64}
                className="object-contain"
              />
            </Link>
            <p className="text-sm leading-relaxed max-w-xs mb-3" style={{ color: 'rgba(255,245,225,0.40)' }}>
              Bringing you the purest traditional foods — wood-pressed oils and Bilona ghee crafted with age-old methods. From farm to your kitchen.
            </p>
            <p style={{ fontFamily: "'Noto Sans Devanagari', sans-serif", fontSize: 13, fontWeight: 600, color: 'rgba(184,138,20,0.60)', lineHeight: 1.4 }}>
              सेहत का वादा स्वाद के साथ..!
            </p>

            {/* Social icons */}
            <div className="flex items-center gap-3 mt-7">
              {[
                { Icon: Instagram, href: 'https://instagram.com', label: 'Instagram' },
                { Icon: Facebook,  href: 'https://facebook.com',  label: 'Facebook'  },
                { Icon: Youtube,   href: 'https://youtube.com',   label: 'YouTube'   },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
                  style={{ background: 'rgba(255,245,225,0.07)', border: '1px solid rgba(255,245,225,0.10)', color: 'rgba(255,245,225,0.45)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(160,112,16,0.20)';
                    (e.currentTarget as HTMLElement).style.color = '#a07010';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(160,112,16,0.35)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,245,225,0.07)';
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,245,225,0.45)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,245,225,0.10)';
                  }}
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>

            {/* Contact quick-links */}
            <div className="mt-6 space-y-2">
              <a
                href="mailto:naturelitefoods@gmail.com"
                className="flex items-center gap-2 text-xs transition-colors duration-200"
                style={{ color: 'rgba(255,245,225,0.38)' }}
              >
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                naturelitefoods@gmail.com
              </a>
            </div>
          </div>

          {/* Link columns */}
          <FooterLinkGroup title="Shop"        items={links.shop}    />
          <FooterLinkGroup title="Company"     items={links.company} />
          <FooterLinkGroup title="Quick Links" items={links.quickLinks} />
        </div>

        {/* Bottom bar */}
        <div
          className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(255,245,225,0.07)' }}
        >
          <p style={{ fontSize: 12, color: 'rgba(255,245,225,0.28)' }}>
            © {year} Nature Lite Foods. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            {[
              { name: 'Privacy', href: '/privacy' },
              { name: 'Terms',   href: '/terms'   },
            ].map(({ name, href }) => (
              <Link
                key={name}
                href={href}
                style={{ fontSize: 12, color: 'rgba(255,245,225,0.28)' }}
                className="hover:text-amber-400 transition-colors"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
