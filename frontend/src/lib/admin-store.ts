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
  hasHydrated: boolean;
  setUser: (user: AdminUser) => void;
  logout: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      logout: () => {
        // Cookie is cleared by calling api.logout() separately
        set({ user: null, isAuthenticated: false });
      },
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'admin-auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
