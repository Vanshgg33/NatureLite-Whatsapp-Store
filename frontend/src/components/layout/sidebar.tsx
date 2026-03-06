'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  Store,
  MessageCircle,
  Megaphone,
  MessageSquare,
  Palette,
  Warehouse,
  Receipt,
  Building2,
  MapPin,
  KeyRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

const baseNavigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/admin/products', icon: Package },
  { name: 'Categories', href: '/admin/categories', icon: FolderTree },
  { name: 'Stock Management', href: '/admin/store-stock', icon: Warehouse },
  { name: 'Sales Log', href: '/admin/sales', icon: Receipt },
  { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
  { name: 'Customers', href: '/admin/customers', icon: Users },
  { name: 'Coupons', href: '/admin/coupons', icon: Tag },
];

const superadminOnlyNavigation = [
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { name: 'Stores Dashboard', href: '/admin/stores/dashboard', icon: Building2 },
  { name: 'Manage Stores', href: '/admin/stores', icon: MapPin },
  { name: 'Logins', href: '/admin/logins', icon: KeyRound },
  { name: 'WhatsApp', href: '/admin/whatsapp', icon: MessageCircle },
  { name: 'Campaigns', href: '/admin/campaigns', icon: Megaphone },
  { name: 'Feedback', href: '/admin/feedback', icon: MessageSquare },
  { name: 'Appearance', href: '/admin/appearance', icon: Palette },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onMenuClick?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose, onMenuClick }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

  const navigation = [
    ...baseNavigation,
    ...(isSuperadmin ? superadminOnlyNavigation : []),
  ];

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Continue with logout even if API call fails
    }
    logout();
    router.push('/admin-login');
  };

  const handleNavClick = () => {
    onMobileClose?.();
  };

  const sidebarContent = (
    <div className="flex h-full w-64 flex-col bg-white border-r">
      <div className="relative flex h-16 flex-col items-center justify-center border-b px-4 py-2">
        {onMobileClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 md:hidden"
            onClick={onMobileClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
        <Link href="/admin/dashboard" className="flex items-center gap-2" onClick={handleNavClick}>
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Store className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">Naturelite</span>
        </Link>
        {user?.storeName && (
          <p className="text-xs font-medium text-primary mt-0.5 truncate w-full text-center" title={`${user.storeName} Store`}>
            {user.storeName} Store
          </p>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive ? 'text-primary' : 'text-gray-400 group-hover:text-gray-500'
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'A'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name || 'Admin'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            {user?.storeName && (
              <p className="text-xs text-primary font-medium truncate">{user.storeName} Store</p>
            )}
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );

  // Desktop: always visible sidebar
  const desktopSidebar = (
    <aside className="hidden md:flex md:w-64 md:flex-shrink-0 md:flex-col">
      {sidebarContent}
    </aside>
  );

  // Mobile: drawer overlay (only show when onMobileClose provided - used for mobile)
  const mobileDrawer = isMounted && onMobileClose && (
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
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-xl transition-transform duration-200 ease-out md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </div>
    </>
  );

  return (
    <>
      {desktopSidebar}
      {mobileDrawer}
    </>
  );
}
