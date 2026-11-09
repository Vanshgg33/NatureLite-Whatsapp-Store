import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';

// Must match ADMIN_PAGES in backend/src/common/permissions/admin-pages.ts
export const ADMIN_PAGE_HREFS: { page: string; href: string }[] = [
  { page: 'dashboard', href: '/admin/dashboard' },
  { page: 'chatbot', href: '/admin/chatbot' },
  { page: 'products', href: '/admin/products' },
  { page: 'ucm', href: '/admin/ucm' },
  { page: 'categories', href: '/admin/categories' },
  { page: 'sales', href: '/admin/sales' },
  { page: 'orders', href: '/admin/orders' },
  { page: 'delivery_collections', href: '/admin/delivery-collections' },
  { page: 'delivery_history', href: '/admin/delivery-history' },
  { page: 'ims', href: '/admin/ims' },
  { page: 'pms', href: '/admin/pms' },
  { page: 'rms', href: '/admin/rms' },
  { page: 'purchase', href: '/fms/purchase' },
  { page: 'customers', href: '/admin/customers' },
  { page: 'coupons', href: '/admin/coupons' },
  { page: 'billing_new', href: '/billing/new' },
  { page: 'billing_dashboard', href: '/billing/dashboard' },
  { page: 'billing_customers', href: '/billing/customers' },
  { page: 'billing_pricing', href: '/billing/pricing' },
  { page: 'billing_dues', href: '/billing/dues' },
  { page: 'billing_reports', href: '/billing/reports' },
  { page: 'billing_books', href: '/billing/books' },
  { page: 'billing_insights', href: '/billing/insights' },
  { page: 'billing_gstr1', href: '/billing/gstr1' },
  { page: 'billing_tax', href: '/billing/settings/tax' },
];

export const pageForPath = (pathname: string): string | undefined =>
  ADMIN_PAGE_HREFS.find((p) => pathname === p.href || pathname.startsWith(p.href + '/'))?.page;

/**
 * Permissions of the logged-in admin. Superadmins and legacy admins (no access role) are
 * unrestricted: `can()` is always true for them, so existing behaviour is unchanged.
 * `can('orders.edit')` checks `admin.orders.edit`; legacy purchase keys (`can('po.approve')`) work as-is.
 */
export function useAdminAccess() {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const userId = useAdminAuthStore((s) => s.user?.id);
  const { data, isLoading } = useQuery({
    queryKey: ['my-access', userId], // per user, so a new login never sees the previous user's cached access
    queryFn: () => api.getMyAccess(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const restricted = data?.restricted ?? false;
  const perms = new Set(data?.permissions ?? []);

  // Purchase FMS reads legacy keys from the stored user, so mirror the role's grants there.
  useEffect(() => {
    if (!data?.restricted) return;
    const legacy = data.permissions.filter((p) => !p.startsWith('admin.')).sort();
    const { user, setUser } = useAdminAuthStore.getState();
    if (user && JSON.stringify([...(user.permissions ?? [])].sort()) !== JSON.stringify(legacy)) {
      setUser({ ...user, permissions: legacy });
    }
  }, [data]);

  return {
    isLoading: isAuthenticated && isLoading,
    restricted,
    roleName: data?.roleName,
    can: (key: string) => !restricted || perms.has(`admin.${key}`) || perms.has(key),
  };
}
