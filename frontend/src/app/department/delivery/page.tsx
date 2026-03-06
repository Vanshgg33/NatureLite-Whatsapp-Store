'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { Truck, Search, Camera, CheckCircle2, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import type { Order } from '@/types';

type DeliveryStatus = 'delivery_done' | 'customer_ringing' | 'customer_cancelled' | 'customer_tomorrow';

export default function DeliveryDashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orderNumber, setOrderNumber] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<DeliveryStatus>('delivery_done');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: billedData, isLoading: loadingBilled } = useQuery({
    queryKey: ['department', 'delivery', 'orders'],
    queryFn: () =>
      api.getOrders({
        forDelivery: true,
        page: 1,
        limit: 50,
      }),
    refetchInterval: 5000,
  });

  const billedOrders = useMemo(() => (billedData?.items ?? []) as Order[], [billedData]);
  const order = selectedOrder;

  const searchOrder = async () => {
    if (!orderNumber.trim()) return;
    try {
      const result = await api.getOrderByNumber(orderNumber.trim());
      setSelectedOrder(result);
      setPaymentProofUrl(undefined);
      setNote('');
    } catch {
      setSelectedOrder(null);
      toast({
        title: 'Order not found',
        description: 'Please check the order number and try again.',
        variant: 'destructive',
      });
    }
  };

  const selectOrder = (o: Order) => {
    setSelectedOrder(o);
    setPaymentProofUrl(undefined);
    setNote('');
  };

  const uploadProof = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.uploadImage(file, 'delivery-payments');
      setPaymentProofUrl(result.url);
      toast({
        title: 'Payment photo uploaded',
        description: 'The image has been attached to this delivery.',
      });
    } catch {
      toast({
        title: 'Upload failed',
        description: 'Please try again or capture a clearer photo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const updateDelivery = useMutation({
    mutationFn: async () => {
      if (!order) return;

      if (status === 'delivery_done' && !paymentProofUrl) {
        throw new Error('Please upload a payment photo before marking as delivered.');
      }

      return api.updateDeliveryWorkflow(order._id, {
        status,
        paymentMethod,
        paymentProofUrl,
        note,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Delivery status updated',
        description: 'The order has been updated successfully.',
      });
      if (order) {
        queryClient.invalidateQueries({ queryKey: ['order', order._id] });
        queryClient.invalidateQueries({ queryKey: ['department', 'delivery', 'orders'] });
      }
      setSelectedOrder(null);
      setOrderNumber('');
      setPaymentProofUrl(undefined);
      setNote('');
    },
    onError: (err) => {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Delivery Partner Dashboard"
        description="Billed orders ready for delivery. Select one, capture payment, and mark status."
        icon={<Truck className="h-6 w-6 text-amber-600" />}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Or search by Order Number"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="h-10"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  searchOrder();
                }
              }}
            />
          </div>
          <Button variant="outline" className="sm:h-10" onClick={searchOrder}>
            Find order
          </Button>
        </div>

        {!order && billedOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-800">Billed orders (ready for delivery)</p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {billedOrders.map((o) => (
                <Card
                  key={o._id}
                  className="border-amber-50 cursor-pointer hover:border-amber-200 transition-colors"
                  onClick={() => selectOrder(o)}
                >
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{o.orderNumber}</span>
                      <span className="text-sm font-medium">{formatCurrency(o.total)}</span>
                    </div>
                    <p className="text-xs text-gray-600 truncate">
                      {o.shippingAddress.name} · {o.shippingAddress.phone}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {o.shippingAddress.street}, {o.shippingAddress.city}
                    </p>
                    <Button
                      size="sm"
                      className="w-full mt-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectOrder(o);
                      }}
                    >
                      <Package className="h-4 w-4 mr-1" />
                      Update delivery
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!order && (loadingBilled || billedOrders.length === 0) && (
          <p className="text-sm text-gray-500">
            {loadingBilled ? 'Loading billed orders...' : 'No billed orders waiting for delivery. Search by order number if needed.'}
          </p>
        )}

        {order && (
          <>
            <Button
              variant="ghost"
              className="text-sm -mb-2"
              onClick={() => {
                setSelectedOrder(null);
                setOrderNumber('');
                setPaymentProofUrl(undefined);
                setNote('');
              }}
            >
              ← Back to list
            </Button>
            <div className="grid gap-6 md:grid-cols-[2fr,1.5fr]">
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Order</p>
                  <p className="font-semibold text-gray-900">{order.orderNumber}</p>
                </div>
                <p className="text-sm font-semibold">{formatCurrency(order.total)}</p>
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

              <div className="mt-3 space-y-1 text-sm">
                <p className="font-medium">Products</p>
                <ul className="space-y-1 text-xs text-gray-700">
                  {order.items.map((item, idx) => (
                    <li key={idx} className="flex justify-between gap-2">
                      <span className="truncate">
                        {item.name} x {item.quantity}
                      </span>
                      <span>{formatCurrency(item.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-800">Payment details</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    className="h-9 text-xs"
                    onClick={() => setPaymentMethod('cash')}
                  >
                    Cash
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === 'upi' ? 'default' : 'outline'}
                    className="h-9 text-xs"
                    onClick={() => setPaymentMethod('upi')}
                  >
                    UPI
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-800">Payment photo</p>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                    <Camera className="h-4 w-4" />
                    <span>{uploading ? 'Uploading...' : 'Upload photo'}</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadProof(file);
                      }}
                    />
                  </label>
                  {paymentProofUrl && (
                    <div className="relative h-14 w-14 rounded-lg overflow-hidden border">
                      <Image src={paymentProofUrl} alt="Payment" fill className="object-cover" />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-800">Order status</p>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as DeliveryStatus)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery_done">Delivery done</SelectItem>
                    <SelectItem value="customer_ringing">Customer ringing</SelectItem>
                    <SelectItem value="customer_cancelled">Customer cancelled order</SelectItem>
                    <SelectItem value="customer_tomorrow">Customer told tomorrow</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-800">Notes (optional)</p>
                <Textarea
                  rows={3}
                  placeholder="Any additional details about this delivery..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <Button
                className="w-full flex items-center justify-center gap-2"
                onClick={() => updateDelivery.mutate()}
                disabled={updateDelivery.isLoading || !order}
              >
                <CheckCircle2 className="h-4 w-4" />
                Save delivery update
              </Button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

