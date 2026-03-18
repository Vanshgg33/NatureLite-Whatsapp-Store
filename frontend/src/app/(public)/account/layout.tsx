'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, Package, MapPin, LogOut, Settings, Wallet } from 'lucide-react';
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

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen pt-20 pb-8 sm:pb-12 bg-brand-cream">
      <div className="brand-container py-6 sm:py-12">
        <div className="grid lg:grid-cols-4 gap-6 lg:gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-brand-sm">
              {/* User Info */}
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-brand-border">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-brand-mustard/10 flex items-center justify-center shrink-0">
                  <span className="font-display text-xl font-bold text-brand-mustard">
                    {customer?.name?.[0]?.toUpperCase() || customer?.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-brand-charcoal truncate">
                    {customer?.name || 'User'}
                  </p>
                  <p className="font-body text-sm text-brand-muted truncate">
                    {customer?.email}
                  </p>
                </div>
              </div>

              {/* Navigation */}
              <nav className="space-y-1">
                {accountNav.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/account' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl font-body text-sm transition-colors',
                        isActive
                          ? 'bg-brand-mustard/10 text-brand-mustard font-medium'
                          : 'text-brand-text hover:bg-brand-sand'
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  );
                })}
                {isAuthenticated && (
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-body text-sm text-brand-text hover:bg-brand-error/10 hover:text-brand-error transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                  </button>
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
