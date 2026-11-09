'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ADMIN_PAGE_HREFS, pageForPath, useAdminAccess } from '@/lib/admin-access';

/**
 * Blocks pages a custom-role user can't View (also covers direct URL entry).
 * Unlisted paths are allowed unless `blockUnlisted` (used for /admin, where unlisted = superadmin-only pages).
 */
export function AccessGate({ children, blockUnlisted = false }: { children: React.ReactNode; blockUnlisted?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const access = useAdminAccess();

  const page = pageForPath(pathname);
  // Unlisted Billing pages (invoice, root, ...) need at least one Billing view permission.
  const anyBilling = ADMIN_PAGE_HREFS.some((p) => p.page.startsWith('billing_') && access.can(`${p.page}.view`));
  const unlistedBlocked = pathname.startsWith('/billing') ? !anyBilling : blockUnlisted && pathname !== '/admin';
  const blocked = !access.isLoading && access.restricted && (page ? !access.can(`${page}.view`) : unlistedBlocked);
  const firstAllowed = ADMIN_PAGE_HREFS.find((p) => access.can(`${p.page}.view`));
  const isLanding = pathname === '/admin' || pathname === '/admin/dashboard';

  useEffect(() => {
    if (blocked && isLanding && firstAllowed) router.replace(firstAllowed.href);
  }, [blocked, isLanding, firstAllowed?.href, router]); // eslint-disable-line react-hooks/exhaustive-deps

  if (access.isLoading || (blocked && isLanding && firstAllowed)) return null; // no flash of a page the role may not allow
  if (!blocked) return <>{children}</>;
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <ShieldOff className="h-8 w-8 text-gray-400" />
      <h2 className="text-lg font-semibold text-gray-900">No access</h2>
      <p className="max-w-sm text-sm text-gray-500">
        Your role ({access.roleName ?? 'custom'}) doesn&apos;t include this page. Ask a superadmin to update your access.
      </p>
      {firstAllowed && (
        <Button variant="outline" onClick={() => router.push(firstAllowed.href)}>
          Go to an allowed page
        </Button>
      )}
    </div>
  );
}
