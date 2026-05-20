'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, Package, MapPin, LogOut, Wallet } from 'lucide-react';
import { useCustomerStore } from '@/lib/customer-store';
import { cn } from '@/lib/utils';
import { AccountLoginRequired } from '@/components/account/login-required';

const accountNav = [
  { name: 'Dashboard', href: '/account', icon: User },
  { name: 'Orders', href: '/account/orders', icon: Package },
  { name: 'Addresses', href: '/account/addresses', icon: MapPin },
  { name: 'Wallet', href: '/account/wallet', icon: Wallet },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, customer, logout, setLastVisitedPage } = useCustomerStore();

  useEffect(() => {
    setLastVisitedPage(pathname);
  }, [pathname, setLastVisitedPage]);

  return (
    <div className="min-h-screen pt-20 pb-10 bg-brand-cream">
      <div className="brand-container py-4 sm:py-6">
        <div className="grid lg:grid-cols-4 gap-5 lg:gap-6 items-start">
          {/* Sidebar */}
          <div className="lg:col-span-1 lg:sticky lg:top-24">
            <div className="bg-white rounded-2xl overflow-hidden shadow-brand-sm">
              {/* User Info Header */}
              <div
                className="px-5 py-5 relative overflow-hidden"
                style={{
                  background:
                    'linear-gradient(135deg,rgba(160,112,16,0.07) 0%,rgba(120,72,10,0.03) 100%)',
                  borderBottom: '1px solid hsl(var(--brand-border))',
                }}
              >
                {/* Ambient glow */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-0 right-0 w-28 h-28 rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle,rgba(160,112,16,0.18) 0%,transparent 70%)',
                    filter: 'blur(22px)',
                    transform: 'translate(35%,-35%)',
                  }}
                />
                <div className="relative flex items-center gap-3.5">
                  <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-brand-mustard/10 flex items-center justify-center shrink-0 ring-2 ring-brand-mustard/20 ring-offset-1">
                    <span className="font-display text-xl font-bold text-brand-mustard">
                      {customer?.name?.[0]?.toUpperCase() ||
                        customer?.email?.[0]?.toUpperCase() ||
                        'U'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-brand-charcoal truncate text-[15px]">
                      {customer?.name || 'User'}
                    </p>
                    <p className="font-body text-xs text-brand-muted truncate mt-0.5">
                      {customer?.phone || customer?.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <nav className="p-2.5">
                {accountNav.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/account' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 rounded-xl font-body text-sm transition-all duration-200',
                        isActive
                          ? 'bg-brand-mustard/10 text-brand-mustard font-medium'
                          : 'text-brand-text hover:bg-brand-sand'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'w-4 h-4 shrink-0',
                          isActive ? 'text-brand-mustard' : 'text-brand-muted'
                        )}
                      />
                      <span className="flex-1">{item.name}</span>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-mustard shrink-0" />
                      )}
                    </Link>
                  );
                })}

                {isAuthenticated && (
                  <>
                    <div className="my-2 border-t border-brand-border/60" />
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-body text-sm text-brand-muted hover:bg-red-50 hover:text-red-600 transition-all duration-200"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Sign Out
                    </button>
                  </>
                )}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {isAuthenticated ? children : <AccountLoginRequired />}
          </div>
        </div>
      </div>
    </div>
  );
}
