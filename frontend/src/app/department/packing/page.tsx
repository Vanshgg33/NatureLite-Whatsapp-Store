'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import type { Order } from '@/types';

export default function PackingDashboardPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['department', 'packing', 'orders'],
    queryFn: () => api.getOrders({ forPacking: true, page: 1, limit: 50 }),
    refetchInterval: 15_000,
  });

  const orders = useMemo(() => data?.items ?? [], [data]) as Order[];

  const markPacked = useMutation({
    mutationFn: (orderId: string) => api.markOrderPacked(orderId),
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: ['department', 'packing', 'orders'] });
      const prev = queryClient.getQueryData(['department', 'packing', 'orders']);
      queryClient.setQueryData(['department', 'packing', 'orders'], (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.filter((o: any) => o._id !== orderId) };
      });
      return { prev };
    },
    onError: (err, _orderId, context: any) => {
      if (context?.prev) queryClient.setQueryData(['department', 'packing', 'orders'], context.prev);
      toast({
        title: 'Could not update order',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      toast({ title: 'Order marked as packed', description: 'Billing can now send it out for delivery.' });
      queryClient.invalidateQueries({ queryKey: ['department', 'billing', 'orders'] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['department', 'packing', 'orders'] });
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <Card key={order._id} className="border-emerald-50 shadow-sm">
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

                <div className="flex items-center justify-between text-sm border-t border-gray-50 pt-2">
                  <span className="text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                  <span className="font-bold text-gray-900">{formatCurrency(order.total)}</span>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1 h-12 text-sm font-semibold gap-2"
                    disabled={markPacked.isPending || !!order.packedAt || !['placed', 'confirmed', 'preparing'].includes(order.status)}
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
          ))}
        </div>
      </div>
    </div>
  );
}
