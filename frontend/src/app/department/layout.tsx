'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuthStore } from '@/lib/admin-store';

export default function DepartmentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAdminAuthStore();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.push('/department-login');
    }
  }, [hasHydrated, isAuthenticated, router]);

  if (!hasHydrated || !isAuthenticated) {
    return null;
  }

  return <div className="min-h-screen bg-gray-50">{children}</div>;
}

