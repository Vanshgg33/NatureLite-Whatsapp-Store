import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminUser {
  id: string;
  email?: string;
  name?: string;
  role: 'admin' | 'superadmin' | 'customer';
  storeId?: string;
  storeName?: string;
  departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';
  purchaseRole?: 'requester' | 'po_creator' | 'approver' | 'receiver';
}

interface AdminAuthState {
  user: AdminUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setUser: (user: AdminUser) => void;
  setTokens: (accessToken: string, refreshToken?: string | null) => void;
  logout: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken: refreshToken ?? null }),
      logout: () => {
        // Cookie is cleared by calling api.logout() separately
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'admin-auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
