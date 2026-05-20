'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Package, ChevronRight, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCustomerStore } from '@/lib/customer-store';
import { api } from '@/lib/api';
import { Order } from '@/types';
import { cn, getCustomerOrderStatusDisplay, getStatusColor } from '@/lib/utils';

export default function OrdersPage() {
  const { isAuthenticated } = useCustomerStore();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.getMyOrders(10),
    enabled: isAuthenticated,
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  if (!isAuthenticated) {
    return (
      <motion.div
        className="bg-white rounded-2xl p-12 shadow-brand-sm text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
          Login to view your orders
        </h2>
        <p className="font-body text-brand-muted mb-6">
          Use the same phone or email you used while placing orders.
        </p>
        <Link href="/login">
          <Button className="bg-brand-mustard hover:bg-brand-mustard-dark text-white">
            Go to Login
          </Button>
        </Link>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-5 animate-pulse">
          <div className="h-5 bg-brand-sand rounded w-28 mb-1.5" />
          <div className="h-3.5 bg-brand-sand rounded w-44" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-5 animate-pulse">
            <div className="flex justify-between mb-3">
              <div className="h-4 bg-brand-sand rounded w-32" />
              <div className="h-4 bg-brand-sand rounded w-20" />
            </div>
            <div className="h-3.5 bg-brand-sand rounded w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <motion.div
        className="bg-white rounded-2xl p-12 shadow-brand-sm text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-brand-sand flex items-center justify-center">
          <ShoppingBag className="w-10 h-10 text-brand-muted" />
        </div>
        <h2 className="font-display text-xl font-semibold text-brand-charcoal mb-2">
          No orders yet
        </h2>
        <p className="font-body text-brand-muted mb-6">
          You haven&apos;t placed any orders. Start shopping to see your orders here.
        </p>
        <Link href="/products">
          <Button className="bg-brand-mustard hover:bg-brand-mustard-dark text-white">
            Start Shopping
          </Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        className="relative overflow-hidden rounded-2xl"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(125deg,#5a2f08 0%,#7a4010 30%,#3d1f04 70%,#1e0e02 100%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            top: '-60%', right: '-5%', width: 240, height: 240,
            background: 'radial-gradient(circle,rgba(212,152,64,0.22) 0%,transparent 65%)',
            filter: 'blur(28px)',
          }}
        />
        <div className="relative px-5 py-5">
          <p
            style={{ fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(212,152,64,0.55)', fontFamily: 'monospace', marginBottom: 4 }}
          >
            Account
          </p>
          <h1 className="font-display text-xl font-bold" style={{ color: '#f5e8cc' }}>My Orders</h1>
          <p className="font-body text-sm mt-0.5" style={{ color: 'rgba(245,232,204,0.45)' }}>
            {orders.length} order{orders.length !== 1 ? 's' : ''} found
          </p>
        </div>
      </motion.div>

      {orders.map((order: Order, index: number) => {
        const statusUi = getCustomerOrderStatusDisplay(order);
        return (
          <motion.div
            key={order._id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
          >
            <Link href={`/account/orders/${order._id}`}>
              <div className="bg-white rounded-2xl shadow-brand-sm hover:shadow-brand-md transition-all duration-200 group border border-transparent hover:border-brand-border overflow-hidden">
                {/* Top bar */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-brand-border/60">
                  <div className="flex items-center gap-3">
                    <span className="font-display font-semibold text-brand-charcoal text-[15px]">
                      #{order.orderNumber}
                    </span>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-body font-medium capitalize',
                        getStatusColor(statusUi.colorKey)
                      )}
                    >
                      {statusUi.label}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-brand-muted/50 group-hover:text-brand-mustard group-hover:translate-x-0.5 transition-all duration-200" />
                </div>

                {/* Body */}
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-mustard/8 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-brand-mustard" />
                    </div>
                    <div>
                      <p className="font-body text-sm font-medium text-brand-charcoal">
                        {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                      </p>
                      <p className="font-body text-xs text-brand-muted mt-0.5">
                        {order.items
                          .map((item) => item.name)
                          .join(', ')
                          .slice(0, 48)}
                        {order.items.map((item) => item.name).join(', ').length > 48 ? '…' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-bold text-brand-charcoal">
                      {formatPrice(order.total)}
                    </p>
                    <p className="font-body text-xs text-brand-muted mt-0.5">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
