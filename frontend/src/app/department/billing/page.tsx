'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, ArrowRight, CheckCircle2, Truck, Search, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, getStatusColor } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { Order, AdminUser } from '@/types';

export default function BillingDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const { toast } = useToast();

  const [selectedRider, setSelectedRider] = useState<Record<string, string>>({});
  const [reassignRider, setReassignRider] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['department', 'billing', 'orders'],
    queryFn: () => api.getOrders({ forBilling: true, page: 1, limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' }),
    refetchInterval: 15_000,
  });

  const { data: dispatchedData, isLoading: loadingDispatched } = useQuery({
    queryKey: ['department', 'billing', 'dispatched'],
    queryFn: () => api.getOrders({ forDelivery: true, page: 1, limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' }),
    refetchInterval: 15_000,
  });

  const { data: deliveryStaff = [] } = useQuery<AdminUser[]>({
    queryKey: ['delivery-staff'],
    queryFn: () => api.getDeliveryStaff(),
    staleTime: 10 * 60 * 1000,
  });

  const activeRiders = useMemo(() => deliveryStaff.filter((s) => s.isActive), [deliveryStaff]);
  const allOrders = useMemo(() => data?.items ?? [], [data]) as Order[];
  const dispatchedOrders = useMemo(() => dispatchedData?.items ?? [], [dispatchedData]) as Order[];

  const orders = useMemo(() => {
    if (!search.trim()) return allOrders;
    const q = search.trim().toLowerCase();
    return allOrders.filter((o) =>
      o.shippingAddress.name.toLowerCase().includes(q) ||
      o.shippingAddress.phone.includes(q) ||
      o.orderNumber.toLowerCase().includes(q),
    );
  }, [allOrders, search]);

  const filteredDispatched = useMemo(() => {
    if (!search.trim()) return dispatchedOrders;
    const q = search.trim().toLowerCase();
    return dispatchedOrders.filter((o) =>
      o.shippingAddress.name.toLowerCase().includes(q) ||
      o.shippingAddress.phone.includes(q) ||
      o.orderNumber.toLowerCase().includes(q),
    );
  }, [dispatchedOrders, search]);

  const markBilled = useMutation({
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
      await queryClient.cancelQueries({ queryKey: ['department', 'billing', 'orders'] });
      const prev = queryClient.getQueryData(['department', 'billing', 'orders']);
      queryClient.setQueryData(['department', 'billing', 'orders'], (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.filter((o: any) => o._id !== orderId) };
      });
      return { prev };
    },
    onError: (_err, { orderId }, context: any) => {
      if (context?.prev) queryClient.setQueryData(['department', 'billing', 'orders'], context.prev);
      toast({ title: 'Failed to send order', variant: 'destructive' });
    },
    onSuccess: (_, { orderId }) => {
      setSelectedRider((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
      toast({ title: 'Sent for delivery', description: 'Delivery staff has been notified.' });
      queryClient.invalidateQueries({ queryKey: ['department', 'billing', 'dispatched'] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['department', 'billing', 'orders'] });
    },
  });

  const reassign = useMutation({
    mutationFn: ({ orderId, riderId }: { orderId: string; riderId: string }) =>
      api.assignDeliveryRider(orderId, riderId),
    onMutate: async ({ orderId, riderId }) => {
      await queryClient.cancelQueries({ queryKey: ['department', 'billing', 'dispatched'] });
      const prev = queryClient.getQueryData(['department', 'billing', 'dispatched']);
      queryClient.setQueryData(['department', 'billing', 'dispatched'], (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((o: any) => o._id === orderId ? { ...o, assignedDeliveryUserId: riderId } : o) };
      });
      return { prev };
    },
    onSuccess: (_, { orderId }) => {
      setReassignRider((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
      toast({ title: 'Rider reassigned', description: 'Order moved to new delivery staff.' });
    },
    onError: (_err, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(['department', 'billing', 'dispatched'], context.prev);
      toast({ title: 'Reassign failed', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['department', 'billing', 'dispatched'] });
    },
  });

  const getRiderName = (order: Order) => {
    const rider = activeRiders.find((r) => r._id === order.assignedDeliveryUserId);
    return rider?.name ?? 'Unknown rider';
  };

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Billing"
        description="Assign a rider and send packed orders out."
        icon={<FileText className="h-5 w-5 text-sky-600" />}
      />

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Search bar */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            placeholder="Search by name, phone, or order number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 shadow-none h-9 p-0 focus-visible:ring-0"
          />
        </div>

        {/* ── Packed orders waiting to be sent ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Packed — ready to dispatch {orders.length > 0 && `(${orders.length})`}
          </p>

          {isLoading && (
            <div className="flex items-center justify-center h-40">
              <div className="h-8 w-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && orders.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-8">
              {search.trim() ? 'No packed orders match your search.' : 'No packed orders waiting for billing right now.'}
            </div>
          )}

          {!isLoading && activeRiders.length === 0 && allOrders.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No active delivery staff found. Add delivery logins from the admin panel.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => {
              const riderId = selectedRider[order._id] ?? '';
              const canSend = !!riderId;

              return (
                <Card key={order._id} className="border-sky-50 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      {order.source ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none capitalize ${
                          order.source === 'whatsapp' ? 'bg-green-50 text-green-700 border border-green-200' :
                          order.source === 'website' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          order.source === 'phone' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          order.source === 'vayepar' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          'bg-gray-50 text-gray-700 border border-gray-200'
                        }`}>
                          {order.source}
                        </span>
                      ) : (
                        <span />
                      )}
                      <Badge className={getStatusColor(order.status)}>{order.status.replace(/_/g, ' ').toUpperCase()}</Badge>
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-gray-800">
                        {order.shippingAddress.name}
                        <span className="font-normal text-gray-500 text-xs ml-1">
                          · {order.shippingAddress.phone}
                          {order.shippingAddress.alternatePhone && ` / ${order.shippingAddress.alternatePhone}`}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 line-clamp-2">
                        {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} – {order.shippingAddress.pincode}
                      </p>
                      {order.shippingAddress.landmark && (
                        <p className="text-xs text-amber-600">Near: {order.shippingAddress.landmark}</p>
                      )}
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
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${order.paymentMethod === 'cod' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                          {order.paymentMethod === 'cod' ? 'COD' : 'PREPAID'}
                        </span>
                        <span className="font-bold text-gray-900 text-sm">{formatCurrency(order.total)}</span>
                      </div>
                    </div>

                    {/* Rider selector */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
                        <Truck className="h-3 w-3" /> Delivery person
                      </p>
                      <Select
                        value={riderId}
                        onValueChange={(v) => setSelectedRider((prev) => ({ ...prev, [order._id]: v }))}
                        disabled={activeRiders.length === 0}
                      >
                        <SelectTrigger className="h-11 text-sm">
                          <SelectValue placeholder={activeRiders.length === 0 ? 'No riders available' : 'Select rider…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeRiders.map((rider) => (
                            <SelectItem key={rider._id} value={rider._id}>
                              {rider.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        className="flex-1 h-12 text-sm font-semibold gap-2"
                        disabled={!canSend || markBilled.isPending}
                        onClick={() => markBilled.mutate({ orderId: order._id, riderId })}
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        {!riderId ? 'Select rider first' : 'Send for delivery'}
                      </Button>
                      <Link href={`/department/order/${order._id}`}>
                        <Button variant="outline" className="h-12 px-3 flex items-center gap-1">
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

        {/* ── Dispatched orders — reassign rider ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Out for delivery — reassign rider {filteredDispatched.length > 0 && `(${filteredDispatched.length})`}
          </p>

          {loadingDispatched && (
            <div className="flex items-center justify-center h-24">
              <div className="h-6 w-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loadingDispatched && filteredDispatched.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-6">
              {search.trim() ? 'No dispatched orders match your search.' : 'No orders out for delivery right now.'}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDispatched.map((order) => {
              const currentRiderName = getRiderName(order);
              const newRiderId = reassignRider[order._id] ?? '';
              const canReassign = !!newRiderId && newRiderId !== order.assignedDeliveryUserId;

              return (
                <Card key={order._id} className="border-amber-100 shadow-sm bg-amber-50/30">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      {order.source ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none capitalize ${
                          order.source === 'whatsapp' ? 'bg-green-50 text-green-700 border border-green-200' :
                          order.source === 'website' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          order.source === 'phone' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          order.source === 'vayepar' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          'bg-gray-50 text-gray-700 border border-gray-200'
                        }`}>
                          {order.source}
                        </span>
                      ) : (
                        <span />
                      )}
                      <Badge className={getStatusColor(order.status)}>{order.status.replace(/_/g, ' ').toUpperCase()}</Badge>
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-gray-800">
                        {order.shippingAddress.name}
                        <span className="font-normal text-gray-500 text-xs ml-1">
                          · {order.shippingAddress.phone}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 line-clamp-1">
                        {order.shippingAddress.street}, {order.shippingAddress.city}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-xs border-t border-amber-100 pt-2">
                      <span className={`font-semibold px-2 py-0.5 rounded-full ${order.paymentMethod === 'cod' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                        {order.paymentMethod === 'cod' ? 'COD' : 'PREPAID'}
                      </span>
                      <span className="font-bold text-gray-900">{formatCurrency(order.total)}</span>
                    </div>

                    {/* Current rider */}
                    <div className="rounded-lg bg-white border border-amber-100 px-3 py-2 text-xs text-gray-600 flex items-center gap-1.5">
                      <Truck className="h-3 w-3 text-amber-500 shrink-0" />
                      <span>Currently: <span className="font-semibold text-gray-800">{currentRiderName}</span></span>
                    </div>

                    {/* Reassign selector */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
                        <ArrowLeftRight className="h-3 w-3" /> Reassign to
                      </p>
                      <Select
                        value={newRiderId}
                        onValueChange={(v) => setReassignRider((prev) => ({ ...prev, [order._id]: v }))}
                        disabled={activeRiders.length === 0}
                      >
                        <SelectTrigger className="h-10 text-sm">
                          <SelectValue placeholder="Select new rider…" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeRiders.map((rider) => (
                            <SelectItem key={rider._id} value={rider._id}>
                              {rider.name}
                              {rider._id === order.assignedDeliveryUserId && ' (current)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-10 text-sm font-semibold gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                        disabled={!canReassign || reassign.isPending}
                        onClick={() => reassign.mutate({ orderId: order._id, riderId: newRiderId })}
                      >
                        <ArrowLeftRight className="h-4 w-4 shrink-0" />
                        {!newRiderId ? 'Select new rider' : newRiderId === order.assignedDeliveryUserId ? 'Same rider selected' : 'Reassign'}
                      </Button>
                      <Link href={`/department/order/${order._id}`}>
                        <Button variant="outline" className="h-10 px-3 flex items-center gap-1">
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
    </div>
  );
}
