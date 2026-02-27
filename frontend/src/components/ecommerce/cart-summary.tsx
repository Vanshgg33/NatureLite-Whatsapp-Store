'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Tag, Truck, ShieldCheck, ArrowRight, X, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCartStore } from '@/lib/cart-store';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CartSummaryProps {
  showCheckoutButton?: boolean;
  className?: string;
}

export function CartSummary({
  showCheckoutButton = true,
  className,
}: CartSummaryProps) {
  const {
    couponCode,
    discount,
    discountType,
    getSubtotal,
    getGstTotal,
    getDiscountAmount,
    getTotal,
    applyCoupon,
    removeCoupon,
  } = useCartStore();

  const [couponInput, setCouponInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const subtotal = getSubtotal();
  const gst = getGstTotal();
  const discountAmount = getDiscountAmount();
  const total = getTotal();

  const [shippingSettings, setShippingSettings] = useState({ freeShippingThreshold: 999, defaultShippingCharge: 50 });
  useEffect(() => {
    api.getPublicSettings().then((settings: any) => {
      if (settings?.store) {
        setShippingSettings({
          freeShippingThreshold: settings.store.freeShippingThreshold ?? 999,
          defaultShippingCharge: settings.store.defaultShippingCharge ?? 50,
        });
      }
    }).catch(() => {});
  }, []);

  const freeShippingThreshold = shippingSettings.freeShippingThreshold;
  const shippingCost = subtotal >= freeShippingThreshold ? 0 : shippingSettings.defaultShippingCharge;
  const amountToFreeShipping = freeShippingThreshold - subtotal;

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;

    setIsValidating(true);
    try {
      // First validate the coupon
      const validationResult = await api.validateCoupon(couponInput, subtotal);

      if (validationResult.valid && validationResult.discount) {
        // Apply coupon using store method (syncs with server if authenticated)
        const result = await applyCoupon(couponInput);

        if (result.success) {
          setCouponInput('');
          toast({
            title: 'Coupon applied!',
            description: `You saved ${formatPrice(validationResult.discount)}`,
          });
        } else {
          // Fallback: set local coupon for guests
          const { setLocalCoupon } = useCartStore.getState();
          setLocalCoupon(
            couponInput,
            validationResult.discount,
            (validationResult.discountType || 'fixed') as 'fixed' | 'percentage'
          );
          setCouponInput('');
          toast({
            title: 'Coupon applied!',
            description: result.message || `You saved ${formatPrice(validationResult.discount)}`,
          });
        }
      } else {
        toast({
          title: 'Invalid coupon',
          description: validationResult.message || 'This coupon is not valid',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not validate coupon. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemoveCoupon = async () => {
    await removeCoupon();
    toast({
      title: 'Coupon removed',
    });
  };

  return (
    <div className={cn('bg-white rounded-2xl p-6 shadow-brand-sm', className)}>
      <h3 className="font-display text-xl font-semibold text-brand-charcoal mb-6">
        Order Summary
      </h3>

      {/* Coupon Input */}
      {!couponCode ? (
        <div className="mb-6">
          <label className="font-body text-sm text-brand-text mb-2 block">
            Have a coupon?
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <Input
                type="text"
                placeholder="Enter coupon code"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                className="pl-10 bg-brand-sand border-0"
              />
            </div>
            <Button
              onClick={handleApplyCoupon}
              disabled={isValidating || !couponInput.trim()}
              variant="outline"
              className="border-brand-charcoal"
            >
              {isValidating ? 'Checking...' : 'Apply'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-3 bg-brand-green/10 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-brand-green" />
            <span className="font-body text-sm font-medium text-brand-green">
              {couponCode}
            </span>
            <span className="font-body text-xs text-brand-green">
              (-{formatPrice(discountAmount)})
            </span>
          </div>
          <button
            onClick={handleRemoveCoupon}
            className="p-1 hover:bg-brand-green/10 rounded transition-colors"
          >
            <X className="w-4 h-4 text-brand-green" />
          </button>
        </div>
      )}

      {/* Free Shipping Progress */}
      {amountToFreeShipping > 0 ? (
        <div className="mb-6 p-4 bg-brand-sand rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-brand-green" />
            <span className="font-body text-sm text-brand-text">
              Add <span className="font-semibold text-brand-green">{formatPrice(amountToFreeShipping)}</span> more for FREE shipping!
            </span>
          </div>
          <div className="relative h-2.5 bg-brand-cream rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-brand-green rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min((subtotal / freeShippingThreshold) * 100, 100)}%`,
              }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="font-body text-xs text-brand-muted mt-1.5 text-right">
            {Math.round((subtotal / freeShippingThreshold) * 100)}% there
          </p>
        </div>
      ) : subtotal > 0 ? (
        <motion.div
          className="mb-6 p-4 bg-brand-green/10 rounded-xl border border-brand-green/20"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <div className="flex items-center gap-2">
            <PartyPopper className="w-5 h-5 text-brand-green" />
            <span className="font-body text-sm font-semibold text-brand-green">
              You&apos;ve unlocked FREE shipping!
            </span>
          </div>
        </motion.div>
      ) : null}

      {/* Price Breakdown */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between font-body text-sm">
          <span className="text-brand-muted">Subtotal</span>
          <span className="text-brand-charcoal">{formatPrice(subtotal)}</span>
        </div>

        {discountAmount > 0 && (
          <div className="flex justify-between font-body text-sm">
            <span className="text-brand-green">Discount</span>
            <span className="text-brand-green">
              -{formatPrice(discountAmount)}
            </span>
          </div>
        )}

        <div className="flex justify-between font-body text-sm">
          <span className="text-brand-muted">GST</span>
          <span className="text-brand-charcoal">{formatPrice(gst)}</span>
        </div>

        <div className="flex justify-between font-body text-sm">
          <span className="text-brand-muted">Shipping</span>
          <span className="text-brand-charcoal">
            {shippingCost === 0 ? (
              <span className="text-brand-green">Free</span>
            ) : (
              formatPrice(shippingCost)
            )}
          </span>
        </div>

        <div className="pt-3 border-t border-brand-border">
          <div className="flex justify-between">
            <span className="font-display text-lg font-semibold text-brand-charcoal">
              Total
            </span>
            <span className="font-display text-xl font-bold text-brand-charcoal">
              {formatPrice(total + shippingCost)}
            </span>
          </div>
        </div>
      </div>

      {/* Checkout Button */}
      {showCheckoutButton && (
        <Link href="/checkout">
          <Button className="w-full bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-xl py-6">
            Proceed to Checkout
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </Link>
      )}

      {/* Trust Badges */}
      <div className="mt-6 pt-6 border-t border-brand-border">
        <div className="flex items-center justify-center gap-4 text-brand-muted">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-body text-xs">Secure Checkout</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Truck className="w-4 h-4" />
            <span className="font-body text-xs">Fast Delivery</span>
          </div>
        </div>
      </div>
    </div>
  );
}
