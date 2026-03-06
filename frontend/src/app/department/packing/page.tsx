'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { useToast } from '@/components/ui/use-toast';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import type { Order } from '@/types';

export default function PackingDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['department', 'packing', 'orders'],
    queryFn: () =>
      api.getOrders({
        forPacking: true,
        page: 1,
        limit: 50,
      }),
    refetchInterval: 5000,
  });

  const orders = useMemo(() => data?.items ?? [], [data]) as Order[];

  const markPacked = useMutation({
    mutationFn: (orderId: string) =>
      api.updateOrderStatus(orderId, {
        status: 'shipped',
        updatedBy: user?.id,
      }),
    onSuccess: () => {
      toast({
        title: 'Order marked as packed',
        description: 'Billing will see this order in their queue.',
      });
      queryClient.invalidateQueries({ queryKey: ['department', 'packing', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['department', 'billing', 'orders'] });
    },
    onError: (err) => {
      toast({
        title: 'Could not update order',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Packing Dashboard"
        description="See orders waiting to be packed. Mark them as packed to notify billing."
        icon={<Package className="h-6 w-6 text-emerald-600" />}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && orders.length === 0 && (
          <div className="text-center text-sm text-gray-500">No orders waiting for packing right now.</div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <Card key={order._id} className="border-emerald-50 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-500">Order</p>
                    <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                  </div>
                  <Badge className={getStatusColor(order.status)}>{order.status.toUpperCase()}</Badge>
                </div>

                <div className="text-sm space-y-1">
                  <p className="font-medium">
                    {order.shippingAddress.name}{' '}
                    <span className="text-gray-500 text-xs">({order.shippingAddress.phone})</span>
                  </p>
                  <p className="text-gray-500 text-xs">
                    {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} -{' '}
                    {order.shippingAddress.pincode}
                  </p>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {order.items.length} item{order.items.length > 1 ? 's' : ''}
                  </span>
                  <span className="font-semibold">{formatCurrency(order.total)}</span>
                </div>

                <p className="text-xs text-gray-400">Placed {formatDate(order.createdAt)}</p>

                <Button
                  size="sm"
                  className="w-full mt-1 flex items-center justify-center gap-2"
                  disabled={markPacked.isLoading}
                  onClick={() => markPacked.mutate(order._id)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark as packed
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

