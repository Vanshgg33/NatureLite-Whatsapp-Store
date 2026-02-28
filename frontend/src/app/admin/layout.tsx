'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { useAdminAuthStore } from '@/lib/admin-store';
import { ErrorBoundary } from '@/components/error-boundary';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAdminAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin-login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
