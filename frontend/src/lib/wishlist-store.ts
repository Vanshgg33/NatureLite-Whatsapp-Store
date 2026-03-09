'use client';

import { create } from 'zustand';
import { api } from './api';

export interface WishlistItem {
  productId: string;
  slug: string;
  name: string;
  image?: string;
  price: number;
}

interface WishlistState {
  items: WishlistItem[];
  add: (item: WishlistItem) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  toggle: (item: WishlistItem) => Promise<void>;
  isInWishlist: (productId: string) => boolean;
  clear: () => Promise<void>;
  setItems: (items: WishlistItem[]) => void;
}

export const useWishlistStore = create<WishlistState>()((set, get) => ({
  items: [],
  add: async (item) => {
    if (get().items.some((i) => i.productId === item.productId)) return;

    set((state) => ({ items: [...state.items, item] }));

    try {
      await api.addToWishlist(item.productId);
    } catch {
      // Rollback on failure
      set((state) => ({
        items: state.items.filter((i) => i.productId !== item.productId),
      }));
    }
  },
  remove: async (productId) => {
    const prevItems = get().items;
    set((state) => ({
      items: state.items.filter((i) => i.productId !== productId),
    }));

    try {
      await api.removeFromWishlist(productId);
    } catch {
      // Rollback on failure
      set({ items: prevItems });
    }
  },
  toggle: async (item) => {
    const exists = get().items.some((i) => i.productId === item.productId);
    if (exists) {
      await get().remove(item.productId);
    } else {
      await get().add(item);
    }
  },
  isInWishlist: (productId) => get().items.some((i) => i.productId === productId),
  clear: async () => {
    const prevItems = get().items;
    set({ items: [] });
    try {
      await api.clearWishlist();
    } catch {
      set({ items: prevItems });
    }
  },
  setItems: (items) => set({ items }),
}));


