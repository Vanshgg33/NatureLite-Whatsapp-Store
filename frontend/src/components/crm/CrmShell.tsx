'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Clock, Phone, PhoneCall, Users, MessageCircle, BarChart3, Settings, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';
import { ErrorBoundary } from '@/components/error-boundary';

type NavItem = { name: string; href: string; icon: LucideIcon; adminOnly?: boolean };

const NAV: NavItem[] = [
  { name: 'Today',       href: '/crm',            icon: Clock },
  { name: 'Call queue',  href: '/crm/queue',      icon: Phone },
  { name: 'Caller mode', href: '/crm/caller',     icon: PhoneCall },
  { name: 'Customers',   href: '/crm/customers',  icon: Users },
  { name: 'Campaigns',   href: '/crm/campaigns',  icon: MessageCircle },
  { name: 'Performance', href: '/crm/analytics',  icon: BarChart3 },
  { name: 'Settings',    href: '/crm/settings',   icon: Settings, adminOnly: true },
];

const ROLE_LABEL: Record<string, string> = {
  crm_head:   'CRM Manager',
  crm_senior: 'Senior Agent',
  superadmin: 'Super Admin',
  admin:      'Admin',
};

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAdmin = user?.role === 'superadmin' || user?.departmentType === 'crm_head' || !user?.departmentType;
  const initial = (user?.name?.[0] ?? user?.email?.[0] ?? 'C').toUpperCase();
  const roleLabel = ROLE_LABEL[user?.departmentType ?? user?.role ?? ''] ?? 'Staff';

  const handleLogout = () => {
    logout();
    router.push('/admin-login');
    api.logout().catch(() => {});
  };

  const isActive = (href: string) =>
    href === '/crm' ? pathname === '/crm' : pathname === href || pathname.startsWith(href + '/');

  const content = (
    <div
      className="crm-root flex h-full flex-col"
      style={{ width: 260, background: 'var(--crm-forest)', flexShrink: 0 }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-[18px] flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Link href="/crm" className="flex items-center gap-3 min-w-0 flex-1" onClick={onClose}>
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'var(--crm-gold)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)',
                fontSize: 20, fontWeight: 600,
                color: 'var(--crm-forest)',
              }}
            >
              N
            </span>
          </div>
          <div className="flex flex-col leading-none">
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Nature Lite</span>
            <span style={{ color: 'var(--crm-gold)', fontSize: 9, letterSpacing: '0.14em', marginTop: 3, fontFamily: 'monospace' }}>
              CRM
            </span>
          </div>
        </Link>
        <button
          className="md:hidden p-1 rounded-md"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onClick={onClose}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-hide" aria-label="CRM navigation">
        {NAV.filter(item => !item.adminOnly || isAdmin).map(item => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 mx-2.5 px-3 py-2.5 rounded-xl text-[13px] transition-colors duration-100',
                active ? 'font-bold' : 'font-normal hover:bg-white/[0.06]',
              )}
              style={
                active
                  ? { background: 'var(--crm-gold)', color: 'var(--crm-forest)' }
                  : { color: 'var(--crm-side-text)' }
              }
            >
              <item.icon className="h-[15px] w-[15px] flex-shrink-0" />
              <span className="flex-1">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 px-2.5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2.5 px-3 py-3 rounded-[14px]" style={{ background: 'var(--crm-forest-2)' }}>
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--crm-moss)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)',
                fontSize: 15, fontWeight: 600,
                color: '#fff',
              }}
            >
              {initial}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {user?.name ?? 'Agent'}
            </p>
            <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: 'var(--crm-side-muted)' }}>
              {roleLabel}
            </p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)')}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-shrink-0">{content}</aside>

      {/* Mobile overlay */}
      {mounted && (
        <>
          {open && (
            <div
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              style={{ backdropFilter: 'blur(4px)' }}
              onClick={onClose}
            />
          )}
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50 shadow-2xl transition-transform duration-200 ease-out md:hidden',
              open ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {content}
          </div>
        </>
      )}
    </>
  );
}

export default function CrmShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated } = useAdminAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) { router.push('/admin-login'); return; }
    const allowed = ['crm_head', 'crm_senior'];
    if (user?.departmentType && !allowed.includes(user.departmentType)) router.push('/admin');
  }, [hasHydrated, isAuthenticated, user, router]);

  if (!hasHydrated || !isAuthenticated) return null;

  return (
    <div className="crm-root flex h-screen" style={{ background: 'var(--crm-cream)' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <div
          className="flex md:hidden h-12 items-center gap-3 px-4 flex-shrink-0"
          style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="h-9 w-9 flex items-center justify-center rounded-lg"
            style={{ background: 'var(--crm-sand)' }}
          >
            <Menu className="h-4 w-4" style={{ color: 'var(--crm-ink)' }} />
          </button>
          <span className="font-semibold text-sm" style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans)' }}>
            NatureLite CRM
          </span>
        </div>

        <main className="flex-1 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
