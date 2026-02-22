'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Package, ChevronRight, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCustomerStore } from '@/lib/customer-store';
import { api } from '@/lib/api';
import { Order } from '@/types';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-purple-100 text-purple-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  out_for_delivery: 'bg-cyan-100 text-cyan-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  returned: 'bg-orange-100 text-orange-800',
};

export default function OrdersPage() {
  const { customer, isAuthenticated } = useCustomerStore();
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['my-orders', page],
    queryFn: () => api.getMyOrders(limit),
    enabled: isAuthenticated,
  });

  const totalPages = 1; // API returns array, no pagination info - could be enhanced

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
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
            <div className="flex justify-between mb-4">
              <div className="h-5 bg-brand-sand rounded w-32" />
              <div className="h-5 bg-brand-sand rounded w-20" />
            </div>
            <div className="h-4 bg-brand-sand rounded w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <motion.div
        className="bg-white rounded-2xl p-12 shadow-brand-sm text-center"
        initial={{ opacity: 0, y: 20 }}
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
        className="bg-white rounded-2xl p-6 shadow-brand-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-display text-2xl font-bold text-brand-charcoal mb-2">
          My Orders
        </h1>
        <p className="font-body text-brand-muted">
          Track and manage your orders
        </p>
      </motion.div>

      {orders.map((order: Order, index: number) => (
        <motion.div
          key={order._id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * index }}
        >
          <Link href={`/account/orders/${order._id}`}>
            <div className="bg-white rounded-2xl p-6 shadow-brand-sm hover:shadow-brand-md transition-shadow group">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-display font-semibold text-brand-charcoal">
                      #{order.orderNumber}
                    </span>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-body font-medium capitalize',
                        statusColors[order.status] || 'bg-gray-100 text-gray-800'
                      )}
                    >
                      {order.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="font-body text-sm text-brand-muted">
                    Placed on {formatDate(order.createdAt)}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-brand-muted group-hover:text-brand-mustard transition-colors" />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-brand-sand flex items-center justify-center">
                    <Package className="w-6 h-6 text-brand-brown" />
                  </div>
                  <div>
                    <p className="font-body text-sm text-brand-charcoal">
                      {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                    </p>
                    <p className="font-body text-xs text-brand-muted">
                      {order.items.map((item) => item.name).join(', ').slice(0, 50)}
                      {order.items.map((item) => item.name).join(', ').length > 50 ? '...' : ''}
                    </p>
                  </div>
                </div>
                <p className="font-display text-lg font-bold text-brand-charcoal">
                  {formatPrice(order.total)}
                </p>
              </div>
            </div>
          </Link>
        </motion.div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="px-4 font-body text-sm text-brand-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
