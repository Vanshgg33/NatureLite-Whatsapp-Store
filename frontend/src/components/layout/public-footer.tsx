import Link from 'next/link';
import { Mail, Phone, MapPin, Instagram, Facebook, Youtube, ShieldCheck, Leaf, CreditCard } from 'lucide-react';

const footerLinks = {
  shop: [
    { name: 'All Products', href: '/products' },
    { name: 'Cold-Pressed Oils', href: '/products?category=oils' },
    { name: 'Wood-Pressed Oils', href: '/products?category=wood-pressed' },
    { name: 'Traditional Ghee', href: '/products?category=ghee' },
  ],
  company: [
    { name: 'About Us', href: '/about' },
    { name: 'Our Process', href: '/about#process' },
    { name: 'Contact', href: '/contact' },
  ],
  support: [
    { name: 'Track Order', href: '/account/orders' },
    { name: 'Shipping', href: '/shipping' },
    { name: 'Returns', href: '/returns' },
    { name: 'FAQs', href: '/faqs' },
  ],
};

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-brand-brown text-white/90">
      {/* Trust Certifications */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-wrap justify-center items-center gap-6 lg:gap-10">
            {[
              { icon: <ShieldCheck className="w-5 h-5" />, label: 'FSSAI Certified' },
              { icon: <Leaf className="w-5 h-5" />, label: '100% Organic' },
              { icon: <CreditCard className="w-5 h-5" />, label: 'Secure Payments' },
            ].map((badge) => (
              <div key={badge.label} className="flex items-center gap-2 text-white/70">
                <span className="text-brand-mustard">{badge.icon}</span>
                <span className="text-sm font-medium">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-brand-mustard flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <span className="font-serif text-xl font-semibold text-white">
                Naturelite
              </span>
            </Link>
            <p className="text-white/60 leading-relaxed mb-6 max-w-sm">
              Bringing you the purest traditional foods, crafted with care using
              age-old methods. From our farms to your kitchen.
            </p>
            <div className="flex gap-3">
              {[
                { icon: Instagram, href: 'https://instagram.com', label: 'Instagram' },
                { icon: Facebook, href: 'https://facebook.com', label: 'Facebook' },
                { icon: Youtube, href: 'https://youtube.com', label: 'YouTube' },
              ].map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-brand-mustard transition-colors duration-300"
                  aria-label={label}
                >
                  <Icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Shop Links */}
          <div>
            <h3 className="font-serif text-lg font-semibold text-white mb-4">Shop</h3>
            <ul className="space-y-3">
              {footerLinks.shop.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-brand-mustard transition-colors duration-300"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="font-serif text-lg font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-brand-mustard transition-colors duration-300"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-serif text-lg font-semibold text-white mb-4">Contact</h3>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-brand-mustard transition-colors duration-300"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-4 border-t border-white/10 space-y-3">
              <a
                href="tel:+919999999999"
                className="flex items-center gap-2 text-sm text-white/60 hover:text-brand-mustard transition-colors"
              >
                <Phone className="w-4 h-4" />
                +91 99999 99999
              </a>
              <a
                href="mailto:hello@naturelite.in"
                className="flex items-center gap-2 text-sm text-white/60 hover:text-brand-mustard transition-colors"
              >
                <Mail className="w-4 h-4" />
                hello@naturelite.in
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex flex-wrap justify-center items-center gap-4">
            <span className="text-xs text-white/40 mr-2">We Accept:</span>
            {['Visa', 'Mastercard', 'UPI', 'RuPay', 'Razorpay'].map((method) => (
              <span
                key={method}
                className="px-3 py-1.5 rounded-md bg-white/10 text-xs text-white/60 font-medium"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-white/40">
              &copy; {currentYear} Naturelite. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="/privacy"
                className="text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
