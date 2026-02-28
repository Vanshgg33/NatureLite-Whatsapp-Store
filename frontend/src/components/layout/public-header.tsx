'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, User, Menu, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/lib/cart-store';
import { useCustomerStore } from '@/lib/customer-store';

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
  { name: 'Products', href: '/products' },
  { name: 'Contact', href: '/contact' },
];

export function PublicHeader() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const itemCount = useCartStore((state) => state.getItemCount());
  const { isAuthenticated, customer } = useCustomerStore();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Standard light header — no dark theme needed
  const useDarkTheme = false;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          isScrolled
            ? 'bg-white/95 backdrop-blur-md shadow-sm'
            : 'bg-transparent'
        )}
      >
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <span
                className={cn(
                  'font-serif text-xl font-semibold transition-colors duration-300',
                  useDarkTheme ? 'text-white' : 'text-brand-charcoal'
                )}
              >
                Naturelite
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'relative text-sm font-medium transition-colors duration-300',
                      useDarkTheme
                        ? (isActive ? 'text-white' : 'text-white/70 hover:text-white')
                        : (isActive ? 'text-brand-brown' : 'text-brand-brown-light hover:text-brand-charcoal')
                    )}
                  >
                    {item.name}
                    {isActive && (
                      <motion.div
                        layoutId="activeNav"
                        className="absolute -bottom-1 left-0 right-0 h-0.5 bg-brand-mustard rounded-full"
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Search */}
              <Link
                href="/products"
                className={cn(
                  'p-2.5 rounded-full transition-colors duration-300',
                  useDarkTheme
                    ? 'text-white/70 hover:text-white hover:bg-white/10'
                    : 'text-brand-brown-light hover:text-brand-charcoal hover:bg-brand-cream'
                )}
                aria-label="Search products"
              >
                <Search className="w-5 h-5" />
              </Link>

              {/* Cart */}
              <Link
                id="cart-icon"
                href="/cart"
                className={cn(
                  'relative p-2.5 rounded-full transition-colors duration-300',
                  useDarkTheme
                    ? 'text-white/70 hover:text-white hover:bg-white/10'
                    : 'text-brand-brown-light hover:text-brand-charcoal hover:bg-brand-cream'
                )}
                aria-label="Cart"
              >
                <ShoppingBag className="w-5 h-5" />
                {hasMounted && itemCount > 0 && (
                  <motion.span
                    key={itemCount}
                    className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-brand-mustard text-white text-xs font-medium rounded-full flex items-center justify-center"
                    initial={{ scale: 1.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  >
                    {itemCount > 9 ? '9+' : itemCount}
                  </motion.span>
                )}
              </Link>

              {/* Account / Sign In */}
              {hasMounted && isAuthenticated ? (
                <Link
                  href="/account"
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-full transition-colors duration-300',
                    useDarkTheme
                      ? 'text-white/70 hover:text-white hover:bg-white/10'
                      : 'text-brand-brown-light hover:text-brand-charcoal hover:bg-brand-cream'
                  )}
                >
                  <User className="w-5 h-5" />
                </Link>
              ) : (
                <Link
                  href="/login"
                  className={cn(
                    'hidden sm:flex items-center px-6 py-2.5 rounded-full text-sm font-medium transition-colors duration-300',
                    useDarkTheme
                      ? 'bg-white/15 text-white backdrop-blur-sm border border-white/20 hover:bg-white/25'
                      : 'bg-brand-charcoal text-white hover:bg-brand-charcoal-dark'
                  )}
                >
                  Sign In
                </Link>
              )}

              {/* Mobile Menu Toggle */}
              <button
                className={cn(
                  'md:hidden p-2.5 rounded-full transition-colors duration-300',
                  useDarkTheme
                    ? 'text-white/70 hover:bg-white/10'
                    : 'text-brand-brown-light hover:bg-brand-cream'
                )}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Menu */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-x-0 top-20 z-50 md:hidden"
            >
              <div className="bg-white shadow-lg rounded-b-2xl mx-4">
                <div className="p-4">
                  <div className="flex flex-col gap-1">
                    {navigation.map((item) => {
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={cn(
                            'px-4 py-3 rounded-xl text-base transition-colors',
                            isActive
                              ? 'bg-brand-cream text-brand-brown font-medium'
                              : 'text-brand-brown-light hover:bg-brand-cream'
                          )}
                        >
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-brand-cream">
                    {!(hasMounted && isAuthenticated) ? (
                      <Link
                        href="/login"
                        className="block w-full px-4 py-3 bg-brand-charcoal text-white rounded-xl text-center font-medium"
                      >
                        Sign In
                      </Link>
                    ) : (
                      <Link
                        href="/account"
                        className="flex items-center gap-3 px-4 py-3 text-brand-brown-light hover:bg-brand-cream rounded-xl"
                      >
                        <User className="w-5 h-5" />
                        <span>My Account</span>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
