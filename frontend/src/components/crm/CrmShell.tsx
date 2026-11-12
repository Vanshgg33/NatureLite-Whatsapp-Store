'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Menu, X, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';
import { ErrorBoundary } from '@/components/error-boundary';
import { AccessGate } from '@/components/access-gate';
import { useAdminAccess } from '@/lib/admin-access';
import { NAV_GROUPS } from './nav.config';

const ROLE_LABEL: Record<string, string> = {
  crm_head:    'CRM Head',
  crm_manager: 'CRM Manager',
  crm_senior:  'Senior Agent',
  crm_viewer:  'Viewer',
  superadmin:  'Super Admin',
  admin:       'Admin',
};

type Prefs = { collapsed: boolean; closed: string[] };
const LS_KEY = 'crm-sidebar';
const readPrefs = (): Prefs => {
  try { return { collapsed: false, closed: [], ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') }; }
  catch { return { collapsed: false, closed: [] }; }
};

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const [mounted, setMounted] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ collapsed: false, closed: [] });
  useEffect(() => { setMounted(true); setPrefs(readPrefs()); }, []);
  const savePrefs = (next: Prefs) => {
    setPrefs(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* storage blocked: choice not remembered */ }
  };

  const access = useAdminAccess();
  const { data: complaintSummary } = useQuery({
    queryKey: ['crm-complaints', 'summary'],
    queryFn: () => api.getCrmComplaintSummary(),
    enabled: mounted && (!access.restricted || access.can('crm_complaints.view')),
    refetchInterval: 60_000,
  });
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

  const renderSidebar = (rail: boolean) => (
    <div
      className="crm-root flex h-full flex-col"
      style={{ width: rail ? 72 : 260, background: 'var(--crm-forest)', flexShrink: 0, transition: 'width 200ms' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-[18px] flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Link href="/crm" className="flex items-center gap-3 min-w-0 flex-1" onClick={onClose}>
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--crm-gold)' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)',
                fontSize: 20, fontWeight: 600, color: 'var(--crm-forest)',
              }}
            >
              N
            </span>
          </div>
          {!rail && (
            <div className="flex flex-col leading-none">
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Nature Lite</span>
              <span style={{ color: 'var(--crm-gold)', fontSize: 9, letterSpacing: '0.14em', marginTop: 3, fontFamily: 'monospace' }}>
                CRM
              </span>
            </div>
          )}
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
        {NAV_GROUPS.map(group => {
          const items = group.items.filter(item =>
            access.restricted ? !!item.page && access.can(`${item.page}.view`) : !item.adminOnly || isAdmin);
          if (!items.length) return null;
          // the group holding the active page stays open
          const folded = !rail && prefs.closed.includes(group.label) && !items.some(i => isActive(i.href));
          return (
            <div key={group.label} className="mb-1">
              {rail ? (
                <div className="mx-4 my-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
              ) : (
                <button
                  onClick={() => savePrefs({
                    ...prefs,
                    closed: prefs.closed.includes(group.label) ? prefs.closed.filter(g => g !== group.label) : [...prefs.closed, group.label],
                  })}
                  aria-expanded={!folded}
                  className="flex w-full items-center justify-between px-5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--crm-side-muted)' }}
                >
                  {group.label}
                  <ChevronDown className="h-3 w-3 transition-transform" style={{ transform: folded ? 'rotate(-90deg)' : undefined }} />
                </button>
              )}
              {!folded && items.map(item => {
                const active = isActive(item.href);
                const badge = item.badge === 'complaints' ? complaintSummary?.open ?? 0 : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    title={rail ? item.label : undefined}
                    aria-label={rail ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 mx-2.5 px-3 py-2 rounded-xl text-[13px] transition-colors duration-100',
                      rail && 'justify-center',
                      active ? 'font-bold' : 'font-normal hover:bg-white/[0.06]',
                    )}
                    style={active ? { background: 'var(--crm-gold)', color: 'var(--crm-forest)' } : { color: 'var(--crm-side-text)' }}
                  >
                    <item.icon className="h-[15px] w-[15px] flex-shrink-0" />
                    {!rail && <span className="flex-1">{item.label}</span>}
                    {!rail && badge > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
                        style={{ background: complaintSummary!.overdue > 0 ? 'var(--crm-danger)' : active ? 'var(--crm-forest)' : 'var(--crm-gold)', color: active ? 'var(--crm-gold)' : '#fff' }}>
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 px-2.5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={() => savePrefs({ ...prefs, collapsed: !prefs.collapsed })}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          className="mb-2 hidden w-full items-center justify-center rounded-lg p-1.5 md:flex hover:bg-white/[0.06]"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {rail ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <div className={cn('flex items-center gap-2.5 py-3 rounded-[14px]', rail ? 'justify-center px-1' : 'px-3')} style={{ background: 'var(--crm-forest-2)' }}>
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--crm-moss)' }}
            title={rail ? `${user?.name ?? 'Agent'} · ${roleLabel}` : undefined}
          >
            <span style={{ fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)', fontSize: 15, fontWeight: 600, color: '#fff' }}>
              {initial}
            </span>
          </div>
          {!rail && (
            <>
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
            </>
          )}
        </div>
        {!rail && (user?.departmentType === 'crm_senior' || user?.departmentType === 'crm_manager' || user?.departmentType === 'crm_viewer') && (
          <p className="text-[10px] text-center px-3 pb-2 mt-1 leading-tight" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Your CRM activity is monitored
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-shrink-0">{renderSidebar(prefs.collapsed)}</aside>

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
            {renderSidebar(false)}
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
    const allowed = ['crm_head', 'crm_manager', 'crm_senior', 'crm_viewer'];
    if (user?.departmentType && !allowed.includes(user.departmentType)) router.push('/admin');
  }, [hasHydrated, isAuthenticated, user, router]);

  const crmRoles = ['crm_head', 'crm_manager', 'crm_senior', 'crm_viewer'];
  const isCrmEmployee = isAuthenticated && !!user?.departmentType && crmRoles.includes(user.departmentType);

  useEffect(() => {
    if (!isCrmEmployee) return;
    api.crmHeartbeat().catch(() => {});
    const id = setInterval(() => api.crmHeartbeat().catch(() => {}), 60_000);
    return () => clearInterval(id);
  }, [isCrmEmployee]);

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
          <AccessGate>
            <ErrorBoundary>{children}</ErrorBoundary>
          </AccessGate>
        </main>
      </div>
    </div>
  );
}
