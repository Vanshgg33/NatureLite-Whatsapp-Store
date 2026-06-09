'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, CheckCircle2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, getStatusColor } from '@/lib/utils';
import type { Order } from '@/types';

const CONFETTI_COLORS = ['#fbbf24', '#f87171', '#34d399', '#60a5fa', '#a78bfa', '#fb923c', '#f472b6', '#4ade80'];

export default function PackingDashboardPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [justPacked, setJustPacked] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['department', 'packing', 'orders'],
    queryFn: () => api.getOrders({ forPacking: true, page: 1, limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' }),
    refetchInterval: 15_000,
  });

  const orders = useMemo(() => data?.items ?? [], [data]) as Order[];

  const markPacked = useMutation({
    mutationFn: (orderId: string) => api.markOrderPacked(orderId),
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: ['department', 'packing', 'orders'] });
      // Show the packed animation instantly — don't wait for the server
      setJustPacked(prev => { const next = new Set(prev); next.add(orderId); return next; });
      const prev = queryClient.getQueryData(['department', 'packing', 'orders']);
      return { prev };
    },
    onError: (err, orderId, context: any) => {
      // Revert the optimistic animation
      setJustPacked(prev => { const next = new Set(prev); next.delete(orderId); return next; });
      if (context?.prev) queryClient.setQueryData(['department', 'packing', 'orders'], context.prev);
      toast({
        title: 'Could not update order',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['department', 'billing', 'orders'] });
      setTimeout(() => {
        setJustPacked(prev => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ['department', 'packing', 'orders'] });
      }, 2400);
    },
  });

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Packing"
        description="Confirm packing for preparing orders."
        icon={<Package className="h-5 w-5 text-emerald-600" />}
      />

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && orders.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-12">
            No orders waiting for packing right now.
          </div>
        )}

        <AnimatePresence mode="popLayout">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => {
              const isPacked = justPacked.has(order._id);
              return (
                <motion.div
                  key={order._id}
                  layout
                  exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.35, ease: 'easeIn' } }}
                >
                  <Card className="border-emerald-50 shadow-sm relative overflow-hidden">
                    {/* Packed success overlay */}
                    <AnimatePresence>
                      {isPacked && (
                        <motion.div
                          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg bg-emerald-500"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, transition: { duration: 0.25 } }}
                          transition={{ duration: 0.2 }}
                        >
                          {/* Confetti burst */}
                          {CONFETTI_COLORS.map((color, i) => {
                            const angle = (i / CONFETTI_COLORS.length) * Math.PI * 2;
                            return (
                              <motion.span
                                key={i}
                                className="absolute w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: color, top: '50%', left: '50%' }}
                                initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                                animate={{
                                  x: Math.cos(angle) * 72,
                                  y: Math.sin(angle) * 72,
                                  scale: [0, 1.2, 0.8],
                                  opacity: [1, 1, 0],
                                }}
                                transition={{ duration: 0.75, delay: 0.1, ease: 'easeOut' }}
                              />
                            );
                          })}

                          {/* Checkmark */}
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.08 }}
                          >
                            <CheckCircle2 className="h-16 w-16 text-white drop-shadow-lg" />
                          </motion.div>

                          {/* Label */}
                          <motion.p
                            className="mt-3 text-white font-bold text-xl tracking-tight"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.28 }}
                          >
                            Order Packed!
                          </motion.p>
                          <motion.p
                            className="mt-1 text-emerald-100 text-sm"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.44 }}
                          >
                            Handing off to billing…
                          </motion.p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-gray-400">Order</p>
                          <p className="font-bold text-gray-900 text-base">{order.orderNumber}</p>
                        </div>
                        <Badge className={getStatusColor(order.status)}>{order.status.replace(/_/g, ' ').toUpperCase()}</Badge>
                      </div>

                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-gray-800">
                          {order.shippingAddress.name}
                          <span className="font-normal text-gray-500 text-xs ml-1">· {order.shippingAddress.phone}</span>
                        </p>
                        <p className="text-xs text-gray-400 line-clamp-2">
                          {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} – {order.shippingAddress.pincode}
                        </p>
                      </div>

                      <div className="border-t border-gray-50 pt-2 space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-gray-600 gap-2">
                            <span className="truncate font-medium">
                              {item.name}{item.variantName ? ` (${item.variantName})` : ''}
                            </span>
                            <span className="shrink-0 text-gray-400">× {item.quantity}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1.5 border-t border-gray-50">
                          <span className="text-xs text-gray-400">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                          <span className="font-bold text-gray-900 text-sm">{formatCurrency(order.total)}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          className="flex-1 h-12 text-sm font-semibold gap-2"
                          disabled={markPacked.isPending || isPacked || !!order.packedAt || !['placed', 'confirmed', 'preparing'].includes(order.status)}
                          onClick={() => markPacked.mutate(order._id)}
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          {order.packedAt ? 'Already packed' : 'Mark packed'}
                        </Button>
                        <Link href={`/department/order/${order._id}`}>
                          <Button variant="outline" className="h-12 px-3 flex items-center gap-1">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      </div>
    </div>
  );
}
