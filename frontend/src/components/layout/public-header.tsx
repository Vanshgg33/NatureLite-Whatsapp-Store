'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, User, Menu, X, Search, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/lib/cart-store';
import { useCustomerStore } from '@/lib/customer-store';
import { useWishlistStore } from '@/lib/wishlist-store';

const navigation = [
  { name: 'Home',         href: '/'                        },
  { name: 'Shop',         href: '/products'                },
  { name: 'Quick Order',  href: '/quick-order'             },
  { name: 'Best Sellers', href: '/products?sort=bestseller' },
  { name: 'About',        href: '/about'                   },
  { name: 'Contact',      href: '/contact'                 },
];

// ─── Icon button ─────────────────────────────────────────────────────────────

function NavIconBtn({
  href,
  label,
  badge,
  heroMode,
  children,
}: {
  href: string;
  label: string;
  badge?: number;
  heroMode?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'relative p-2.5 rounded-full',
        heroMode
          ? 'text-white/80 hover:text-white hover:bg-white/10'
          : 'text-brand-charcoal/70 hover:text-brand-charcoal hover:bg-brand-cream'
      )}
      style={{ transition: 'background-color 0.1s, color 0.1s' }}
    >
      {children}
      {badge != null && badge > 0 && (
        <motion.span
          key={badge}
          initial={{ scale: 1.6 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 14 }}
          className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full text-white text-[10px] font-semibold flex items-center justify-center leading-none"
          style={{ background: heroMode ? '#a07010' : 'hsl(var(--brand-mustard))' }}
        >
          {badge > 9 ? '9+' : badge}
        </motion.span>
      )}
    </Link>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function PublicHeader() {
  const pathname             = usePathname();
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [hasMounted, setHasMounted]     = useState(false);

  const itemCount            = useCartStore((s) => s.getItemCount());
  const isAuthenticated      = useCustomerStore((s) => s.isAuthenticated);
  const wishlistCount        = useWishlistStore((s) => s.items.length);
  const isHeroMode           = false;

  useEffect(() => { setHasMounted(true); }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      {/* ── Main header ───────────────────────────────────── */}
      <header
        className={cn(
          'w-full transition-all duration-500 ease-out',
          'glass-warm brand-light shadow-[0_1px_0_rgba(145,110,58,0.10),0_4px_24px_-8px_rgba(61,46,31,0.08)]'
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex items-center justify-between h-[72px]">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group" aria-label="Nature Lite Foods Home">
              <Image
                src="/images/logo.png"
                alt="Nature Lite Foods"
                width={44}
                height={44}
                className="object-contain transition-opacity duration-200 group-hover:opacity-85 flex-shrink-0 rounded-full"
                style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.14))' }}
                priority
              />
              <div className="flex flex-col gap-0">
                <span className="font-display text-[0.92rem] sm:text-[1.05rem] font-semibold tracking-[-0.01em] leading-none text-brand-charcoal group-hover:text-brand-brown transition-colors duration-200">
                  Nature Lite Foods
                </span>
                <span className="hidden sm:block text-[8.5px] tracking-[0.14em] text-brand-muted uppercase leading-none mt-0.5">
                  Pure · Fresh · Naturally Processed
                </span>
              </div>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-7">
              {navigation.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'hover-oil text-sm font-medium transition-colors duration-200',
                      isHeroMode
                        ? (active ? 'text-amber-300' : 'text-white/85 hover:text-white')
                        : (active ? 'active text-brand-brown' : 'text-brand-charcoal/65 hover:text-brand-charcoal'),
                    )}
                  >
                    {item.name}
                    {active && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute -bottom-[3px] left-0 right-0 h-[1.5px] bg-brand-mustard rounded-full"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5">
              <NavIconBtn href="/products" label="Search products" heroMode={isHeroMode}>
                <Search className="w-[18px] h-[18px]" />
              </NavIconBtn>

              <NavIconBtn
                href="/wishlist"
                label="Wishlist"
                badge={hasMounted ? wishlistCount : undefined}
                heroMode={isHeroMode}
              >
                <Heart className="w-[18px] h-[18px]" />
              </NavIconBtn>

              <NavIconBtn
                href="/cart"
                label="Cart"
                badge={hasMounted ? itemCount : undefined}
                heroMode={isHeroMode}
              >
                <ShoppingBag id="cart-icon" className="w-[18px] h-[18px]" />
              </NavIconBtn>

              {hasMounted && isAuthenticated ? (
                <NavIconBtn href="/account" label="My account" heroMode={isHeroMode}>
                  <User className="w-[18px] h-[18px]" />
                </NavIconBtn>
              ) : (
                <Link
                  href="/login"
                  className="hidden sm:flex items-center px-5 py-2 ml-1 rounded-xl text-[13px] font-semibold"
                  style={isHeroMode
                    ? { background: '#a07010', color: '#fff', boxShadow: '0 2px 14px -2px rgba(160,112,16,0.45)', transition: 'opacity 0.1s' }
                    : { background: 'hsl(var(--brand-charcoal))', color: '#fff', transition: 'opacity 0.1s' }
                  }
                >
                  Sign In
                </Link>
              )}

              {/* Mobile toggle */}
              <button
                className={cn(
                  'md:hidden ml-0.5 p-2.5 rounded-full',
                  isHeroMode
                    ? 'text-white/85 hover:text-white hover:bg-white/10'
                    : 'text-brand-charcoal/70 hover:text-brand-charcoal hover:bg-brand-cream'
                )}
                style={{ transition: 'background-color 0.1s, color 0.1s' }}
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* ── Full-screen mobile menu ────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[200] flex flex-col md:hidden overflow-hidden"
            style={{ background: '#faf9f2' }}
          >
            {/* Grain texture */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.12 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                opacity: 0.5, mixBlendMode: 'overlay',
              }}
            />

            {/* Glow orb */}
            <div className="pointer-events-none absolute top-0 right-0 w-80 h-80 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(212,165,116,0.20) 0%, transparent 70%)', filter: 'blur(60px)', transform: 'translate(30%, -20%)' }} />

            {/* Header row */}
            <div className="flex items-center justify-between px-6 py-5">
              <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <Image
                  src="/images/logo.png"
                  alt="Nature Lite Foods"
                  width={44}
                  height={44}
                  className="object-contain"
                  style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.14))' }}
                />
                <span className="font-display text-base font-semibold text-brand-charcoal leading-none">
                  Nature Lite Foods
                </span>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2.5 rounded-full text-brand-charcoal/60 hover:bg-brand-cream"
                style={{ transition: 'background-color 0.1s' }}
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation links — large editorial */}
            <div className="flex-1 flex flex-col justify-center px-8 gap-1 pb-8">
              {navigation.map((item, i) => {
                const active = pathname === item.href;
                return (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, x: -28 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.35, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'block py-3 font-display font-bold leading-none transition-colors duration-200',
                        'text-5xl',
                        active ? 'text-brand-charcoal' : 'text-brand-charcoal/25 hover:text-brand-charcoal/70',
                      )}
                    >
                      {item.name}
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {/* Bottom: auth + quick links */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.4 }}
              className="px-8 pb-10 flex items-center justify-between"
            >
              {hasMounted && isAuthenticated ? (
                <Link
                  href="/account"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 text-brand-charcoal/70 font-medium text-sm"
                >
                  <User className="w-5 h-5" /> My Account
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="px-7 py-3 bg-brand-charcoal text-white rounded-full text-sm font-medium"
                >
                  Sign In
                </Link>
              )}
              <div className="flex items-center gap-2">
                <NavIconBtn href="/wishlist" label="Wishlist" badge={hasMounted ? wishlistCount : undefined}>
                  <Heart className="w-5 h-5" />
                </NavIconBtn>
                <NavIconBtn href="/cart" label="Cart" badge={hasMounted ? itemCount : undefined}>
                  <ShoppingBag className="w-5 h-5" />
                </NavIconBtn>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
