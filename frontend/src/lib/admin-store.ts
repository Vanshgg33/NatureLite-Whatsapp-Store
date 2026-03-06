import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminUser {
  id: string;
  email?: string;
  name?: string;
  role: 'admin' | 'superadmin' | 'customer';
  storeId?: string;
  storeName?: string;
  departmentType?: 'packing' | 'billing' | 'delivery';
}

interface AdminAuthState {
  user: AdminUser | null;
  isAuthenticated: boolean;
  setUser: (user: AdminUser) => void;
  logout: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      logout: () => {
        // Cookie is cleared by calling api.logout() separately
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'admin-auth-storage',
    }
  )
);
