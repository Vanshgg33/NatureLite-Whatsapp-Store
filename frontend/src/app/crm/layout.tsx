'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import {
  Users, ListTodo, Megaphone, Trophy, BarChart3, Settings,
  LogOut, Menu, X, LayoutDashboard, ChevronRight, type LucideIcon,
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
      { name: 'Dashboard', href: '/crm', icon: LayoutDashboard, managerOnly: true },
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

const ROLE_LABELS: Record<string, string> = {
  crm_head: 'CRM Manager',
  crm_senior: 'Senior Agent',
  superadmin: 'Super Admin',
  admin: 'Admin',
};

function CrmSidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAgent = user?.departmentType === 'crm_senior';
  const isAdmin = !user?.departmentType || user?.role === 'superadmin' || user?.departmentType === 'crm_head';
  const userInitial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'C';
  const roleLabel = ROLE_LABELS[user?.departmentType ?? user?.role ?? ''] ?? 'Staff';

  const handleLogout = () => {
    logout();
    router.push('/admin-login');
    api.logout().catch(() => {});
  };

  const content = (
    <div className="crm-root flex h-full w-[232px] flex-col" style={{ background: '#0D1F14' }}>
      {/* Brand header */}
      <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Link href="/crm" className="flex items-center gap-3 min-w-0 flex-1" onClick={onMobileClose}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'rgba(212,160,23,0.15)', border: '1px solid rgba(212,160,23,0.25)' }}>
            <Image src="/images/logo.png" alt="NL" width={22} height={22} className="object-contain" />
          </div>
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-white font-semibold text-[13px] tracking-tight truncate" style={{ fontFamily: "'DM Sans', system-ui" }}>Nature Lite</span>
            <span style={{ color: '#D4A017', fontSize: '9px', letterSpacing: '0.2em', fontFamily: 'monospace', marginTop: '2px' }}>CRM SUITE</span>
          </div>
        </Link>
        <button className="md:hidden p-1 rounded-md shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} onClick={onMobileClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {CRM_NAV.map((group, gi) => {
          const visible = group.items.filter(item => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.managerOnly && isAgent) return false;
            return true;
          });
          if (!visible.length) return null;
          return (
            <div key={gi} className="mb-1">
              <p className="px-5 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] select-none" style={{ color: 'rgba(255,255,255,0.22)' }}>
                {group.label}
              </p>
              {visible.map((item) => {
                const isActive = item.href === '/crm' ? pathname === '/crm' : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onMobileClose}
                    className={cn(
                      'flex items-center gap-2.5 text-[13px] py-2 mx-2.5 px-3 rounded-lg transition-all duration-150 group relative',
                      isActive
                        ? 'font-medium'
                        : 'hover:bg-white/[0.05]',
                    )}
                    style={isActive ? {
                      background: 'rgba(212,160,23,0.12)',
                      color: '#E8B930',
                      borderLeft: '2px solid #D4A017',
                      paddingLeft: '10px',
                    } : { color: 'rgba(255,255,255,0.52)' }}
                  >
                    <item.icon className="h-[14px] w-[14px] flex-shrink-0" style={{ opacity: isActive ? 1 : 0.65 }} />
                    <span className="flex-1">{item.name}</span>
                    {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="flex-shrink-0 px-2.5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ background: 'rgba(212,160,23,0.25)', border: '1px solid rgba(212,160,23,0.3)' }}>
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate leading-tight" style={{ color: 'rgba(255,255,255,0.82)' }}>{user?.name ?? 'Agent'}</p>
            <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: '#D4A017', opacity: 0.75 }}>{roleLabel}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-1.5 rounded-md transition-colors shrink-0"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex md:w-[232px] md:flex-shrink-0 md:flex-col">{content}</aside>
      {mounted && (
        <>
          {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm" onClick={onMobileClose} />}
          <div className={cn(
            'fixed inset-y-0 left-0 z-50 w-[232px] shadow-2xl transition-transform duration-200 ease-out md:hidden',
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
  const { user, isAuthenticated, hasHydrated } = useAdminAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) { router.push('/admin-login'); return; }
    const allowed: string[] = ['crm_head', 'crm_senior'];
    const hasDept = !!user?.departmentType;
    if (hasDept && !allowed.includes(user.departmentType!)) router.push('/admin');
  }, [hasHydrated, isAuthenticated, user, router]);

  if (!hasHydrated || !isAuthenticated) return null;

  return (
    <div className="crm-root flex h-screen" style={{ background: '#F7F5F0' }}>
      <CrmSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile topbar */}
        <div className="flex md:hidden h-12 items-center gap-3 px-4 shrink-0 bg-white" style={{ borderBottom: '1px solid #E8E2D9' }}>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="h-8 w-8">
            <Menu className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm" style={{ color: '#1C1917' }}>CRM Suite</span>
        </div>
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
