'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CreditCard, Banknote, Smartphone, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CartItem } from '@/components/ecommerce/cart-item';
import { useCartStore } from '@/lib/cart-store';
import { useCustomerStore } from '@/lib/customer-store';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { PaymentMethod, CreateOrderDto } from '@/types';

const checkoutSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  street: z.string().min(5, 'Street address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().min(6, 'Valid pincode is required'),
  landmark: z.string().optional(),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

const paymentMethods: { id: PaymentMethod; name: string; icon: typeof Banknote; description: string }[] = [
  { id: 'cod', name: 'Cash on Delivery', icon: Banknote, description: 'Pay when you receive' },
  { id: 'upi', name: 'UPI', icon: Smartphone, description: 'Google Pay, PhonePe, etc.' },
  { id: 'card', name: 'Credit/Debit Card', icon: CreditCard, description: 'Visa, Mastercard, RuPay' },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getSubtotal, getGstTotal, getDiscountAmount, getTotal, clearCart } = useCartStore();
  const { customer, isAuthenticated } = useCustomerStore();
  const { toast } = useToast();
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cod');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const onSubmit = async (data: CheckoutFormData) => {
    // Check if user is authenticated
    if (!isAuthenticated) {
      toast({
        title: 'Login Required',
        description: 'Please login to place an order.',
        variant: 'destructive',
      });
      router.push('/login');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build order data
      const orderData: CreateOrderDto = {
        items: items.map((item) => ({
          productId: item.productId,
          variantSku: item.variantSku,
          quantity: item.quantity,
        })),
        shippingAddress: {
          name: data.name,
          phone: data.phone,
          street: data.street,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          landmark: data.landmark,
        },
        paymentMethod: selectedPayment,
        couponCode: useCartStore.getState().couponCode || undefined,
      };

      // Create order via API
      const order = await api.createOrder(orderData);

      toast({
        title: 'Order placed successfully!',
        description: `Order #${order.orderNumber} has been created. You will receive a confirmation shortly.`,
      });

      clearCart();
      router.push(`/account/orders/${order._id}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to place order. Please try again.';
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
  const shipping = subtotal >= 999 ? 0 : 50;
  const total = getTotal() + shipping;

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
                      {...register('pincode')}
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
                  <div className="flex justify-between pt-3 border-t border-brand-border">
                    <span className="font-display text-lg font-semibold text-brand-charcoal">
                      Total
                    </span>
                    <span className="font-display text-xl font-bold text-brand-charcoal">
                      {formatPrice(total)}
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
