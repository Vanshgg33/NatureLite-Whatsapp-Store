import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from './api';

export interface CartItem {
  productId: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  compareAtPrice?: number;
  quantity: number;
  variantSku?: string;
  variantName?: string;
  gstPercentage: number;
}

interface CartState {
  items: CartItem[];
  couponCode: string | null;
  discount: number;
  discountType: 'percentage' | 'fixed' | null;
  isLoading: boolean;
  isSynced: boolean;

  // Actions
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => Promise<void>;
  removeItem: (productId: string, variantSku?: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number, variantSku?: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<{ success: boolean; message?: string }>;
  removeCoupon: () => Promise<void>;
  clearCart: () => Promise<void>;
  syncWithServer: () => Promise<void>;
  setLocalCoupon: (code: string, discount: number, type: 'percentage' | 'fixed') => void;

  // Computed values (as functions for Zustand compatibility)
  getSubtotal: () => number;
  getGstTotal: () => number;
  getDiscountAmount: () => number;
  getTotal: () => number;
  getItemCount: () => number;
  getItemByProductId: (productId: string, variantSku?: string) => CartItem | undefined;
}

// Helper to check if user is authenticated
const isAuthenticated = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('customer-token');
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      couponCode: null,
      discount: 0,
      discountType: null,
      isLoading: false,
      isSynced: false,

      addItem: async (item, quantity = 1) => {
        // Optimistic update for local state
        set((state) => {
          const existingItemIndex = state.items.findIndex(
            (i) =>
              i.productId === item.productId &&
              i.variantSku === item.variantSku
          );

          if (existingItemIndex > -1) {
            const newItems = [...state.items];
            newItems[existingItemIndex].quantity += quantity;
            return { items: newItems };
          }

          return {
            items: [...state.items, { ...item, quantity }],
          };
        });

        // Sync with server if authenticated
        if (isAuthenticated()) {
          try {
            await api.addToCart(item.productId, quantity, item.variantSku);
          } catch (error) {
            console.error('Failed to sync cart with server:', error);
            // Cart is still updated locally
          }
        }
      },

      removeItem: async (productId, variantSku) => {
        // Optimistic update
        set((state) => ({
          items: state.items.filter(
            (item) =>
              !(item.productId === productId && item.variantSku === variantSku)
          ),
        }));

        // Sync with server if authenticated
        if (isAuthenticated()) {
          try {
            await api.removeFromCart(productId, variantSku);
          } catch (error) {
            console.error('Failed to sync cart removal with server:', error);
          }
        }
      },

      updateQuantity: async (productId, quantity, variantSku) => {
        if (quantity <= 0) {
          await get().removeItem(productId, variantSku);
          return;
        }

        // Optimistic update
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId && item.variantSku === variantSku
              ? { ...item, quantity }
              : item
          ),
        }));

        // Sync with server if authenticated
        if (isAuthenticated()) {
          try {
            await api.updateCartItem(productId, quantity, variantSku);
          } catch (error) {
            console.error('Failed to sync cart update with server:', error);
          }
        }
      },

      applyCoupon: async (code: string) => {
        if (!isAuthenticated()) {
          // For guests, just validate locally (can't apply server-side)
          return { success: false, message: 'Please login to apply coupon' };
        }

        set({ isLoading: true });
        try {
          const result = await api.applyCartCoupon(code);
          set({
            couponCode: result.couponCode || code,
            discount: result.discount,
            discountType: result.discount > 0 ? 'fixed' : null, // Server returns calculated discount
            isLoading: false,
          });
          return { success: true };
        } catch (error: unknown) {
          set({ isLoading: false });
          const err = error as { response?: { data?: { message?: string } } };
          return {
            success: false,
            message: err.response?.data?.message || 'Invalid coupon code'
          };
        }
      },

      removeCoupon: async () => {
        set({
          couponCode: null,
          discount: 0,
          discountType: null,
        });

        if (isAuthenticated()) {
          try {
            await api.removeCartCoupon();
          } catch (error) {
            console.error('Failed to remove coupon from server:', error);
          }
        }
      },

      setLocalCoupon: (code, discount, type) => {
        set({
          couponCode: code,
          discount,
          discountType: type,
        });
      },

      clearCart: async () => {
        set({
          items: [],
          couponCode: null,
          discount: 0,
          discountType: null,
        });

        if (isAuthenticated()) {
          try {
            await api.clearCart();
          } catch (error) {
            console.error('Failed to clear server cart:', error);
          }
        }
      },

      syncWithServer: async () => {
        if (!isAuthenticated()) {
          set({ isSynced: false });
          return;
        }

        set({ isLoading: true });
        try {
          const serverCart = await api.getCart();

          // Get current local items
          const localItems = get().items;

          // If we have local items and server is empty, push local to server
          if (localItems.length > 0 && serverCart.items.length === 0) {
            for (const item of localItems) {
              try {
                await api.addToCart(item.productId, item.quantity, item.variantSku);
              } catch (e) {
                console.error('Failed to sync item to server:', e);
              }
            }
          } else if (serverCart.items.length > 0) {
            // Server has items, use server state
            // Convert server cart items to local format
            const items: CartItem[] = serverCart.items.map((item) => ({
              productId: typeof item.product === 'string' ? item.product : item.product._id,
              name: item.name,
              slug: '', // Will need to be fetched or stored in cart
              image: item.image || '',
              price: item.price,
              quantity: item.quantity,
              variantSku: item.variantSku,
              gstPercentage: 5, // Default GST
            }));

            set({
              items,
              couponCode: serverCart.couponCode || null,
              discount: serverCart.discount || 0,
              discountType: serverCart.discount ? 'fixed' : null,
            });
          }

          set({ isSynced: true, isLoading: false });
        } catch (error) {
          console.error('Failed to sync with server:', error);
          set({ isLoading: false });
        }
      },

      getSubtotal: () => {
        const state = get();
        return state.items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
      },

      getGstTotal: () => {
        const state = get();
        return state.items.reduce((sum, item) => {
          const itemTotal = item.price * item.quantity;
          const gstAmount = (itemTotal * item.gstPercentage) / 100;
          return sum + gstAmount;
        }, 0);
      },

      getDiscountAmount: () => {
        const state = get();
        const subtotal = state.getSubtotal();

        if (!state.couponCode || !state.discountType) return 0;

        if (state.discountType === 'percentage') {
          return (subtotal * state.discount) / 100;
        }

        return Math.min(state.discount, subtotal);
      },

      getTotal: () => {
        const state = get();
        const subtotal = state.getSubtotal();
        const gst = state.getGstTotal();
        const discount = state.getDiscountAmount();
        return subtotal + gst - discount;
      },

      getItemCount: () => {
        const state = get();
        return state.items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getItemByProductId: (productId, variantSku) => {
        const state = get();
        return state.items.find(
          (item) =>
            item.productId === productId && item.variantSku === variantSku
        );
      },
    }),
    {
      name: 'cart-storage',
    }
  )
);

// Hook to sync cart when auth state changes
export const useSyncCartOnAuth = () => {
  const syncWithServer = useCartStore((state) => state.syncWithServer);
  return syncWithServer;
};
