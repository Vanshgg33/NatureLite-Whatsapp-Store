import { useAdminAuthStore } from '@/lib/admin-store';
import { useAdminAccess } from '@/lib/admin-access';
import type { NavItem } from './nav.config';

/** One rule for "can this user see this CRM page", shared by the sidebar and the ⌘K palette. */
export function useNavVisibility() {
  const user = useAdminAuthStore(s => s.user);
  const access = useAdminAccess();
  const isAdmin = user?.role === 'superadmin' || user?.departmentType === 'crm_head' || !user?.departmentType;
  return (item: NavItem) => (access.restricted ? !!item.page && access.can(`${item.page}.view`) : !item.adminOnly || isAdmin);
}
