import { create } from 'zustand';
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

export const useCartStore = create<CartState>()(
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

        // Attempt to sync with server; ignore 401 for guests
        try {
          await api.addToCart(item.productId, quantity, item.variantSku);
        } catch (error) {
          console.error('Failed to sync cart with server:', error);
          // For authenticated users, try to resync full cart
          await get().syncWithServer();
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

        try {
          await api.removeFromCart(productId, variantSku);
        } catch (error) {
          console.error('Failed to sync cart removal with server:', error);
          await get().syncWithServer();
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

        try {
          await api.updateCartItem(productId, quantity, variantSku);
        } catch (error) {
          console.error('Failed to sync cart update with server:', error);
          await get().syncWithServer();
        }
      },

      applyCoupon: async (code: string) => {
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

        try {
          await api.removeCartCoupon();
        } catch (error) {
          console.error('Failed to remove coupon from server:', error);
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

        try {
          await api.clearCart();
          // Ensure local state matches server after clear
          await get().syncWithServer();
        } catch (error) {
          console.error('Failed to clear server cart:', error);
        }
      },

      syncWithServer: async () => {
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

            // If guest had a locally-applied coupon, try to apply it server-side after login
            const { couponCode, discount, discountType } = get();
            if (couponCode && discount > 0 && discountType === 'fixed') {
              try {
                const updated = await api.applyCartCoupon(couponCode);
                set({
                  couponCode: updated.couponCode || couponCode,
                  discount: updated.discount,
                  discountType: updated.discount > 0 ? 'fixed' : null,
                });
              } catch (e) {
                console.error('Failed to sync coupon to server:', e);
                // If server rejects the coupon, clear it to avoid inconsistent totals
                set({
                  couponCode: null,
                  discount: 0,
                  discountType: null,
                });
              }
            }
          } else if (serverCart.items.length > 0) {
            // Server has items, use server state
            // Convert server cart items to local format
            const items: CartItem[] = serverCart.items.map((item) => {
              type ProductRef = string | { id?: string; _id?: string; name?: string; slug?: string; image?: string };
              const productObj = item.product as ProductRef;
              const productId =
                typeof productObj === 'string'
                  ? productObj
                  : productObj.id || productObj._id || '';

              return {
                productId,
                name: (typeof productObj === 'object' ? productObj.name : undefined) || '',
                slug: (typeof productObj === 'object' ? productObj.slug : undefined) || '',
                image: (typeof productObj === 'object' ? productObj.image : undefined) || '',
                price: item.price,
                quantity: item.quantity,
                variantSku: item.variantSku,
                gstPercentage: 5, // Default GST
              };
            });

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
        const discount = state.getDiscountAmount();
        return subtotal - discount;
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
    })
);

// Hook to sync cart when auth state changes
export const useSyncCartOnAuth = () => {
  const syncWithServer = useCartStore((state) => state.syncWithServer);
  return syncWithServer;
};
