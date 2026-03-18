'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuthStore } from '@/lib/admin-store';

export default function DepartmentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated } = useAdminAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/department-login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  return <div className="min-h-screen bg-gray-50">{children}</div>;
}

