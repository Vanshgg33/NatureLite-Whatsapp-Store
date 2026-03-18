'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, Tag, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
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

/**
 * Promo bar: shows live store settings + active coupons from admin.
 * - Free shipping threshold from public settings
 * - Active coupons from /coupons/active
 */
export function PromoBar() {
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

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
        setCoupons(activeCoupons || []);
      } catch (error) {
        console.error('Failed to load promo data:', error);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const primaryCoupon = coupons[0];
  const secondaryCoupon = coupons[1];

  const hasAnyCoupon = Boolean(primaryCoupon);

  return (
    <div className="relative z-[55] bg-brand-charcoal text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs sm:text-sm font-medium">
        {/* Free shipping threshold from settings (fallback 499) */}
        <span className="inline-flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-brand-mustard" />
          Free shipping over ₹{(freeShippingThreshold ?? 499).toLocaleString()}
        </span>

        {hasAnyCoupon && <span className="hidden sm:inline text-white/40">·</span>}

        {/* Primary active coupon */}
        {primaryCoupon && (
          <span className="inline-flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-brand-mustard" />
            <span>{formatCoupon(primaryCoupon)}</span>
          </span>
        )}

        {/* Optional second coupon (if present) */}
        {secondaryCoupon && (
          <>
            <span className="hidden sm:inline text-white/40">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-brand-mustard" />
              <span>{formatCoupon(secondaryCoupon)}</span>
            </span>
          </>
        )}

        {/* WhatsApp contact stays at the end */}
        <span className="hidden sm:inline text-white/40">·</span>
        <Link
          href="https://wa.me/919999999999"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-white/90 hover:text-brand-mustard transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp us
        </Link>
      </div>
    </div>
  );
}
