import { create } from 'zustand';
import type { Coupon } from '@/types';

interface CouponStore {
  activeCoupons: Coupon[];
  setActiveCoupons: (coupons: Coupon[]) => void;
}

export const useCouponStore = create<CouponStore>((set) => ({
  activeCoupons: [],
  setActiveCoupons: (coupons) => set({ activeCoupons: coupons }),
}));
