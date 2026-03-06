'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WishlistItem {
  productId: string;
  slug: string;
  name: string;
  image?: string;
  price: number;
}

interface WishlistState {
  items: WishlistItem[];
  add: (item: WishlistItem) => void;
  remove: (productId: string) => void;
  toggle: (item: WishlistItem) => void;
  isInWishlist: (productId: string) => boolean;
  clear: () => void;
  setItems: (items: WishlistItem[]) => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        if (get().items.some((i) => i.productId === item.productId)) return;
        set((state) => ({ items: [...state.items, item] }));
      },
      remove: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        }));
      },
      toggle: (item) => {
        const exists = get().items.some((i) => i.productId === item.productId);
        if (exists) {
          get().remove(item.productId);
        } else {
          get().add(item);
        }
      },
      isInWishlist: (productId) => get().items.some((i) => i.productId === productId),
      clear: () => set({ items: [] }),
      setItems: (items) => set({ items }),
    }),
    {
      name: 'wishlist-storage',
    },
  ),
);

