'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { useAdminAuthStore } from '@/lib/admin-store';
import { ErrorBoundary } from '@/components/error-boundary';
import { Button } from '@/components/ui/button';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, hasHydrated } = useAdminAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Wait for persisted auth state to rehydrate from localStorage before deciding.
    // Redirecting during the initial render race creates a login <-> admin loop.
    if (!hasHydrated) return;

    if (!isAuthenticated) {
      router.push('/admin-login');
      return;
    }

    if (user?.departmentType) {
      if (user.departmentType === 'packing' && !pathname.startsWith('/department/packing')) {
        router.replace('/department/packing');
      } else if (
        user.departmentType === 'billing' &&
        !pathname.startsWith('/department/billing')
      ) {
        router.replace('/department/billing');
      } else if (
        user.departmentType === 'delivery' &&
        !pathname.startsWith('/department/delivery')
      ) {
        router.replace('/department/delivery');
      }
    }
  }, [hasHydrated, isAuthenticated, user, pathname, router]);

  if (!hasHydrated || !isAuthenticated || user?.departmentType) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-background">
      <Sidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="flex md:hidden h-14 items-center gap-3 border-b bg-white px-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-gray-900">Admin</span>
        </div>
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
