'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Package,
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { useCartStore } from '@/lib/cart-store';
import { cn } from '@/lib/utils';

const statusSteps = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

// Orders that can be cancelled
const cancellableStatuses = ['pending', 'confirmed'];

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { addItem } = useCartStore();
  const orderId = params.id as string;

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isReordering, setIsReordering] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.getOrder(orderId),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.cancelOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      setShowCancelDialog(false);
      setCancelReason('');
      toast({
        title: 'Order Cancelled',
        description: 'Your order has been cancelled successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Cancellation Failed',
        description: 'Could not cancel order. Please try again or contact support.',
        variant: 'destructive',
      });
    },
  });

  const handleReorder = async () => {
    if (!order) return;

    setIsReordering(true);
    try {
      // Add all items from this order to cart
      for (const item of order.items) {
        const productId = typeof item.product === 'string' ? item.product : item.product._id;
        await addItem(
          {
            productId,
            name: item.name,
            slug: '', // Will be updated when viewing cart
            image: item.image || '',
            price: item.price,
            variantSku: item.variantSku,
            variantName: item.variantName,
            gstPercentage: 5, // Default GST
          },
          item.quantity
        );
      }

      toast({
        title: 'Items Added to Cart',
        description: 'All items from this order have been added to your cart.',
      });

      router.push('/cart');
    } catch (error) {
      toast({
        title: 'Reorder Failed',
        description: 'Could not add items to cart. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsReordering(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl p-6 animate-pulse">
          <div className="h-6 bg-brand-sand rounded w-48 mb-4" />
          <div className="h-4 bg-brand-sand rounded w-32" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center">
        <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-4">
          Order not found
        </h2>
        <Link href="/account/orders">
          <Button variant="outline">Back to Orders</Button>
        </Link>
      </div>
    );
  }

  const currentStepIndex = statusSteps.findIndex((s) => s.key === order.status);
  const canCancel = cancellableStatuses.includes(order.status);
  const canReorder = order.status === 'delivered' || order.status === 'cancelled';

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        className="bg-white rounded-2xl p-6 shadow-brand-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 font-body text-sm text-brand-muted hover:text-brand-charcoal mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-charcoal">
              Order #{order.orderNumber}
            </h1>
            <p className="font-body text-brand-muted mt-1">
              Placed on {formatDate(order.createdAt)}
            </p>
          </div>
          <span
            className={cn(
              'px-3 py-1 rounded-full text-sm font-body font-medium capitalize',
              order.status === 'delivered'
                ? 'bg-green-100 text-green-800'
                : order.status === 'cancelled'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-blue-100 text-blue-800'
            )}
          >
            {order.status.replace('_', ' ')}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          {canReorder && (
            <Button
              onClick={handleReorder}
              disabled={isReordering}
              className="bg-brand-mustard hover:bg-brand-mustard-dark text-white"
            >
              {isReordering ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reorder
            </Button>
          )}
          {canCancel && (
            <Button
              onClick={() => setShowCancelDialog(true)}
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel Order
            </Button>
          )}
        </div>
      </motion.div>

      {/* Cancelled Notice */}
      {order.status === 'cancelled' && (
        <motion.div
          className="bg-red-50 border border-red-200 rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-display font-semibold text-red-800">Order Cancelled</h3>
              <p className="font-body text-sm text-red-600 mt-1">
                {order.cancelReason || 'This order has been cancelled.'}
              </p>
              {order.cancelledAt && (
                <p className="font-body text-xs text-red-500 mt-1">
                  Cancelled on {formatDate(order.cancelledAt)}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Status Timeline */}
      {order.status !== 'cancelled' && (
        <motion.div
          className="bg-white rounded-2xl p-6 shadow-brand-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="font-display text-lg font-semibold text-brand-charcoal mb-6">
            Order Status
          </h2>
          <div className="relative">
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-brand-sand" />
            <div
              className="absolute top-4 left-4 h-0.5 bg-brand-mustard transition-all"
              style={{
                width: `${Math.max(0, currentStepIndex) * 25}%`,
              }}
            />
            <div className="relative flex justify-between">
              {statusSteps.map((step, index) => {
                const isComplete = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                return (
                  <div key={step.key} className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                        isComplete
                          ? 'bg-brand-mustard'
                          : 'bg-brand-sand'
                      )}
                    >
                      {isComplete ? (
                        <CheckCircle className="w-5 h-5 text-white" />
                      ) : (
                        <Clock className="w-4 h-4 text-brand-muted" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'mt-2 font-body text-xs text-center',
                        isCurrent ? 'text-brand-mustard font-medium' : 'text-brand-muted'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Tracking Info */}
      {order.awbNumber && (
        <motion.div
          className="bg-white rounded-2xl p-6 shadow-brand-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="font-display text-lg font-semibold text-brand-charcoal mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5 text-brand-mustard" />
            Tracking Information
          </h2>
          <div className="space-y-2 font-body text-sm">
            <p>
              <span className="text-brand-muted">AWB Number:</span>{' '}
              <span className="font-medium">{order.awbNumber}</span>
            </p>
            {order.courierName && (
              <p>
                <span className="text-brand-muted">Courier:</span>{' '}
                <span className="font-medium">{order.courierName}</span>
              </p>
            )}
            {order.expectedDeliveryDate && (
              <p>
                <span className="text-brand-muted">Expected Delivery:</span>{' '}
                <span className="font-medium">{formatDate(order.expectedDeliveryDate)}</span>
              </p>
            )}
            {order.trackingUrl && (
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand-mustard hover:underline mt-2"
              >
                Track Shipment
                <ArrowLeft className="w-3 h-3 rotate-180" />
              </a>
            )}
          </div>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Order Items */}
        <motion.div
          className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-brand-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="font-display text-lg font-semibold text-brand-charcoal mb-4">
            Items ({order.items.length})
          </h2>
          <div className="divide-y divide-brand-border">
            {order.items.map((item, index) => (
              <div key={index} className="py-4 flex gap-4">
                <div className="w-16 h-16 rounded-lg bg-brand-sand flex-shrink-0 flex items-center justify-center">
                  <Package className="w-6 h-6 text-brand-muted" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-medium text-brand-charcoal">
                    {item.name}
                  </h3>
                  {item.variantName && (
                    <p className="font-body text-xs text-brand-muted">{item.variantName}</p>
                  )}
                  <p className="font-body text-sm text-brand-muted">
                    Qty: {item.quantity} × {formatPrice(item.price)}
                  </p>
                </div>
                <p className="font-display font-semibold text-brand-charcoal">
                  {formatPrice(item.total)}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Order Summary & Address */}
        <div className="space-y-6">
          <motion.div
            className="bg-white rounded-2xl p-6 shadow-brand-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="font-display text-lg font-semibold text-brand-charcoal mb-4">
              Order Summary
            </h2>
            <div className="space-y-2 font-body text-sm">
              <div className="flex justify-between">
                <span className="text-brand-muted">Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-brand-green">
                  <span>Discount {order.couponCode && `(${order.couponCode})`}</span>
                  <span>-{formatPrice(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-brand-muted">Shipping</span>
                <span>{order.shippingCharge > 0 ? formatPrice(order.shippingCharge) : 'Free'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-muted">GST</span>
                <span>{formatPrice(order.gstTotal)}</span>
              </div>
              <div className="pt-2 border-t border-brand-border flex justify-between font-display font-bold text-lg">
                <span>Total</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="bg-white rounded-2xl p-6 shadow-brand-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="font-display text-lg font-semibold text-brand-charcoal mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-brand-mustard" />
              Delivery Address
            </h2>
            <div className="font-body text-sm text-brand-text space-y-1">
              <p className="font-medium">{order.shippingAddress.name}</p>
              <p>{order.shippingAddress.phone}</p>
              <p>{order.shippingAddress.street}</p>
              <p>
                {order.shippingAddress.city}, {order.shippingAddress.state} -{' '}
                {order.shippingAddress.pincode}
              </p>
              {order.shippingAddress.landmark && (
                <p className="text-brand-muted">Landmark: {order.shippingAddress.landmark}</p>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Cancel Order Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Cancel Order
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="font-body text-sm text-brand-text mb-1.5 block">
              Reason for cancellation
            </label>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g., Changed my mind, Found better price"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={cancelMutation.isPending}
            >
              Keep Order
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate(cancelReason)}
              disabled={cancelMutation.isPending || !cancelReason.trim()}
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Order'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
