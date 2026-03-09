'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CreditCard, Banknote, Smartphone, ShieldCheck, Check, ShoppingBag, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CartItem } from '@/components/ecommerce/cart-item';
import { useCartStore, useSyncCartOnAuth } from '@/lib/cart-store';
import { useCustomerStore } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { PaymentMethod, CreateOrderDto, GuestCreateOrderDto, WalletBalance } from '@/types';

type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

const checkoutSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  street: z.string().min(5, 'Street address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().min(6, 'Valid pincode is required'),
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
  const { items, getSubtotal, getGstTotal, getDiscountAmount, getTotal, clearCart } = useCartStore();
  const syncCart = useSyncCartOnAuth();
  const { customer, isAuthenticated } = useCustomerStore();
  const { toast } = useToast();
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cod');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [walletAmount, setWalletAmount] = useState(0);
  useEffect(() => {
    setMounted(true);
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
    freeShippingThreshold: publicSettings?.store?.freeShippingThreshold ?? 999,
    defaultShippingCharge: publicSettings?.store?.defaultShippingCharge ?? 50,
  };

  const { data: wallet }: { data: WalletBalance | undefined } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => api.getWallet(),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
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
    if (trimmed.length < 3) return;

    const match = PINCODE_CITY_STATE.find((entry) => trimmed.startsWith(entry.prefix));
    if (!match) return;

    // Only auto-fill if fields are empty to avoid overwriting user edits
    const currentCity = (getValues('city') || '').trim();
    const currentState = (getValues('state') || '').trim();

    if (!currentCity) {
      setValue('city', match.city);
    }
    if (!currentState) {
      setValue('state', match.state);
    }
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
        street: data.street,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        landmark: data.landmark,
      };

      const paymentMethod: PaymentMethod =
        selectedPayment === 'cod' ? 'cod' : 'prepaid';

      const couponCode = useCartStore.getState().couponCode || undefined;

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
          walletAmount: appliedWalletAmount > 0 ? appliedWalletAmount : undefined,
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
          phone: data.phone,
          email: data.email,
          name: data.name,
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
            name: 'Naturelite Store',
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

          const rzp = new (window as any).Razorpay(options);
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
      let errorMessage = 'Failed to place order. Please try again.';
      if (error && typeof error === 'object' && 'response' in error) {
        const ax = error as { response?: { data?: { message?: string } } };
        const msg = ax.response?.data?.message ?? '';
        if (typeof msg === 'string' && /insufficient wallet balance/i.test(msg)) {
          errorMessage = 'Wallet balance may have changed. Please review the amount and try again.';
        } else if (msg) {
          errorMessage = msg;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        title: 'Error',
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
  // Order total should include GST + shipping
  const total = baseTotal + gst + shipping;

  const maxWalletUsable =
    isAuthenticated && wallet ? Math.min(wallet.balance, total) : 0;
  const effectiveWalletAmount =
    isAuthenticated && useWallet ? Math.min(walletAmount || 0, maxWalletUsable) : 0;
  const amountToPayNow = total - effectiveWalletAmount;

  return (
    <div className="min-h-screen pt-20 bg-brand-cream">
      <div className="brand-container py-12">
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 font-body text-sm text-brand-muted hover:text-brand-charcoal mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Cart
        </Link>

        {/* Checkout Progress Bar */}
        <div className="flex items-center justify-center gap-0 mb-10">
          {[
            { label: 'Cart', icon: ShoppingBag, completed: true, active: false },
            { label: 'Shipping', icon: MapPin, completed: false, active: true },
            { label: 'Payment', icon: CreditCard, completed: false, active: false },
          ].map((step, index) => (
            <div key={step.label} className="flex items-center">
              {index > 0 && (
                <div className={cn(
                  "h-0.5 w-12 sm:w-20",
                  step.completed || step.active ? 'bg-brand-green' : 'bg-brand-border'
                )} />
              )}
              <div className="flex flex-col items-center gap-1.5">
                <motion.div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2",
                    step.completed
                      ? 'bg-brand-green border-brand-green text-white'
                      : step.active
                      ? 'bg-brand-mustard border-brand-mustard text-white'
                      : 'bg-white border-brand-border text-brand-muted'
                  )}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {step.completed ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </motion.div>
                <span className={cn(
                  "text-xs font-medium",
                  step.completed ? 'text-brand-green' : step.active ? 'text-brand-mustard' : 'text-brand-muted'
                )}>
                  {step.label}
                </span>
              </div>
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
                <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-6">
                  Shipping Address
                </h2>
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
                      Pincode *
                    </label>
                    <Input
                      {...register('pincode', {
                        onBlur: (e) => handlePincodeBlur(e.target.value),
                      })}
                      className={cn(errors.pincode && 'border-brand-error')}
                    />
                    {errors.pincode && (
                      <p className="text-xs text-brand-error mt-1">{errors.pincode.message}</p>
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
              </motion.div>

              {/* Payment Method */}
              <motion.div
                className="bg-white rounded-2xl p-6 shadow-brand-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-6">
                  Payment Method
                </h2>
                <div className="space-y-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPayment(method.id)}
                      className={cn(
                        'w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left',
                        selectedPayment === method.id
                          ? 'border-brand-mustard bg-brand-mustard/5'
                          : 'border-brand-border hover:border-brand-charcoal'
                      )}
                    >
                      <div className="w-12 h-12 rounded-lg bg-brand-sand flex items-center justify-center">
                        <method.icon className="w-6 h-6 text-brand-brown" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display font-semibold text-brand-charcoal">
                          {method.name}
                        </p>
                        <p className="font-body text-sm text-brand-muted">
                          {method.description}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full border-2',
                          selectedPayment === method.id
                            ? 'border-brand-mustard bg-brand-mustard'
                            : 'border-brand-border'
                        )}
                      >
                        {selectedPayment === method.id && (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
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
                </div>

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
                    <span className="text-brand-muted">GST</span>
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
                  className="w-full mt-6 bg-brand-mustard hover:bg-brand-mustard-dark text-white rounded-xl py-6"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Place Order'}
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
    </div>
  );
}
