'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CreditCard, Banknote, Smartphone, ShieldCheck, Check, ShoppingBag, MapPin, Tag, X, ChevronDown, ChevronUp, Ticket, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CartItem } from '@/components/ecommerce/cart-item';
import { useCartStore, useSyncCartOnAuth } from '@/lib/cart-store';
import { useCustomerStore } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { useCouponStore } from '@/lib/coupon-store';
import type { PaymentMethod, CreateOrderDto, GuestCreateOrderDto, WalletBalance, Coupon } from '@/types';

import type { RazorpayCheckoutResponse } from '@/types';

// Serviceable pincode prefixes — must match backend SERVICEABLE_PINCODE_PREFIXES in orders.service.ts
const SERVICEABLE_PREFIXES = ['492', '490', '491', '495'];

const checkoutSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  alternatePhone: z.string().optional(),
  street: z.string().min(5, 'Street address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z
    .string()
    .min(6, 'Valid pincode is required')
    .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits')
    .refine(
      (val) => SERVICEABLE_PREFIXES.some((p) => val.startsWith(p)),
      'Sorry, we currently deliver only to Raipur, Bhilai, Durg & Bilaspur (Chhattisgarh).',
    ),
  landmark: z.string().optional(),
  saveAddress: z.boolean().optional(),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

const paymentMethods: { id: PaymentMethod; name: string; icon: typeof Banknote; description: string }[] = [
  { id: 'cod', name: 'Cash on Delivery', icon: Banknote, description: 'Pay when you receive' },
  { id: 'upi', name: 'UPI', icon: Smartphone, description: 'Google Pay, PhonePe, etc.' },
  { id: 'card', name: 'Credit/Debit Card', icon: CreditCard, description: 'Visa, Mastercard, RuPay' },
];

// Basic pincode → city/state helper for serviceable areas
const PINCODE_CITY_STATE: { prefix: string; city: string; state: string }[] = [
  // Raipur
  { prefix: '492', city: 'Raipur', state: 'Chhattisgarh' },
  // Bhilai / Durg
  { prefix: '490', city: 'Bhilai', state: 'Chhattisgarh' },
  { prefix: '491', city: 'Durg', state: 'Chhattisgarh' },
  // Bilaspur
  { prefix: '495', city: 'Bilaspur', state: 'Chhattisgarh' },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getSubtotal, getGstTotal, getDiscountAmount, getTotal, clearCart, couponCode, applyCoupon, removeCoupon, setLocalCoupon } = useCartStore();
  const syncCart = useSyncCartOnAuth();
  const { customer, isAuthenticated, updateCustomer } = useCustomerStore();
  const { toast } = useToast();
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cod');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [walletAmount, setWalletAmount] = useState(0);
  const [couponInput, setCouponInput] = useState('');
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [showCoupons, setShowCoupons] = useState(false);
  const storeActiveCoupons = useCouponStore((s) => s.activeCoupons);
  const [fetchedCoupons, setFetchedCoupons] = useState<Coupon[]>([]);
  const activeCoupons = storeActiveCoupons.length > 0 ? storeActiveCoupons : fetchedCoupons;
  const appliedCouponDetail = couponCode ? activeCoupons.find((c) => c.code === couponCode) : null;
  const appliedFreeItems = appliedCouponDetail?.freeItems ?? [];
  const idempotencyKeyRef = useRef<string>('');
  useEffect(() => {
    setMounted(true);
    idempotencyKeyRef.current = crypto.randomUUID();
  }, []);

  // Fetch coupons directly using raw fetch so it always hits the network
  useEffect(() => {
    let cancelled = false;
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7001/api/v1').replace(/\/$/, '');
    fetch(`${base}/coupons/active`, { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list = json?.data ?? json;
        setFetchedCoupons(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure cart is synced from server for logged-in users when checkout loads
  useEffect(() => {
    syncCart();
  }, [syncCart]);

  const { data: publicSettings } = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => api.getPublicSettings(),
    staleTime: 10 * 60 * 1000,
  });
  const shippingSettings = {
    freeShippingThreshold: publicSettings?.store?.freeShippingThreshold ?? 300,
    defaultShippingCharge: publicSettings?.store?.defaultShippingCharge ?? 50,
  };

  const { data: wallet }: { data: WalletBalance | undefined } = useQuery({
    queryKey: ['wallet-balance', customer?.id],
    queryFn: () => api.getWallet(),
    enabled: isAuthenticated && !!customer?.id,
    staleTime: 0,
  });

  // Sync addresses from server so the pre-fill works even if user navigates
  // directly to /checkout without visiting /account or /addresses first.
  const { data: checkoutProfile } = useQuery({
    queryKey: ['customer-profile'],
    queryFn: () => api.getMyProfile(),
    enabled: isAuthenticated && !!customer?.id,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (checkoutProfile?.addresses?.length) {
      updateCustomer({ addresses: checkoutProfile.addresses });
    }
  }, [checkoutProfile, updateCustomer]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
    trigger,
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      saveAddress: true,
    },
  });

  // Pre-fill form with customer data
  useEffect(() => {
    if (customer) {
      setValue('name', customer.name || '');
      setValue('email', customer.email || '');
      setValue('phone', customer.phone || '');
      const defaultAddress = customer.addresses?.find((a) => a.isDefault) || customer.addresses?.[0];
      if (defaultAddress) {
        setValue('street', defaultAddress.street || '');
        setValue('city', defaultAddress.city || '');
        setValue('state', defaultAddress.state || '');
        setValue('pincode', defaultAddress.pincode || '');
        setValue('landmark', defaultAddress.landmark || '');
      }
    }
  }, [customer, setValue]);

  const handlePincodeBlur = (value: string) => {
    const trimmed = value.trim();
    // Trigger Zod validation immediately so serviceability error shows on blur,
    // not only on form submit.
    if (trimmed.length === 6) {
      void trigger('pincode');
    }

    if (trimmed.length < 3) return;
    const match = PINCODE_CITY_STATE.find((entry) => trimmed.startsWith(entry.prefix));
    if (!match) return;

    // Only auto-fill if fields are empty to avoid overwriting user edits
    const currentCity = (getValues('city') || '').trim();
    const currentState = (getValues('state') || '').trim();
    if (!currentCity) setValue('city', match.city);
    if (!currentState) setValue('state', match.state);
  };

  const handleApplyCoupon = useCallback(async (code?: string) => {
    const input = (code ?? couponInput).trim();
    if (!input) return;
    setIsValidatingCoupon(true);
    setCouponError(null);
    try {
      const productIds = items.map((item) => item.productId);
      const validation = await api.validateCoupon(input, getSubtotal(), undefined, productIds);
      const savedAmount = validation.discountAmount || 0;
      const hasFreeItems = (validation.freeItems?.length ?? 0) > 0;
      if (validation.valid) {
        if (savedAmount <= 0 && !hasFreeItems) {
          setCouponError('This coupon provides no discount on your current order');
        } else {
          const result = await applyCoupon(input);
          const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
          const desc = savedAmount > 0 && hasFreeItems
            ? `${fmt.format(savedAmount)} off + free item(s) added`
            : savedAmount > 0
            ? `You saved ${fmt.format(savedAmount)}`
            : `Free item(s) added to your order`;
          if (result.success) {
            setCouponInput('');
            toast({ title: 'Coupon applied!', description: desc });
          } else if (result.message?.toLowerCase().includes('unauthorized') || result.message?.toLowerCase().includes('not authenticated')) {
            setLocalCoupon(input, savedAmount, 'fixed');
            setCouponInput('');
            toast({ title: 'Coupon applied!', description: desc });
          } else {
            setCouponError(result.message || 'Could not apply coupon. Please try again.');
          }
        }
      } else {
        setCouponError(validation.message || 'This coupon is not valid');
      }
    } catch {
      setCouponError('Could not validate coupon. Please try again.');
    } finally {
      setIsValidatingCoupon(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponInput, items, getSubtotal, applyCoupon, setLocalCoupon, toast]);

  // Auto-apply the first eligible isAutoApply coupon if no coupon is active yet
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (!mounted || couponCode || activeCoupons.length === 0 || items.length === 0 || autoAppliedRef.current) return;
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const best = activeCoupons.find((c) => c.isAutoApply && subtotal >= (c.minOrderAmount || 0));
    if (best) {
      autoAppliedRef.current = true;
      handleApplyCoupon(best.code);
    }
  }, [mounted, couponCode, activeCoupons, items, handleApplyCoupon]);

  const handleRemoveCoupon = async () => {
    await removeCoupon();
    toast({ title: 'Coupon removed' });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const onSubmit = async (data: CheckoutFormData) => {
    setIsSubmitting(true);
    try {
      // Common order payload pieces
      const baseItems = items
        .filter((item) => !!item.productId)
        .map((item) => ({
          productId: item.productId,
          variantSku: item.variantSku,
          quantity: item.quantity,
        }));

      if (baseItems.length === 0) {
        throw new Error('Your cart seems empty or invalid. Please add the product again and try checkout.');
      }

      const baseShipping = {
        name: data.name,
        phone: data.phone,
        alternatePhone: data.alternatePhone || undefined,
        street: data.street,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        landmark: data.landmark,
      };

      const paymentMethod: PaymentMethod =
        selectedPayment === 'cod' ? 'cod' : 'prepaid';

      const couponCode = useCartStore.getState().couponCode || undefined;
      const selectedGift = useCartStore.getState().selectedGift || undefined;
      const giftNotes = selectedGift ? `Free gift: ${selectedGift}` : undefined;

      let order;

      const appliedWalletAmount =
        isAuthenticated && useWallet && wallet
          ? Math.min(walletAmount || 0, wallet.balance, total)
          : 0;

      if (isAuthenticated) {
        const orderData: CreateOrderDto = {
          items: baseItems,
          shippingAddress: baseShipping,
          paymentMethod,
          couponCode,
          notes: giftNotes,
          walletAmount: appliedWalletAmount > 0 ? appliedWalletAmount : undefined,
          idempotencyKey: idempotencyKeyRef.current || undefined,
        };

        // Optionally save shipping address back to account
        if (data.saveAddress) {
          try {
            await api.addAddress({
              label: 'Home',
              street: data.street,
              city: data.city,
              state: data.state,
              pincode: data.pincode,
              landmark: data.landmark,
              isDefault: false,
            });
          } catch {
            // Non-blocking: ignore failures here, user still places order
          }
        }

        order = await api.createOrder(orderData);
      } else {
        const guestOrderData: GuestCreateOrderDto = {
          items: baseItems,
          shippingAddress: baseShipping,
          paymentMethod,
          couponCode,
          notes: giftNotes,
          phone: data.phone,
          email: data.email,
          name: data.name,
          idempotencyKey: idempotencyKeyRef.current || undefined,
        };

        order = await api.createGuestOrder(guestOrderData);
      }

      // If not COD, initiate Razorpay payment (only when some amount remains to be paid online)
      if (selectedPayment !== 'cod' && amountToPayNow > 0) {
        try {
          const paymentData = await api.createPaymentOrder(order._id);

          const options = {
            key: paymentData.keyId,
            amount: paymentData.amount,
            currency: paymentData.currency,
            name: 'Nature Lite Foods',
            description: `Order #${order.orderNumber}`,
            order_id: paymentData.razorpayOrderId,
            handler: async (response: RazorpayCheckoutResponse) => {
              try {
                await api.verifyPayment({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                });
                clearCart();
                toast({ title: 'Payment successful! Order confirmed.' });
                if (isAuthenticated) {
                  router.push(`/account/orders/${order._id}`);
                } else {
                  router.push('/');
                }
              } catch {
                toast({
                  title: 'Payment verification failed',
                  description: 'Please contact support if amount was deducted.',
                  variant: 'destructive',
                });
              }
            },
            prefill: {
              name: data.name,
              email: data.email,
              contact: data.phone,
            },
            theme: { color: '#D4A574' },
            modal: {
              ondismiss: () => {
                toast({
                  title: 'Payment cancelled',
                  description: 'Your order has been created. You can pay later.',
                });
                setIsSubmitting(false);
                if (isAuthenticated) {
                  router.push(`/account/orders/${order._id}`);
                } else {
                  router.push('/');
                }
              },
            },
          };

          const rzp = new window.Razorpay(options);
          rzp.open();
          return; // Don't clear cart yet - wait for payment handler
        } catch {
          toast({
            title: 'Payment gateway error',
            description: 'Order created but payment could not be initiated. Please try again later.',
            variant: 'destructive',
          });
          if (isAuthenticated) {
            router.push(`/account/orders/${order._id}`);
          } else {
            router.push('/');
          }
          return;
        }
      }

      // COD or fully wallet-paid flow
      toast({
        title: 'Order placed successfully!',
        description: `Order #${order.orderNumber} has been created. You will receive a confirmation shortly.`,
      });

      clearCart();
      if (isAuthenticated) {
        router.push(`/account/orders/${order._id}`);
      } else {
        router.push('/');
      }
    } catch (error: unknown) {
      const raw = error as { response?: { data?: { message?: string } } };
      const backendMsg = raw?.response?.data?.message ?? '';
      const errorMessage = /insufficient wallet balance/i.test(backendMsg)
        ? 'Wallet balance may have changed. Please review the amount and try again.'
        : getApiError(error, 'Failed to place order. Please try again.');
      toast({
        title: 'Order failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen pt-20 bg-brand-cream">
        <div className="brand-container py-12">
          <div className="animate-pulse h-96 bg-brand-sand rounded-xl" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-20 bg-brand-cream">
        <div className="brand-container py-24 text-center">
          <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-4">
            Your cart is empty
          </h1>
          <Link href="/products">
            <Button className="bg-brand-mustard hover:bg-brand-mustard-dark text-white">
              Continue Shopping
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = getSubtotal();
  const gst = getGstTotal();
  const discount = getDiscountAmount();
  const baseTotal = getTotal(); // subtotal - discount
  const shipping =
    subtotal >= shippingSettings.freeShippingThreshold ? 0 : shippingSettings.defaultShippingCharge;
  // GST is inclusive in item prices — do not add it on top
  const total = baseTotal + shipping;

  const maxWalletUsable =
    isAuthenticated && wallet ? Math.min(wallet.balance, total) : 0;
  const effectiveWalletAmount =
    isAuthenticated && useWallet ? Math.min(walletAmount || 0, maxWalletUsable) : 0;
  const amountToPayNow = total - effectiveWalletAmount;

  return (
    <div className="min-h-screen pt-20 bg-brand-cream pb-[80px] lg:pb-0">
      <div className="brand-container py-12">
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 font-body text-sm text-brand-muted hover:text-brand-charcoal mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Cart
        </Link>

        {/* Checkout Progress Bar */}
        <div className="flex items-center justify-center mb-10">
          {[
            { label: 'Cart', completed: true, active: false },
            { label: 'Shipping', completed: false, active: true },
            { label: 'Payment', completed: false, active: false },
          ].map((step, index) => (
            <div key={step.label} className="flex items-center">
              {index > 0 && (
                <div
                  className="h-px w-14 sm:w-24 mx-1"
                  style={{
                    background: step.completed
                      ? 'linear-gradient(90deg,#1a5210,rgba(26,82,16,0.3))'
                      : step.active
                      ? 'linear-gradient(90deg,#a07010,rgba(160,112,16,0.25))'
                      : 'rgba(46,66,37,0.12)',
                  }}
                />
              )}
              <motion.div
                className="flex flex-col items-center gap-1.5"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-sm transition-all duration-300"
                  style={
                    step.completed
                      ? { background: '#1a5210', color: '#fff', boxShadow: '0 2px 8px rgba(26,82,16,0.25)' }
                      : step.active
                      ? { background: '#a07010', color: '#fff', boxShadow: '0 2px 12px rgba(160,112,16,0.30)' }
                      : { background: 'transparent', color: 'rgba(46,66,37,0.30)', border: '1.5px solid rgba(46,66,37,0.16)' }
                  }
                >
                  {step.completed ? <Check className="w-4 h-4" /> : String(index + 1).padStart(2, '0')}
                </div>
                <span
                  className="font-body uppercase tracking-[0.08em]"
                  style={{
                    fontSize: 10,
                    color: step.active ? '#a07010' : step.completed ? '#1a5210' : 'rgba(46,66,37,0.32)',
                    fontWeight: step.active ? 600 : 500,
                  }}
                >
                  {step.label}
                </span>
              </motion.div>
            </div>
          ))}
        </div>

        <h1 className="font-display text-3xl font-bold text-brand-charcoal mb-8">
          Checkout
        </h1>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Form Section */}
            <div className="lg:col-span-2 space-y-8">
              {/* Shipping Address */}
              <motion.div
                className="bg-white rounded-2xl p-6 shadow-brand-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center font-body font-bold text-xs flex-shrink-0"
                    style={{ background: 'rgba(160,112,16,0.10)', color: '#7a5300' }}
                  >
                    01
                  </span>
                  <h2 className="font-display text-xl font-semibold" style={{ color: '#0b1c08' }}>
                    Shipping Address
                  </h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      Full Name *
                    </label>
                    <Input
                      {...register('name')}
                      className={cn(errors.name && 'border-brand-error')}
                    />
                    {errors.name && (
                      <p className="text-xs text-brand-error mt-1">{errors.name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      Email *
                    </label>
                    <Input
                      type="email"
                      {...register('email')}
                      className={cn(errors.email && 'border-brand-error')}
                    />
                    {errors.email && (
                      <p className="text-xs text-brand-error mt-1">{errors.email.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      Phone *
                    </label>
                    <Input
                      {...register('phone')}
                      className={cn(errors.phone && 'border-brand-error')}
                    />
                    {errors.phone && (
                      <p className="text-xs text-brand-error mt-1">{errors.phone.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      Alternate Phone (Optional)
                    </label>
                    <Input
                      {...register('alternatePhone')}
                      className={cn(errors.alternatePhone && 'border-brand-error')}
                      placeholder="Alternate contact number"
                    />
                    {errors.alternatePhone && (
                      <p className="text-xs text-brand-error mt-1">{errors.alternatePhone.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      Pincode *
                    </label>
                    <Input
                      {...register('pincode', {
                        onBlur: (e) => handlePincodeBlur(e.target.value),
                      })}
                      className={cn(errors.pincode && 'border-brand-error')}
                      maxLength={6}
                      placeholder="6-digit pincode"
                    />
                    {errors.pincode ? (
                      <p className="text-xs text-brand-error mt-1">{errors.pincode.message}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        We deliver to Raipur, Bhilai, Durg &amp; Bilaspur (Chhattisgarh)
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      Street Address *
                    </label>
                    <Input
                      {...register('street')}
                      className={cn(errors.street && 'border-brand-error')}
                    />
                    {errors.street && (
                      <p className="text-xs text-brand-error mt-1">{errors.street.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      City *
                    </label>
                    <Input
                      {...register('city')}
                      className={cn(errors.city && 'border-brand-error')}
                    />
                    {errors.city && (
                      <p className="text-xs text-brand-error mt-1">{errors.city.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      State *
                    </label>
                    <Input
                      {...register('state')}
                      className={cn(errors.state && 'border-brand-error')}
                    />
                    {errors.state && (
                      <p className="text-xs text-brand-error mt-1">{errors.state.message}</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="font-body text-sm text-brand-text mb-1.5 block">
                      Landmark (Optional)
                    </label>
                    <Input {...register('landmark')} />
                  </div>
                </div>

                {isAuthenticated && (
                  <label className="flex items-center gap-2 mt-4 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('saveAddress')}
                      className="w-4 h-4 rounded border-brand-border text-brand-mustard focus:ring-brand-mustard"
                    />
                    <span className="font-body text-sm text-brand-text">
                      Save this address to my account
                    </span>
                  </label>
                )}
              </motion.div>

              {/* Payment Method */}
              <motion.div
                className="bg-white rounded-2xl p-6 shadow-brand-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center font-body font-bold text-xs flex-shrink-0"
                    style={{ background: 'rgba(160,112,16,0.10)', color: '#7a5300' }}
                  >
                    02
                  </span>
                  <h2 className="font-display text-xl font-semibold" style={{ color: '#0b1c08' }}>
                    Payment Method
                  </h2>
                </div>
                <div className="space-y-3">
                  {paymentMethods.map((method) => {
                    const selected = selectedPayment === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedPayment(method.id)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all duration-200"
                        style={
                          selected
                            ? {
                                border: '2px solid #a07010',
                                background: 'rgba(160,112,16,0.04)',
                                boxShadow: '0 0 0 1px rgba(160,112,16,0.12) inset',
                              }
                            : {
                                border: '2px solid rgba(46,66,37,0.12)',
                                background: '#fff',
                              }
                        }
                      >
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-200"
                          style={{
                            background: selected ? 'rgba(160,112,16,0.12)' : 'rgba(242,236,224,0.65)',
                          }}
                        >
                          <method.icon
                            className="w-5 h-5 transition-colors duration-200"
                            style={{ color: selected ? '#a07010' : 'rgba(46,66,37,0.50)' }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="font-display font-semibold" style={{ fontSize: 14, color: '#0b1c08' }}>
                            {method.name}
                          </p>
                          <p className="font-body text-xs mt-0.5" style={{ color: 'rgba(46,66,37,0.50)' }}>
                            {method.description}
                          </p>
                        </div>
                        <div
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200"
                          style={
                            selected
                              ? { borderColor: '#a07010', background: '#a07010' }
                              : { borderColor: 'rgba(46,66,37,0.20)', background: 'transparent' }
                          }
                        >
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <motion.div
                className="bg-white rounded-2xl p-6 shadow-brand-sm sticky top-28"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-6">
                  Order Summary
                </h2>

                {/* Items */}
                <div className="max-h-60 overflow-y-auto mb-6">
                  {items.map((item) => (
                    <CartItem
                      key={`${item.productId}-${item.variantSku || ''}`}
                      item={item}
                      variant="compact"
                    />
                  ))}
                  {appliedFreeItems.map((fi, i) => {
                    const prod = typeof fi.product === 'object' ? fi.product : null;
                    const name = prod?.name ?? 'Free item';
                    const image = prod?.images?.[0];
                    return (
                      <div key={i} className="flex items-center gap-3 py-2 border-t border-dashed border-emerald-200">
                        {image ? (
                          <img src={image} alt={name} className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <Gift className="w-5 h-5 text-emerald-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-brand-charcoal truncate">{name}</p>
                          <p className="text-xs text-brand-muted">Qty: {fi.quantity}</p>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full flex-shrink-0">FREE</span>
                      </div>
                    );
                  })}
                </div>

                {/* Coupon */}
                {!couponCode ? (
                  <div className="mb-4">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                        <Input
                          type="text"
                          placeholder="Coupon code"
                          value={couponInput}
                          onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                          className="pl-10 bg-brand-sand border-0 text-sm h-9"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleApplyCoupon()}
                        disabled={isValidatingCoupon || !couponInput.trim()}
                        variant="outline"
                        className="border-brand-charcoal text-sm h-9 px-3"
                      >
                        {isValidatingCoupon ? '...' : 'Apply'}
                      </Button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-500 mt-1.5">{couponError}</p>
                    )}
                    {activeCoupons.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowCoupons((v) => !v)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-brand-mustard hover:text-brand-mustard-dark transition-colors w-full"
                        >
                          <Ticket className="w-3.5 h-3.5" />
                          {activeCoupons.length} coupon{activeCoupons.length > 1 ? 's' : ''} available
                          {showCoupons ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                        </button>
                        {showCoupons && (
                          <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-0.5">
                            {activeCoupons.map((c) => (
                              <div
                                key={c._id}
                                className="border border-dashed border-brand-mustard/60 rounded-xl p-3 bg-brand-mustard/5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                      <span className="font-mono text-sm font-bold text-brand-charcoal tracking-wider">
                                        {c.code}
                                      </span>
                                      {c.discountType === 'percentage' ? (
                                        <span className="text-[10px] bg-brand-mustard/20 text-brand-mustard font-semibold px-1.5 py-0.5 rounded-full">
                                          {c.discountValue}% OFF
                                        </span>
                                      ) : (
                                        <span className="text-[10px] bg-brand-green/20 text-brand-green font-semibold px-1.5 py-0.5 rounded-full">
                                          ₹{c.discountValue} OFF
                                        </span>
                                      )}
                                      {c.freeItems && c.freeItems.length > 0 && (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                                          <Gift className="w-2.5 h-2.5" />
                                          {c.freeItems.length === 1 ? 'Free item' : `${c.freeItems.length} free items`}
                                        </span>
                                      )}
                                    </div>
                                    {c.description && (
                                      <p className="text-xs text-brand-muted leading-snug">{c.description}</p>
                                    )}
                                    <div className="flex flex-wrap gap-x-2 mt-1">
                                      {c.minOrderAmount > 0 && (
                                        <span className="text-[10px] text-brand-muted">Min. ₹{c.minOrderAmount}</span>
                                      )}
                                      {c.maxDiscount && c.discountType === 'percentage' && (
                                        <span className="text-[10px] text-brand-muted">Upto ₹{c.maxDiscount}</span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => { setCouponError(null); handleApplyCoupon(c.code); setShowCoupons(false); }}
                                    disabled={isValidatingCoupon}
                                    className="flex-shrink-0 text-xs font-bold text-brand-mustard border border-brand-mustard rounded-lg px-2.5 py-1.5 hover:bg-brand-mustard hover:text-white transition-colors disabled:opacity-50"
                                  >
                                    APPLY
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-4 space-y-1.5">
                    <div className="p-2.5 bg-brand-green/10 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-brand-green" />
                        <span className="font-body text-sm font-medium text-brand-green">{couponCode}</span>
                        <span className="font-body text-xs text-brand-green">(-{formatPrice(discount)})</span>
                      </div>
                      <button type="button" onClick={handleRemoveCoupon} className="p-1 hover:bg-brand-green/10 rounded cursor-pointer">
                        <X className="w-4 h-4 text-brand-green" />
                      </button>
                    </div>
                    {appliedFreeItems.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl"
                      >
                        <Gift className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <p className="text-[11px] font-semibold text-emerald-700">
                          🎉 {appliedFreeItems.length === 1 ? '1 free item' : `${appliedFreeItems.length} free items`} included — shown above
                        </p>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Totals */}
                <div className="space-y-3 pt-4 border-t border-brand-border">
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-brand-muted">Subtotal</span>
                    <span className="text-brand-charcoal">{formatPrice(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between font-body text-sm">
                      <span className="text-brand-green">Discount</span>
                      <span className="text-brand-green">-{formatPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-brand-muted">GST (incl.)</span>
                    <span className="text-brand-charcoal">{formatPrice(gst)}</span>
                  </div>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-brand-muted">Shipping</span>
                    <span className={shipping === 0 ? 'text-brand-green' : 'text-brand-charcoal'}>
                      {shipping === 0 ? 'Free' : formatPrice(shipping)}
                    </span>
                  </div>
                  {isAuthenticated && wallet && (
                    <>
                      <div className="flex justify-between items-center pt-3 border-t border-dashed border-brand-border">
                        <div className="flex flex-col">
                          <span className="font-body text-sm text-brand-charcoal">
                            Wallet balance
                          </span>
                          <span className="font-body text-xs text-brand-muted">
                            Available: {formatPrice(wallet.balance)}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <label className="inline-flex items-center gap-2 text-xs text-brand-text cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useWallet}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setUseWallet(checked);
                                if (checked) {
                                  const autoAmount = Math.min(wallet.balance, total);
                                  setWalletAmount(autoAmount);
                                } else {
                                  setWalletAmount(0);
                                }
                              }}
                              className="w-4 h-4 rounded border-brand-border text-brand-mustard focus:ring-brand-mustard"
                            />
                            <span>Use wallet</span>
                          </label>
                          {useWallet && (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={wallet.balance}
                                step={1}
                                value={walletAmount || ''}
                                onChange={(e) => {
                                  const value = Number(e.target.value || 0);
                                  setWalletAmount(
                                    Number.isNaN(value)
                                      ? 0
                                      : Math.max(0, Math.min(value, wallet.balance, total)),
                                  );
                                }}
                                className="h-8 w-24 text-right text-sm"
                              />
                              <span className="text-xs text-brand-muted">
                                Max {formatPrice(maxWalletUsable)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {useWallet && effectiveWalletAmount > 0 && (
                        <div className="flex justify-between font-body text-sm">
                          <span className="text-brand-green">Wallet applied</span>
                          <span className="text-brand-green">
                            -{formatPrice(effectiveWalletAmount)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between pt-3 border-t border-brand-border">
                    <span className="font-display text-lg font-semibold text-brand-charcoal">
                      To pay now
                    </span>
                    <span className="font-display text-xl font-bold text-brand-charcoal">
                      {formatPrice(amountToPayNow)}
                    </span>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-6 rounded-xl py-6 text-white font-semibold text-base transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0"
                  style={{
                    background: 'linear-gradient(135deg, #a07010 0%, #7a5300 100%)',
                    boxShadow: '0 6px 24px -6px rgba(160,112,16,0.45)',
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    'Processing...'
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Place Order
                      <ArrowLeft className="w-4 h-4 rotate-180" />
                    </span>
                  )}
                </Button>

                <div className="mt-4 flex items-center justify-center gap-2 text-brand-muted">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="font-body text-xs">Secure & encrypted checkout</span>
                </div>
              </motion.div>
            </div>
          </div>
        </form>
      </div>

      {/* Mobile sticky Place Order bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-brand-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="font-body text-xs text-brand-muted">Total to pay</p>
            <p className="font-display text-lg font-bold text-brand-charcoal leading-tight">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amountToPayNow)}
            </p>
          </div>
          <Button
            type="button"
            className="bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-xl px-6 py-3 flex-shrink-0"
            disabled={isSubmitting}
            onClick={handleSubmit(onSubmit)}
          >
            {isSubmitting ? 'Processing...' : 'Place Order'}
          </Button>
        </div>
      </div>
    </div>
  );
}
