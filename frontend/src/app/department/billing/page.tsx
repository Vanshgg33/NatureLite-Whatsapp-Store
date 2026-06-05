'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, ArrowRight, CheckCircle2, Truck } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { Order, AdminUser } from '@/types';

export default function BillingDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const { toast } = useToast();

  // Per-order delivery assignment selection
  const [selectedRider, setSelectedRider] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['department', 'billing', 'orders'],
    queryFn: () =>
      api.getOrders({
        forBilling: true,
        page: 1,
        limit: 50,
      }),
    refetchInterval: 15_000,
  });

  const { data: deliveryStaff = [] } = useQuery<AdminUser[]>({
    queryKey: ['delivery-staff'],
    queryFn: () => api.getDeliveryStaff(),
    staleTime: 60_000,
  });

  const activeRiders = useMemo(
    () => deliveryStaff.filter((s) => s.isActive),
    [deliveryStaff],
  );

  const orders = useMemo(() => data?.items ?? [], [data]) as Order[];

  const markBilled = useMutation({
    mutationFn: ({ orderId, riderId }: { orderId: string; riderId: string }) =>
      api.updateOrderStatus(orderId, {
        status: 'out_for_delivery',
        updatedBy: user?.id,
        assignedTo: riderId,
      }),
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ['department', 'billing', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['department', 'delivery', 'orders'] });
      setSelectedRider((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      toast({ title: 'Order sent for delivery', description: 'Delivery staff has been notified.' });
    },
    onError: () => {
      toast({ title: 'Failed to send order', variant: 'destructive' });
    },
  });

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Billing Dashboard"
        description="Packed orders ready for billing — assign a delivery person and send out."
        icon={<FileText className="h-6 w-6 text-sky-600" />}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <div className="h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && orders.length === 0 && (
          <div className="text-center text-sm text-gray-500">
            No packed orders waiting for billing right now.
          </div>
        )}

        {!isLoading && activeRiders.length === 0 && orders.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No active delivery staff found. Add delivery logins before sending orders out.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const riderId = selectedRider[order._id] ?? '';
            const canSend = order.status === 'preparing' && !!order.packedAt && !!riderId;

            return (
              <Card key={order._id} className="border-sky-50 shadow-sm">
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
                      {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} –{' '}
                      {order.shippingAddress.pincode}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      {order.items.length} item{order.items.length > 1 ? 's' : ''}
                    </span>
                    <span className="font-semibold">{formatCurrency(order.total)}</span>
                  </div>

                  {/* Delivery staff selector */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Assign delivery person
                    </label>
                    <Select
                      value={riderId}
                      onValueChange={(v) => setSelectedRider((prev) => ({ ...prev, [order._id]: v }))}
                      disabled={activeRiders.length === 0}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={activeRiders.length === 0 ? 'No riders available' : 'Select rider…'} />
                      </SelectTrigger>
                      <SelectContent>
                        {activeRiders.map((rider) => (
                          <SelectItem key={rider._id} value={rider._id} className="text-xs">
                            {rider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 mt-1">
                    <Button
                      size="sm"
                      className="flex-1 flex items-center justify-center gap-2"
                      disabled={!canSend || markBilled.isPending}
                      onClick={() => markBilled.mutate({ orderId: order._id, riderId })}
                      title={!riderId ? 'Select a delivery person first' : undefined}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Send out for delivery
                    </Button>
                    <Link href={`/department/order/${order._id}`}>
                      <Button size="sm" variant="outline" className="flex items-center justify-center gap-1">
                        Open
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
