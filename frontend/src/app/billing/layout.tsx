'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import {
  Users, FileText, AlertCircle, BarChart3, Trophy, FileSpreadsheet,
  LayoutDashboard, Plus, LogOut, Menu, X, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';

type NavItem = { name: string; href: string; icon: LucideIcon; soon?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const BILLING_NAV: NavGroup[] = [
  {
    label: 'Billing',
    items: [
      { name: 'New Bill', href: '/billing/new', icon: Plus },
      { name: 'Dashboard', href: '/billing/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Customers',
    items: [
      { name: 'Customers', href: '/billing/customers', icon: Users },
      { name: 'Tag Pricing', href: '/billing/pricing', icon: FileText },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Unpaid Dues', href: '/billing/dues', icon: AlertCircle },
      { name: 'Sales Reports', href: '/billing/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Insights',
    items: [
      { name: 'Customer Insights', href: '/billing/insights', icon: Trophy },
      { name: 'GSTR-1', href: '/billing/gstr1', icon: FileSpreadsheet },
    ],
  },
];

function BillingSidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const userInitial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'A';

  const handleLogout = () => {
    logout();
    router.push('/admin-login');
    api.logout().catch(() => {});
  };

  const content = (
    <div className="flex h-full w-[220px] flex-col bg-[#1A3625]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/10 flex-shrink-0">
        <Link href="/billing/customers" className="flex items-center gap-2.5 min-w-0" onClick={onMobileClose}>
          <Image src="/images/logo.png" alt="NatureLite" width={28} height={28} className="object-contain rounded-full flex-shrink-0" />
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-white font-semibold text-[12.5px] tracking-tight truncate">Nature Lite</span>
            <span className="text-[#4ade80]/50 text-[9px] tracking-[0.14em] uppercase font-mono mt-0.5">Billing</span>
          </div>
        </Link>
        <button className="ml-auto md:hidden p-1 text-white/40 hover:text-white/70 shrink-0" onClick={onMobileClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {BILLING_NAV.map((group, gi) => (
          <div key={gi} className="mt-2 first:mt-1">
            <p className="px-4 pt-2 pb-1 text-[9px] font-semibold text-white/25 uppercase tracking-[0.15em] select-none">
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = !item.soon && (pathname === item.href || pathname.startsWith(item.href + '/'));
              return (
                <div key={item.href}>
                  {item.soon ? (
                    <span className="flex items-center gap-2.5 text-[12.5px] py-[7px] mx-2 px-3 rounded-md text-white/25 cursor-not-allowed select-none">
                      <item.icon className="h-[13px] w-[13px] flex-shrink-0 opacity-40" />
                      {item.name}
                      <span className="ml-auto text-[9px] bg-white/10 px-1.5 py-0.5 rounded font-mono text-white/25">soon</span>
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={onMobileClose}
                      className={cn(
                        'flex items-center gap-2.5 text-[12.5px] py-[7px] mx-2 px-3 rounded-md transition-colors',
                        isActive
                          ? 'bg-[#2d7a4f] text-white font-medium'
                          : 'text-white/55 hover:text-white/85 hover:bg-white/[0.07]'
                      )}
                    >
                      <item.icon className={cn('h-[13px] w-[13px] flex-shrink-0', isActive ? 'opacity-100' : 'opacity-60')} />
                      {item.name}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-2.5 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-white/[0.06] mb-1.5">
          <div className="h-6 w-6 rounded bg-[#2F6B47] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-[12px] font-medium truncate leading-tight">{user?.name ?? 'Admin'}</p>
            <p className="text-white/35 text-[10px] font-mono truncate leading-tight">{user?.role ?? 'admin'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.06] text-[12px] cursor-pointer transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex md:w-[220px] md:flex-shrink-0 md:flex-col">{content}</aside>
      {mounted && (
        <>
          {mobileOpen && (
            <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onMobileClose} />
          )}
          <div className={cn(
            'fixed inset-y-0 left-0 z-50 w-[220px] shadow-2xl transition-transform duration-200 ease-out md:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}>
            {content}
          </div>
        </>
      )}
    </>
  );
}

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAdminAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) router.push('/admin-login');
  }, [hasHydrated, isAuthenticated, router]);

  if (!hasHydrated || !isAuthenticated) return null;

  return (
    <div className="flex h-screen bg-[#EDEEF2]">
      <BillingSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="flex md:hidden h-12 items-center gap-3 border-b bg-white px-4 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="h-8 w-8">
            <Menu className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm text-gray-800">Billing</span>
        </div>
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
