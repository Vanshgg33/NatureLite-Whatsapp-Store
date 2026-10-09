'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { ShoppingBag, ShoppingCart, Plus, Building2, LogOut, Menu, X, Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';

const fraunces  = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap', axes: ['opsz'] });
const jakarta   = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

function FmsSidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: summary } = useQuery({
    queryKey: ['purchase-summary'],
    queryFn: () => api.getPurchaseSummary(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const myActionCount: number = summary?.myAction ?? 0;

  const userInitial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'A';

  const handleLogout = () => {
    logout();
    router.push('/admin-login');
    api.logout().catch(() => {});
  };

  const NAV_LINKS = [
    {
      href: '/fms/purchase',
      label: 'Purchase FMS',
      Icon: ShoppingBag,
      active: pathname === '/fms/purchase' || (pathname.startsWith('/fms/purchase/') && !pathname.startsWith('/fms/purchase/vendors')),
    },
    {
      href: '/fms/purchase/vendors',
      label: 'Vendors',
      Icon: Building2,
      active: pathname.startsWith('/fms/purchase/vendors'),
    },
  ];

  const content = (
    <div className="flex h-full w-64 flex-col" style={{ background: '#17382A' }}>
      <div className="relative flex items-center gap-3 px-4 py-5 border-b border-white/10 flex-shrink-0">
        {onMobileClose && (
          <button
            className="absolute right-3 top-3 md:hidden p-1 text-white/40 hover:text-white/70"
            onClick={onMobileClose}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Link href="/fms/purchase" className="flex items-center gap-3 flex-1 min-w-0" onClick={onMobileClose}>
          <Image src="/images/logo.png" alt="NatureLite" width={36} height={36} className="object-contain rounded-full flex-shrink-0" />
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-white font-semibold text-[13px] tracking-tight font-jakarta">Nature Lite Foods</span>
            <span className="text-white/50 text-[9px] tracking-[0.1em] uppercase font-jetbrains mt-0.5">Purchase FMS</span>
          </div>
        </Link>
        {/* Notification bell */}
        <Link href="/fms/purchase" onClick={onMobileClose}
          className="relative flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
          <Bell className="h-4 w-4 text-white/60" />
          {myActionCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold font-jakarta flex items-center justify-center"
              style={{ background: '#D9902B', color: 'white' }}>
              {myActionCount > 9 ? '9+' : myActionCount}
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        <div className="mt-1">
          <p className="px-4 pt-2.5 pb-1 text-[9px] font-jetbrains text-white/30 uppercase tracking-[0.14em] select-none">
            Purchase
          </p>
          {NAV_LINKS.map(({ href, label, Icon, active }) => (
            <Link
              key={href}
              href={href}
              onClick={onMobileClose}
              className={cn(
                'flex items-center gap-2.5 text-[13px] py-[7px] font-jakarta',
                active
                  ? 'ml-0 mr-2 pl-5 rounded-r-lg border-l-2 border-[#EAF3EE] bg-white/10 text-white font-medium'
                  : 'mx-2 px-3 rounded-lg text-white/60 hover:text-white/90 hover:bg-white/[0.06]',
              )}
              style={{ transition: 'background-color 0.1s, color 0.1s' }}
            >
              <Icon className={cn('h-[15px] w-[15px] flex-shrink-0', active ? 'opacity-100' : 'opacity-65')} />
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="border-t border-white/10 p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.06] mb-2">
          <div className="h-7 w-7 rounded-md flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ background: '#1E5E3F' }}>
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-[12.5px] font-medium truncate leading-tight font-jakarta">{user?.name ?? 'Admin'}</p>
            <p className="text-white/35 text-[10px] font-jetbrains truncate leading-tight">fms</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/45 hover:text-white/75 hover:bg-white/[0.06] text-[13px] cursor-pointer font-jakarta"
          style={{ transition: 'color 0.1s, background-color 0.1s' }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex md:w-64 md:flex-shrink-0 md:flex-col">{content}</aside>
      {mounted && (
        <>
          {mobileOpen && (
            <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onMobileClose} />
          )}
          <div className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 shadow-2xl transition-transform duration-200 ease-out md:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}>
            {content}
          </div>
        </>
      )}
    </>
  );
}

export default function FmsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, user, hasHydrated } = useAdminAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSuperadmin = user?.role === 'superadmin';
  const hasFmsAccess =
    user?.departmentType === 'fms' ||
    (user?.purchaseRole != null && !user?.departmentType) ||
    isSuperadmin;

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) { router.push('/admin-login'); return; }
    if (!hasFmsAccess) router.push('/admin/dashboard');
  }, [hasHydrated, isAuthenticated, hasFmsAccess, router]);

  if (!hasHydrated || !isAuthenticated || !hasFmsAccess) return null;

  return (
    <div
      className={`flex h-screen ${fraunces.variable} ${jakarta.variable} ${jetbrains.variable}`}
      style={{ background: '#F7F6F2' }}
    >
      <FmsSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex md:hidden h-14 items-center gap-3 border-b px-4 shrink-0" style={{ background: '#F7F6F2', borderColor: '#ECE9E1' }}>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-[#18211C] font-jakarta">Purchase FMS</span>
        </div>
        {/* main — add bottom padding on mobile for the tab bar */}
        <main className="flex-1 overflow-auto pb-0 md:pb-0" style={{ paddingBottom: 0 }}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      {/* S8 bottom tab bar — mobile only */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex md:hidden border-t" style={{ background: '#17382A', borderColor: '#1E5E3F' }}>
        {[
          { href: '/fms/purchase',         Icon: ShoppingCart, label: 'Queue' },
          { href: '/fms/purchase/new',      Icon: Plus,         label: 'New' },
          { href: '/fms/purchase/vendors',  Icon: Building2,    label: 'Vendors' },
        ].map(({ href, Icon, label }) => (
          <Link key={href} href={href} className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-white/50 hover:text-white/90 transition-colors min-h-[56px]">
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-jakarta">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
