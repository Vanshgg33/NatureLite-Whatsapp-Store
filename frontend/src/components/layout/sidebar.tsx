'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  BarChart3,
  Tag,
  LogOut,
  FolderTree,
  MessageCircle,
  Megaphone,
  MessageSquare,
  Palette,
  Warehouse,
  Receipt,
  Building2,
  MapPin,
  KeyRound,
  Boxes,
  FlaskConical,
  Cog,
  X,
  Sparkles,
  Banknote,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';

type NavItem = { name: string; href: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const BASE_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { name: 'AI Chatbot', href: '/admin/chatbot', icon: Sparkles },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { name: 'Products', href: '/admin/products', icon: Package },
      { name: 'UCM', href: '/admin/ucm', icon: Boxes },
      { name: 'Categories', href: '/admin/categories', icon: FolderTree },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Sales Log', href: '/admin/sales', icon: Receipt },
      { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
      { name: 'Cash Ledger', href: '/admin/delivery-collections', icon: Banknote },
    ],
  },
  {
    label: 'Factory',
    items: [
      { name: 'IMS', href: '/admin/ims', icon: Boxes },
      { name: 'PMS', href: '/admin/pms', icon: Cog },
      { name: 'RMS', href: '/admin/rms', icon: FlaskConical },
    ],
  },
  {
    label: 'Customers',
    items: [
      { name: 'Customers', href: '/admin/customers', icon: Users },
      { name: 'Coupons', href: '/admin/coupons', icon: Tag },
    ],
  },
];

const SUPERADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Analytics',
    items: [
      { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
      { name: 'Stores Dashboard', href: '/admin/stores/dashboard', icon: Building2 },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Manage Stores', href: '/admin/stores', icon: MapPin },
      { name: 'Logins', href: '/admin/logins', icon: KeyRound },
      { name: 'WhatsApp', href: '/admin/whatsapp', icon: MessageCircle },
      { name: 'Campaigns', href: '/admin/campaigns', icon: Megaphone },
      { name: 'Feedback', href: '/admin/feedback', icon: MessageSquare },
      { name: 'Appearance', href: '/admin/appearance', icon: Palette },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

  const navGroups: NavGroup[] = [
    ...BASE_NAV_GROUPS,
    ...(isSuperadmin ? SUPERADMIN_NAV_GROUPS : []),
  ];

  const handleLogout = () => {
    // Redirect instantly — fire API logout in background
    logout();
    router.push('/admin-login');
    api.logout().catch(() => { /* best-effort */ });
  };

  const handleNavClick = () => onMobileClose?.();

  const userInitial = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'A';
  const displayName = user?.name || 'Admin';
  const roleLabel = user?.role === 'superadmin'
    ? 'superadmin'
    : user?.storeName
    ? user.storeName
    : 'admin';

  const sidebarContent = (
    <div className="flex h-full w-64 flex-col bg-[#1E3D2B]">
      {/* Logo area */}
      <div className="relative flex items-center gap-3 px-4 py-5 border-b border-white/10 flex-shrink-0">
        {onMobileClose && (
          <button
            className="absolute right-3 top-3 md:hidden p-1 text-white/40 hover:text-white/70 transition-colors"
            onClick={onMobileClose}
            aria-label="Close menu"
            style={{ transition: 'color 0.1s' }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Link href="/admin/dashboard" className="flex items-center gap-3" onClick={handleNavClick}>
          <Image
            src="/images/logo.png"
            alt="Nature Lite Foods"
            width={36}
            height={36}
            className="object-contain rounded-full flex-shrink-0"
          />
          <div className="flex flex-col leading-none">
            <span className="text-white font-semibold text-[13px] tracking-tight">Nature Lite Foods</span>
            <span className="text-white/35 text-[9px] tracking-[0.1em] uppercase font-mono mt-0.5">
              Admin Panel
            </span>
          </div>
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {navGroups.map((group, gi) => (
          <div key={gi} className="mt-1">
            <p className="px-4 pt-2.5 pb-1 text-[9px] font-mono text-white/30 uppercase tracking-[0.14em] select-none">
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-2.5 text-[13px] py-[7px]',
                    isActive
                      ? 'ml-0 mr-2 pl-5 rounded-r-lg border-l-2 border-[#E8A838] bg-[rgba(232,168,56,0.11)] text-[#E8A838] font-medium'
                      : 'mx-2 px-3 rounded-lg text-white/60 hover:text-white/90 hover:bg-white/[0.06]'
                  )}
                  style={{ transition: 'background-color 0.1s, color 0.1s' }}
                >
                  <item.icon
                    className={cn(
                      'h-[15px] w-[15px] flex-shrink-0',
                      isActive ? 'opacity-100' : 'opacity-65'
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.06] mb-2">
          <div className="h-7 w-7 rounded-md bg-[#2F6B47] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-[12.5px] font-medium truncate leading-tight">
              {displayName}
            </p>
            <p className="text-white/35 text-[10px] font-mono truncate leading-tight">
              {roleLabel}
            </p>
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
      {/* Desktop sidebar — always visible */}
      <aside className="hidden md:flex md:w-64 md:flex-shrink-0 md:flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile drawer — overlay */}
      {isMounted && onMobileClose && (
        <>
          {mobileOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={onMobileClose}
              aria-hidden="true"
            />
          )}
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-64 shadow-2xl transition-transform duration-200 ease-out md:hidden',
              mobileOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
}
