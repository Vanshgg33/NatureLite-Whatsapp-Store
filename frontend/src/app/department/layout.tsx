'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAdminAuthStore } from '@/lib/admin-store';
import { api } from '@/lib/api';

export default function DepartmentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, hasHydrated, user, logout } = useAdminAuthStore();

  function handleLogout() {
    logout();
    api.logout().catch(() => {});
    router.push('/department-login');
  }

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.push('/department-login');
      return;
    }
    // Prevent department users from accessing another department's page
    if (user?.departmentType) {
      const ownPath = `/department/${user.departmentType}`;
      if (pathname !== ownPath && !pathname.startsWith(ownPath + '/') && !pathname.startsWith('/department/order')) {
        router.replace(ownPath);
      }
    }
  }, [hasHydrated, isAuthenticated, user, pathname, router]);

  if (!hasHydrated) {
    // Render the page background colour instead of nothing — prevents a white
    // flash on slow phones while Zustand reads the auth state from localStorage.
    return <div className="min-h-screen bg-gray-50" />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {children}
      <button
        onClick={handleLogout}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-white border border-red-200 text-red-600 shadow-md px-4 py-2 text-sm font-medium hover:bg-red-50 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </div>
  );
}

