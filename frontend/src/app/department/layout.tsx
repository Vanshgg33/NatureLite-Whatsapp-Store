'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAdminAuthStore } from '@/lib/admin-store';

export default function DepartmentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, hasHydrated, user } = useAdminAuthStore();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.push('/department-login');
      return;
    }
    // Prevent department users from accessing another department's page
    if (user?.departmentType) {
      const ownPath = `/department/${user.departmentType}`;
      if (pathname !== ownPath && !pathname.startsWith('/department/order')) {
        router.replace(ownPath);
      }
    }
  }, [hasHydrated, isAuthenticated, user, pathname, router]);

  if (!hasHydrated || !isAuthenticated) {
    return null;
  }

  return <div className="min-h-screen bg-gray-50">{children}</div>;
}

