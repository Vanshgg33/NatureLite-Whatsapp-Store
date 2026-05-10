import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Address } from '@/types';

export interface CustomerUser {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  addresses: Address[];
  totalOrders: number;
  totalSpent: number;
}

interface CustomerAuthState {
  customer: CustomerUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  lastVisitedPage: string | null;

  // Actions
  setCustomer: (customer: CustomerUser) => void;
  setTokens: (accessToken: string, refreshToken?: string | null) => void;
  updateCustomer: (updates: Partial<CustomerUser>) => void;
  addAddress: (address: Address) => void;
  updateAddress: (index: number, address: Address) => void;
  removeAddress: (index: number) => void;
  setDefaultAddress: (index: number) => void;
  setLastVisitedPage: (page: string) => void;
  logout: () => void;
}

export const useCustomerStore = create<CustomerAuthState>()(
  persist(
    (set, get) => ({
      customer: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      lastVisitedPage: null,

      setCustomer: (customer) => {
        set({ customer, isAuthenticated: true });
      },

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken: refreshToken ?? null });
      },

      updateCustomer: (updates) => {
        const currentCustomer = get().customer;
        if (!currentCustomer) return;

        set({
          customer: { ...currentCustomer, ...updates },
        });
      },

      addAddress: (address) => {
        const currentCustomer = get().customer;
        if (!currentCustomer) return;

        // If this is the first address or marked as default, set it as default
        const isFirstOrDefault =
          currentCustomer.addresses.length === 0 || address.isDefault;

        const newAddresses = isFirstOrDefault
          ? [
              ...currentCustomer.addresses.map((a) => ({
                ...a,
                isDefault: false,
              })),
              { ...address, isDefault: true },
            ]
          : [...currentCustomer.addresses, address];

        set({
          customer: {
            ...currentCustomer,
            addresses: newAddresses,
          },
        });
      },

      updateAddress: (index, address) => {
        const currentCustomer = get().customer;
        if (!currentCustomer) return;

        const newAddresses = [...currentCustomer.addresses];

        // If setting as default, remove default from others
        if (address.isDefault) {
          newAddresses.forEach((a, i) => {
            if (i !== index) a.isDefault = false;
          });
        }

        newAddresses[index] = address;

        set({
          customer: {
            ...currentCustomer,
            addresses: newAddresses,
          },
        });
      },

      removeAddress: (index) => {
        const currentCustomer = get().customer;
        if (!currentCustomer) return;

        const newAddresses = currentCustomer.addresses.filter(
          (_, i) => i !== index
        );

        // If we removed the default address, make the first one default
        if (
          currentCustomer.addresses[index]?.isDefault &&
          newAddresses.length > 0
        ) {
          newAddresses[0].isDefault = true;
        }

        set({
          customer: {
            ...currentCustomer,
            addresses: newAddresses,
          },
        });
      },

      setDefaultAddress: (index) => {
        const currentCustomer = get().customer;
        if (!currentCustomer) return;

        const newAddresses = currentCustomer.addresses.map((address, i) => ({
          ...address,
          isDefault: i === index,
        }));

        set({
          customer: {
            ...currentCustomer,
            addresses: newAddresses,
          },
        });
      },

      setLastVisitedPage: (page) => {
        set({ lastVisitedPage: page });
      },

      logout: () => {
        set({
          customer: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          lastVisitedPage: null,
        });
      },
    }),
    {
      name: 'customer-auth-storage',
    }
  )
);

// Helper hook for getting default address
export const useDefaultAddress = () => {
  const customer = useCustomerStore((state) => state.customer);
  return customer?.addresses.find((a) => a.isDefault) || customer?.addresses[0];
};
