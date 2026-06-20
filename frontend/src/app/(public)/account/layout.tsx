'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, Package, MapPin, LogOut, Wallet } from 'lucide-react';
import { useCustomerStore } from '@/lib/customer-store';
import { cn } from '@/lib/utils';
import { AccountLoginRequired } from '@/components/account/login-required';

const accountNav = [
  { name: 'Dashboard', href: '/account',           icon: User    },
  { name: 'Orders',    href: '/account/orders',    icon: Package },
  { name: 'Addresses', href: '/account/addresses', icon: MapPin  },
  { name: 'Wallet',    href: '/account/wallet',    icon: Wallet  },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, customer, logout, setLastVisitedPage } = useCustomerStore();

  useEffect(() => {
    setLastVisitedPage(pathname);
  }, [pathname, setLastVisitedPage]);

  const initial =
    customer?.name?.[0]?.toUpperCase() ||
    customer?.email?.[0]?.toUpperCase() ||
    'U';

  return (
    <div className="min-h-screen pt-28 flex flex-col">

      {/* ── Mobile tab bar ──────────────────────────────────────── */}
      <div className="lg:hidden bg-white border-b border-brand-border flex overflow-x-auto">
        {accountNav.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/account' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0',
                isActive
                  ? 'border-brand-mustard text-brand-mustard'
                  : 'border-transparent text-brand-muted hover:text-brand-charcoal'
              )}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
        {isAuthenticated && (
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-brand-muted hover:text-red-500 transition-colors shrink-0 ml-auto"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            Sign Out
          </button>
        )}
      </div>

      {/* ── Two-tone body ────────────────────────────────────────── */}
      <div className="flex flex-1 bg-brand-cream">

        {/* ── Sidebar — dark full-height column ─────────────────── */}
        <aside
          className="hidden lg:flex flex-col w-64 xl:w-72 shrink-0 sticky top-28 h-[calc(100vh-7rem)] overflow-y-auto"
          style={{
            background: 'linear-gradient(165deg,#2d1506 0%,#1a0c03 60%,#0f0601 100%)',
          }}
        >
          {/* Grain */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.055 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              mixBlendMode: 'overlay',
            }}
          />
          {/* Gold glow orb */}
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              top: '-60px',
              right: '-40px',
              width: 220,
              height: 220,
              background: 'radial-gradient(circle,rgba(212,152,64,0.18) 0%,transparent 70%)',
              filter: 'blur(40px)',
            }}
          />

          <div className="relative flex flex-col flex-1">

            {/* ── Profile zone ──────────────────────────────────── */}
            <div
              className="px-6 pt-8 pb-6"
              style={{ borderBottom: '1px solid rgba(212,152,64,0.12)' }}
            >
              <div
                className="rounded-xl flex items-center justify-center mb-4"
                style={{
                  width: 56,
                  height: 56,
                  background: 'rgba(212,152,64,0.28)',
                  border: '1.5px solid rgba(212,152,64,0.55)',
                }}
              >
                <span
                  className="font-display text-2xl font-bold"
                  style={{ color: '#d49840' }}
                >
                  {initial}
                </span>
              </div>
              <p
                className="font-display font-semibold leading-snug truncate"
                style={{ color: '#f5e8cc', fontSize: 15 }}
              >
                {customer?.name || 'User'}
              </p>
              <p
                className="font-body text-xs mt-1 truncate"
                style={{ color: 'rgba(245,232,204,0.38)' }}
              >
                {customer?.phone || customer?.email || ''}
              </p>
            </div>

            {/* ── Nav zone ──────────────────────────────────────── */}
            <nav className="flex-1 px-3 py-4 space-y-0.5">
              {accountNav.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/account' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl font-body text-sm transition-all duration-200',
                      !isActive && 'hover:bg-white/5'
                    )}
                    style={
                      isActive
                        ? {
                            background: 'rgba(212,152,64,0.12)',
                            border: '1px solid rgba(212,152,64,0.18)',
                          }
                        : {}
                    }
                  >
                    <item.icon
                      className="w-4 h-4 shrink-0"
                      style={{
                        color: isActive
                          ? '#d49840'
                          : 'rgba(245,232,204,0.38)',
                      }}
                    />
                    <span
                      className="flex-1 font-medium"
                      style={{
                        color: isActive
                          ? '#d49840'
                          : 'rgba(245,232,204,0.65)',
                      }}
                    >
                      {item.name}
                    </span>
                    {isActive && (
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: '#d49840' }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* ── Logout zone ───────────────────────────────────── */}
            {isAuthenticated && (
              <div className="px-3 pb-6">
                <div
                  style={{
                    height: 1,
                    background: 'rgba(212,152,64,0.10)',
                    marginBottom: 10,
                  }}
                />
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-body text-sm transition-all duration-200 hover:bg-red-900/20 group"
                >
                  <LogOut
                    className="w-4 h-4 shrink-0 transition-colors group-hover:text-red-400"
                    style={{ color: 'rgba(245,232,204,0.32)' }}
                  />
                  <span
                    className="transition-colors group-hover:text-red-400"
                    style={{ color: 'rgba(245,232,204,0.42)' }}
                  >
                    Sign Out
                  </span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────── */}
        <main className="flex-1 min-w-0 bg-brand-cream px-4 sm:px-6 lg:px-10 xl:px-12 py-7 lg:py-9">
          {isAuthenticated ? children : <AccountLoginRequired />}
        </main>
      </div>
    </div>
  );
}
