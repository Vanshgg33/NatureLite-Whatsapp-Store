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
  const { isAuthenticated, customer } = useCustomerStore();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['my-orders', customer?.id],
    queryFn: () => api.getMyOrders(10),
    enabled: isAuthenticated && !!customer?.id,
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
        {/* Skeleton header */}
        <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(125deg,#5a2f08 0%,#7a4010 30%,#3d1f04 70%,#1e0e02 100%)' }}>
          <div className="px-6 py-6">
            <div className="h-3 bg-white/10 rounded w-16 mb-3" />
            <div className="h-6 bg-white/10 rounded w-28 mb-2" />
            <div className="h-3 bg-white/10 rounded w-20" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-brand-sm animate-pulse">
            <div className="px-6 py-4 border-b border-brand-border/60 flex justify-between">
              <div className="h-4 bg-brand-sand rounded w-28" />
              <div className="h-4 bg-brand-sand rounded w-16" />
            </div>
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-brand-sand" />
                <div>
                  <div className="h-3.5 bg-brand-sand rounded w-20 mb-1.5" />
                  <div className="h-3 bg-brand-sand rounded w-36" />
                </div>
              </div>
              <div className="text-right">
                <div className="h-5 bg-brand-sand rounded w-16 mb-1.5" />
                <div className="h-3 bg-brand-sand rounded w-20" />
              </div>
            </div>
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

      {/* ── Page Header ─────────────────────────────────────────── */}
      <motion.div
        className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(125deg,#5a2f08 0%,#7a4010 30%,#3d1f04 70%,#1e0e02 100%)' }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            top: '-60%',
            right: '-5%',
            width: 240,
            height: 240,
            background: 'radial-gradient(circle,rgba(212,152,64,0.22) 0%,transparent 65%)',
            filter: 'blur(28px)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            mixBlendMode: 'overlay',
          }}
        />
        <div className="relative px-6 py-6 flex items-end justify-between">
          <div>
            <p
              style={{
                fontSize: 10,
                letterSpacing: '0.30em',
                textTransform: 'uppercase',
                color: 'rgba(212,152,64,0.55)',
                fontFamily: 'monospace',
                marginBottom: 4,
              }}
            >
              Account
            </p>
            <h1 className="font-display text-xl font-bold" style={{ color: '#f5e8cc' }}>
              My Orders
            </h1>
          </div>
          <span
            className="font-body text-sm font-medium px-3 py-1 rounded-full"
            style={{
              background: 'rgba(212,152,64,0.18)',
              color: '#d49840',
              border: '1px solid rgba(212,152,64,0.28)',
            }}
          >
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </span>
        </div>
      </motion.div>

      {/* ── Order Cards ─────────────────────────────────────────── */}
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
                        'px-2.5 py-1 rounded-full text-xs font-body font-medium capitalize',
                        getStatusColor(statusUi.colorKey)
                      )}
                    >
                      {statusUi.label}
                    </span>
                    {order.paymentMethod === 'prepaid' && (
                      <span
                        className={cn(
                          'px-2.5 py-1 rounded-full text-xs font-body font-medium capitalize',
                          getStatusColor(order.paymentStatus)
                        )}
                      >
                        {order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-brand-muted/40 group-hover:text-brand-mustard group-hover:translate-x-0.5 transition-all duration-200" />
                </div>

                {/* Body */}
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
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
                          .slice(0, 52)}
                        {order.items.map((item) => item.name).join(', ').length > 52 ? '…' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
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
