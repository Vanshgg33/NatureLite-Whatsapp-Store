'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { ShoppingBag, LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';

function FmsSidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
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

  const isActive = pathname === '/fms/purchase' || pathname.startsWith('/fms/purchase/');

  const content = (
    <div className="flex h-full w-64 flex-col bg-[#1E3D2B]">
      <div className="relative flex items-center gap-3 px-4 py-5 border-b border-white/10 flex-shrink-0">
        {onMobileClose && (
          <button
            className="absolute right-3 top-3 md:hidden p-1 text-white/40 hover:text-white/70"
            onClick={onMobileClose}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Link href="/fms/purchase" className="flex items-center gap-3" onClick={onMobileClose}>
          <Image src="/images/logo.png" alt="NatureLite" width={36} height={36} className="object-contain rounded-full flex-shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="text-white font-semibold text-[13px] tracking-tight">Nature Lite Foods</span>
            <span className="text-[#4ade80]/70 text-[9px] tracking-[0.1em] uppercase font-mono mt-0.5">Purchase FMS</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        <div className="mt-1">
          <p className="px-4 pt-2.5 pb-1 text-[9px] font-mono text-white/30 uppercase tracking-[0.14em] select-none">
            Purchase
          </p>
          <Link
            href="/fms/purchase"
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-2.5 text-[13px] py-[7px]',
              isActive
                ? 'ml-0 mr-2 pl-5 rounded-r-lg border-l-2 border-[#4ade80] bg-[rgba(74,222,128,0.1)] text-[#4ade80] font-medium'
                : 'mx-2 px-3 rounded-lg text-white/60 hover:text-white/90 hover:bg-white/[0.06]',
            )}
            style={{ transition: 'background-color 0.1s, color 0.1s' }}
          >
            <ShoppingBag className={cn('h-[15px] w-[15px] flex-shrink-0', isActive ? 'opacity-100' : 'opacity-65')} />
            Purchase FMS
          </Link>
        </div>
      </nav>

      <div className="border-t border-white/10 p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.06] mb-2">
          <div className="h-7 w-7 rounded-md bg-[#2F6B47] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-[12.5px] font-medium truncate leading-tight">{user?.name ?? 'Admin'}</p>
            <p className="text-white/35 text-[10px] font-mono truncate leading-tight">fms</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/45 hover:text-white/75 hover:bg-white/[0.06] text-[13px] cursor-pointer"
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

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.push('/admin-login');
      return;
    }
    if (user?.departmentType !== 'fms') {
      router.push('/admin/dashboard');
    }
  }, [hasHydrated, isAuthenticated, user, router]);

  if (!hasHydrated || !isAuthenticated || user?.departmentType !== 'fms') return null;

  return (
    <div className="flex h-screen bg-[#faf9f6]">
      <FmsSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex md:hidden h-14 items-center gap-3 border-b bg-[#faf9f6] px-4 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-gray-900">Purchase FMS</span>
        </div>
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
