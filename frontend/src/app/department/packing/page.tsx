'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, ArrowRight, Truck, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, getStatusColor } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import type { Order, AdminUser } from '@/types';

export default function PackingDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const { toast } = useToast();
  const [selectedRider, setSelectedRider] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['department', 'packing', 'orders'],
    queryFn: () => api.getOrders({ forPacking: true, page: 1, limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' }),
    refetchInterval: 5_000,
  });

  const { data: deliveryStaff = [] } = useQuery<AdminUser[]>({
    queryKey: ['delivery-staff'],
    queryFn: () => api.getDeliveryStaff(),
    staleTime: 10 * 60 * 1000,
  });

  const activeRiders = useMemo(() => deliveryStaff.filter((s) => s.isActive), [deliveryStaff]);
  const orders = useMemo(() => data?.items ?? [], [data]) as Order[];

  const assignDelivery = useMutation({
    mutationFn: ({ orderId, riderId }: { orderId: string; riderId: string }) => {
      const rider = activeRiders.find((r) => r._id === riderId);
      return api.updateOrderStatus(orderId, {
        status: 'out_for_delivery',
        updatedBy: user?.id,
        assignedTo: riderId,
        assignedToName: rider?.name,
        assignedToPhone: rider?.phone,
      });
    },
    onMutate: async ({ orderId }) => {
      await queryClient.cancelQueries({ queryKey: ['department', 'packing', 'orders'] });
      const prev = queryClient.getQueryData(['department', 'packing', 'orders']);
      return { prev };
    },
    onSuccess: (_, { orderId }) => {
      setSelectedRider((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
      toast({ title: 'Sent for delivery', description: 'Delivery staff notified.' });
      queryClient.invalidateQueries({ queryKey: ['department', 'packing', 'orders'] });
    },
    onError: (_err, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(['department', 'packing', 'orders'], context.prev);
      toast({ title: 'Failed to assign delivery', variant: 'destructive' });
    },
  });

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Packing"
        description="Review orders before packing."
        icon={<Package className="h-5 w-5 text-emerald-600" />}
      />

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && orders.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-12">No orders in the packing queue.</div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const isPacked = !!order.packedAt;
            const riderId = selectedRider[order._id] ?? '';

            return (
              <Card key={order._id} className={`shadow-sm ${isPacked ? 'border-emerald-200' : 'border-gray-100'}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-end gap-2">
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                      {isPacked && (
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Packed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-gray-800">{order.shippingAddress.name}</p>
                    <p className="text-xs text-gray-500">{order.shippingAddress.phone}</p>
                    <p className="text-xs text-gray-400 line-clamp-1">
                      {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state}
                    </p>
                  </div>

                  <div className="border-t border-gray-50 pt-2 space-y-1">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-gray-600 gap-2">
                        <span className="truncate font-medium">
                          {item.name}{item.variantName ? ` (${item.variantName})` : ''}
                        </span>
                        <span className="shrink-0 font-bold text-gray-700">× {item.quantity}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-50">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${order.paymentMethod === 'cod' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                        {order.paymentMethod === 'cod' ? 'COD' : 'PREPAID'}
                      </span>
                      <span className="font-bold text-gray-900 text-sm">{formatCurrency(order.total)}</span>
                    </div>
                  </div>

                  {!isPacked ? (
                    <Link href={`/department/packing/${order._id}`} className="block">
                      <Button className="w-full h-12 text-sm font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700">
                        <ArrowRight className="h-4 w-4 shrink-0" />
                        View Details
                      </Button>
                    </Link>
                  ) : (
                    <div className="space-y-2">
                      {activeRiders.length === 0 && (
                        <p className="text-xs text-amber-600 text-center">No active riders — add delivery staff first.</p>
                      )}
                      <Select
                        value={riderId}
                        onValueChange={(v) => setSelectedRider((prev) => ({ ...prev, [order._id]: v }))}
                        disabled={activeRiders.length === 0}
                      >
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue placeholder={activeRiders.length === 0 ? 'No riders available' : 'Select delivery boy…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeRiders.map((rider) => (
                            <SelectItem key={rider._id} value={rider._id}>{rider.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 h-10 text-sm font-semibold gap-2"
                          disabled={!riderId || assignDelivery.isPending}
                          onClick={() => assignDelivery.mutate({ orderId: order._id, riderId })}
                        >
                          <Truck className="h-4 w-4 shrink-0" />
                          {!riderId ? 'Select rider' : 'Assign Delivery Boy'}
                        </Button>
                        <Link href={`/department/packing/${order._id}`}>
                          <Button variant="outline" className="h-10 px-3">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
