// frontend/src/app/crm/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import {
  Users, ListTodo, Megaphone, Trophy, BarChart3, Settings,
  LogOut, Menu, X, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/error-boundary';

type NavItem = { name: string; href: string; icon: LucideIcon; managerOnly?: boolean; adminOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const CRM_NAV: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { name: 'Queue', href: '/crm/queue', icon: ListTodo },
      { name: 'Customers', href: '/crm/customers', icon: Users },
    ],
  },
  {
    label: 'Campaigns',
    items: [
      { name: 'Campaigns', href: '/crm/campaigns', icon: Megaphone, managerOnly: true },
    ],
  },
  {
    label: 'Performance',
    items: [
      { name: 'Leaderboard', href: '/crm/leaderboard', icon: Trophy },
      { name: 'Analytics', href: '/crm/analytics', icon: BarChart3, managerOnly: true },
    ],
  },
  {
    label: 'Admin',
    items: [
      { name: 'Settings', href: '/crm/settings', icon: Settings, adminOnly: true },
    ],
  },
];

function CrmSidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAgent = user?.departmentType === 'crm_senior';
  const isAdmin = !user?.departmentType || user?.role === 'superadmin' || user?.departmentType === 'crm_head';
  const userInitial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'C';

  const handleLogout = () => {
    logout();
    router.push('/admin-login');
    api.logout().catch(() => {});
  };

  const content = (
    <div className="flex h-full w-[220px] flex-col bg-[#1A3625]">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/10 flex-shrink-0">
        <Link href="/crm/queue" className="flex items-center gap-2.5 min-w-0" onClick={onMobileClose}>
          <Image src="/images/logo.png" alt="NatureLite" width={28} height={28} className="object-contain rounded-full flex-shrink-0" />
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-white font-semibold text-[12.5px] tracking-tight truncate">Nature Lite</span>
            <span className="text-[#D4A017]/70 text-[9px] tracking-[0.14em] uppercase font-mono mt-0.5">CRM</span>
          </div>
        </Link>
        <button className="ml-auto md:hidden p-1 text-white/40 hover:text-white/70 shrink-0" onClick={onMobileClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {CRM_NAV.map((group, gi) => {
          const visible = group.items.filter(item => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.managerOnly && isAgent) return false;
            return true;
          });
          if (!visible.length) return null;
          return (
            <div key={gi} className="mt-2 first:mt-1">
              <p className="px-4 pt-2 pb-1 text-[9px] font-semibold text-white/25 uppercase tracking-[0.15em] select-none">
                {group.label}
              </p>
              {visible.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onMobileClose}
                    className={cn(
                      'flex items-center gap-2.5 text-[12.5px] py-[7px] mx-2 px-3 rounded-md transition-colors',
                      isActive
                        ? 'bg-[#7C5C1E] text-white font-medium'
                        : 'text-white/55 hover:text-white/85 hover:bg-white/[0.07]',
                    )}
                  >
                    <item.icon className={cn('h-[13px] w-[13px] flex-shrink-0', isActive ? 'opacity-100' : 'opacity-60')} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-2.5 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-white/[0.06] mb-1.5">
          <div className="h-6 w-6 rounded bg-[#7C5C1E] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-[12px] font-medium truncate leading-tight">{user?.name ?? 'Agent'}</p>
            <p className="text-white/35 text-[10px] font-mono truncate leading-tight">{user?.departmentType ?? user?.role}</p>
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
          {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onMobileClose} />}
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

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAdminAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/admin-login'); return; }
    const allowed: string[] = ['crm_head', 'crm_senior'];
    const hasDept = !!user?.departmentType;
    if (hasDept && !allowed.includes(user.departmentType!)) router.push('/admin');
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen bg-[#FAF7F2]">
      <CrmSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex md:hidden h-12 items-center gap-3 border-b bg-white px-4 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="h-8 w-8">
            <Menu className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm text-gray-800">CRM</span>
        </div>
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
