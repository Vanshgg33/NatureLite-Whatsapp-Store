'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, ArrowRight, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
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
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['department', 'packing', 'orders'],
    queryFn: () => api.getOrders({ forPacking: true, page: 1, limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' }),
    refetchInterval: 10_000,
  });

  const allOrders = useMemo(() => data?.items ?? [], [data]) as Order[];
  const orders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? allOrders
      : allOrders.filter((o) =>
          o.shippingAddress.name.toLowerCase().includes(q) ||
          o.shippingAddress.phone?.includes(q) ||
          o.orderNumber?.toLowerCase().includes(q),
        );
    // Repack-required orders always float to the top
    return [...filtered].sort((a, b) => {
      if (a.repackRequired && !b.repackRequired) return -1;
      if (!a.repackRequired && b.repackRequired) return 1;
      return 0;
    });
  }, [allOrders, search]);

  const deleteOrder = useMutation({
    mutationFn: (orderId: string) => api.dismissOrderFromView(orderId, 'packing'),
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: ['department', 'packing', 'orders'] });
      const prev = queryClient.getQueryData(['department', 'packing', 'orders']);
      queryClient.setQueryData(['department', 'packing', 'orders'], (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.filter((o: any) => o._id !== orderId) };
      });
      return { prev };
    },
    onSuccess: () => {
      toast({ title: 'Order removed from packing queue' });
    },
    onError: (_err, _vars, context: any) => {
      if (context?.prev) queryClient.setQueryData(['department', 'packing', 'orders'], context.prev);
      toast({ title: 'Failed to remove order', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['department', 'packing', 'orders'] });
    },
  });

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Packing"
        description="Review orders before packing."
        icon={<Package className="h-5 w-5 text-emerald-600" />}
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search by name, phone, order…"
      />

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && orders.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-12">
            {search.trim() ? `No orders matching "${search}".` : 'No orders in the packing queue.'}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const isPacked = !!order.packedAt;
            const isRepack = !!order.repackRequired;
            const editChanges = order.editChanges ?? [];

            return (
              <Card key={order._id} className={`shadow-sm ${isRepack ? 'border-2 border-orange-400 bg-orange-50' : isPacked ? 'border-emerald-200' : 'border-gray-100'}`}>
                <CardContent className="p-4 space-y-3">

                  {/* REPACK BANNER */}
                  {isRepack && (
                    <div className="flex items-center gap-2 bg-orange-500 text-white rounded-lg px-3 py-2 -mx-0 -mt-0">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span className="text-xs font-black uppercase tracking-wide">Order Edited — Repack Required</span>
                    </div>
                  )}

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
                    <div className="flex items-center gap-1.5">
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={getStatusColor(order.status)}>
                          {order.status.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                        {isPacked && !isRepack && (
                          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Packed
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => { if (window.confirm('Remove from packing queue? The order stays in the system and can be restored from admin orders.')) deleteOrder.mutate(order._id); }}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-400">{formatDate(order.createdAt)}</p>

                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-gray-800">{order.shippingAddress.name}</p>
                    <p className="text-xs text-gray-500">
                      {order.shippingAddress.phone}
                      {order.shippingAddress.alternatePhone && ` / ${order.shippingAddress.alternatePhone}`}
                    </p>
                    <p className="text-xs text-gray-400 line-clamp-1">
                      {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state}
                    </p>
                  </div>

                  <div className="border-t border-gray-50 pt-2 space-y-1">
                    {/* Removed items (no longer in order.items) */}
                    {isRepack && editChanges.filter((c) => c.type === 'item_removed').map((c, idx) => (
                      <div key={`removed-${idx}`} className="flex justify-between text-xs gap-2 bg-red-100 border border-red-300 rounded px-2 py-1">
                        <span className="truncate font-medium text-red-700 line-through">
                          {c.name}{c.variantName ? ` (${c.variantName})` : ''}
                        </span>
                        <span className="shrink-0 font-bold text-red-600 line-through">× {c.oldQty}</span>
                      </div>
                    ))}
                    {order.items.map((item, idx) => {
                      const itemProductId = typeof item.product === 'string' ? item.product : (item.product as any)?._id;
                      const change = isRepack
                        ? editChanges.find(
                            (c) =>
                              (c.productId ? c.productId === itemProductId : c.name === item.name) &&
                              (c.variantSku || '') === (item.variantSku || '') &&
                              c.type !== 'item_removed',
                          )
                        : undefined;
                      const isAdded = change?.type === 'item_added';
                      const isQtyChanged = change?.type === 'qty_changed';
                      return (
                        <div
                          key={idx}
                          className={`flex justify-between text-xs gap-2 rounded px-2 py-1 ${
                            isAdded
                              ? 'bg-green-100 border border-green-300'
                              : isQtyChanged
                              ? 'bg-orange-100 border border-orange-300'
                              : 'text-gray-600'
                          }`}
                        >
                          <span className={`truncate font-medium ${isAdded ? 'text-green-700' : isQtyChanged ? 'text-orange-700' : ''}`}>
                            {item.name}{item.variantName ? ` (${item.variantName})` : ''}
                            {isAdded && <span className="ml-1 text-[9px] font-black bg-green-600 text-white rounded px-1 py-0.5">NEW</span>}
                          </span>
                          <span className={`shrink-0 font-bold ${isAdded ? 'text-green-700' : isQtyChanged ? 'text-orange-700' : 'text-gray-700'}`}>
                            {isQtyChanged && <span className="line-through text-gray-400 mr-1">× {change.oldQty}</span>}
                            × {item.quantity}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-50">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${order.paymentMethod === 'cod' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                        {order.paymentMethod === 'cod' ? 'COD' : 'PREPAID'}
                      </span>
                      <span className="font-bold text-gray-900 text-sm">{formatCurrency(order.total)}</span>
                    </div>
                  </div>

                  <Link href={`/department/packing/${order._id}`} className="block">
                    <Button className="w-full h-12 text-sm font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700">
                      <ArrowRight className="h-4 w-4 shrink-0" />
                      View Details
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
