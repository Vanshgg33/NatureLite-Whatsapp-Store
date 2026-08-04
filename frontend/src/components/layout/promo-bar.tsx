'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, Tag, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useCouponStore } from '@/lib/coupon-store';
import type { Coupon } from '@/types';

function formatCoupon(coupon: Coupon): string {
  const base =
    coupon.discountType === 'percentage'
      ? `${coupon.code.toUpperCase()} — ${coupon.discountValue}% off`
      : `${coupon.code.toUpperCase()} — ₹${coupon.discountValue.toLocaleString()} off`;

  const parts: string[] = [base];

  if (coupon.minOrderAmount) {
    parts.push(`on ₹${coupon.minOrderAmount.toLocaleString()}+`);
  }

  if (coupon.isFirstOrderOnly) {
    parts.push('first order only');
  }

  return parts.join(' ');
}

function isCouponActive(coupon: Coupon, now = new Date()): boolean {
  const validFrom = new Date(coupon.validFrom);
  const validUntil = new Date(coupon.validUntil);
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const hasUsageLeft =
    !coupon.maxUsageCount || coupon.usedCount < coupon.maxUsageCount;

  return (
    coupon.isActive &&
    validFrom <= now &&
    validUntil >= startOfToday &&
    hasUsageLeft
  );
}

/**
 * Promo bar: shows live store settings + active coupons from admin.
 * - Free shipping threshold from public settings
 * - Active coupons from /coupons/active
 */
export function PromoBar() {
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const setActiveCoupons = useCouponStore((s) => s.setActiveCoupons);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [publicSettings, activeCoupons] = await Promise.all([
          api.getPublicSettings(),
          api.getActiveCoupons(),
        ]);

        if (!isMounted) return;

        const threshold = publicSettings.store?.freeShippingThreshold;
        setFreeShippingThreshold(typeof threshold === 'number' ? threshold : null);
        const active = (activeCoupons || []).filter((coupon) => isCouponActive(coupon));
        setCoupons(active);
        setActiveCoupons(active);
      } catch (error) {
        console.error('Failed to load promo data:', error);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [setActiveCoupons]);

  const primaryCoupon = coupons[0];
  const secondaryCoupon = coupons[1];

  const hasAnyCoupon = Boolean(primaryCoupon);

  return (
    <div className="relative z-[55] bg-brand-charcoal text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-center gap-x-4 sm:gap-x-6 gap-y-0.5 text-xs sm:text-sm font-medium overflow-hidden">
        {/* Free shipping — always visible */}
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <Truck className="w-3.5 h-3.5 text-brand-mustard" />
          Free shipping over ₹{(freeShippingThreshold ?? 499).toLocaleString()}
        </span>

        {/* Primary coupon — hidden on mobile */}
        {primaryCoupon && (
          <>
            <span className="hidden sm:inline text-white/40">·</span>
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-brand-mustard" />
              <span>{formatCoupon(primaryCoupon)}</span>
            </span>
          </>
        )}

        {/* Second coupon — desktop only */}
        {secondaryCoupon && (
          <>
            <span className="hidden lg:inline text-white/40">·</span>
            <span className="hidden lg:inline-flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-brand-mustard" />
              <span>{formatCoupon(secondaryCoupon)}</span>
            </span>
          </>
        )}

        {/* WhatsApp — shown as icon only on mobile, full text on sm+ */}
        <span className="hidden sm:inline text-white/40">·</span>
        <Link
          href="https://wa.me/918817200740"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-white/90 hover:text-brand-mustard transition-colors shrink-0"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">WhatsApp us</span>
        </Link>
      </div>
    </div>
  );
}
