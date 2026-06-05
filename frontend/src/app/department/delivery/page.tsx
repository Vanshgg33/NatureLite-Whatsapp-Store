'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import {
  Truck,
  Search,
  Camera,
  CheckCircle2,
  Package,
  ImagePlus,
  X,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
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

interface PhotoUploadBoxProps {
  label: string;
  hint: string;
  required?: boolean;
  url: string | undefined;
  uploading: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}

function PhotoUploadBox({ label, hint, required, url, uploading, onFile, onClear }: PhotoUploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {required && <span className="text-xs text-red-500 font-medium">Required</span>}
      </div>
      <p className="text-xs text-gray-500">{hint}</p>

      {url ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <div className="relative w-full" style={{ paddingBottom: '60%' }}>
            <Image src={url} alt={label} fill className="object-contain" sizes="(max-width: 768px) 100vw, 400px" />
          </div>
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm border border-gray-200"
            aria-label="Remove photo"
          >
            <X className="h-3.5 w-3.5 text-gray-700" />
          </button>
          <div className="absolute bottom-2 left-2 bg-green-500/90 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Photo captured
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full min-h-[120px] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 active:bg-gray-100 transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <>
              <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
              <span className="text-sm text-gray-500">Uploading…</span>
            </>
          ) : (
            <>
              <div className="rounded-full bg-white border border-gray-200 p-3 shadow-sm">
                <Camera className="h-6 w-6 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Tap to take photo</span>
              <span className="text-xs text-gray-400">or choose from gallery</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        disabled={uploading}
        onChange={handleChange}
      />
    </div>
  );
}

export default function DeliveryDashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [orderNumber, setOrderNumber] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<DeliveryStatus>('delivery_done');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | undefined>();
  const [deliveryProofUrl, setDeliveryProofUrl] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [uploadingPayment, setUploadingPayment] = useState(false);
  const [uploadingDelivery, setUploadingDelivery] = useState(false);

  const { data: billedData, isLoading: loadingBilled } = useQuery({
    queryKey: ['department', 'delivery', 'orders'],
    queryFn: () => api.getOrders({ forDelivery: true, page: 1, limit: 50 }),
    refetchInterval: 15_000,
  });

  const billedOrders = useMemo(() => (billedData?.items ?? []) as Order[], [billedData]);

  const resetForm = useCallback(() => {
    setSelectedOrder(null);
    setOrderNumber('');
    setPaymentProofUrl(undefined);
    setDeliveryProofUrl(undefined);
    setNote('');
    setStatus('delivery_done');
    setPaymentMethod('cash');
  }, []);

  const selectOrder = (o: Order) => {
    setSelectedOrder(o);
    setPaymentProofUrl(undefined);
    setDeliveryProofUrl(undefined);
    setNote('');
    setStatus('delivery_done');
  };

  const searchOrder = async () => {
    if (!orderNumber.trim()) return;
    try {
      const result = await api.getOrderByNumber(orderNumber.trim());
      selectOrder(result);
    } catch {
      setSelectedOrder(null);
      toast({ title: 'Order not found', description: 'Check the order number and try again.', variant: 'destructive' });
    }
  };

  const uploadPhoto = async (
    file: File,
    folder: string,
    setUrl: (u: string) => void,
    setLoading: (v: boolean) => void,
  ) => {
    setLoading(true);
    try {
      const result = await api.uploadImage(file, folder);
      setUrl(result.secureUrl || result.url);
      toast({ title: 'Photo uploaded', description: 'Image attached successfully.' });
    } catch {
      toast({ title: 'Upload failed', description: 'Please try again or capture a clearer photo.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const isDone = status === 'delivery_done';

  const updateDelivery = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) return;
      if (isDone && !deliveryProofUrl) throw new Error('Please capture a delivery proof photo before marking as delivered.');
      if (isDone && !paymentProofUrl) throw new Error('Please capture a payment proof photo before marking as delivered.');

      return api.updateDeliveryWorkflow(selectedOrder._id, {
        status,
        paymentMethod: isDone ? paymentMethod : undefined,
        paymentProofUrl: isDone ? paymentProofUrl : undefined,
        deliveryProofUrl: isDone ? deliveryProofUrl : undefined,
        note,
      });
    },
    onSuccess: () => {
      toast({ title: 'Delivery updated', description: 'Order status saved successfully.' });
      if (selectedOrder) {
        queryClient.invalidateQueries({ queryKey: ['order', selectedOrder._id] });
        queryClient.invalidateQueries({ queryKey: ['department', 'delivery', 'orders'] });
      }
      resetForm();
    },
    onError: (err) => {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const order = selectedOrder;

  const canSubmit =
    !updateDelivery.isPending &&
    !!order &&
    (!isDone || (!!deliveryProofUrl && !!paymentProofUrl));

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header
        title="Delivery Dashboard"
        description="Select an order, capture photos, and update delivery status."
        icon={<Truck className="h-6 w-6 text-amber-600" />}
      />

      <div className="flex-1 p-4 space-y-4 max-w-2xl mx-auto w-full pb-8">

        {/* Search bar */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-2 items-center shadow-sm">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            placeholder="Search by order number"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            className="border-0 shadow-none h-9 p-0 focus-visible:ring-0"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchOrder(); } }}
          />
          <Button size="sm" variant="outline" onClick={searchOrder} className="shrink-0 h-9">
            Find
          </Button>
        </div>

        {/* Order list */}
        {!order && (
          <>
            {loadingBilled && (
              <p className="text-sm text-gray-400 text-center py-8">Loading orders…</p>
            )}
            {!loadingBilled && billedOrders.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No orders assigned to you. Search by order number if needed.</p>
            )}
            {billedOrders.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  Your assigned orders ({billedOrders.length})
                </p>
                <div className="grid gap-3">
                  {billedOrders.map((o) => (
                    <Card
                      key={o._id}
                      className="border-gray-100 shadow-sm active:shadow-none transition-all cursor-pointer"
                      onClick={() => selectOrder(o)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">{o.orderNumber}</p>
                            <p className="text-sm text-gray-700 truncate">{o.shippingAddress.name}</p>
                            <p className="text-xs text-gray-500">{o.shippingAddress.phone}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {o.shippingAddress.street}, {o.shippingAddress.city}
                            </p>
                          </div>
                          <div className="text-right shrink-0 space-y-2">
                            <p className="font-semibold text-gray-900">{formatCurrency(o.total)}</p>
                            <span className="inline-block bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-100">
                              {o.paymentMethod?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <Button size="sm" className="w-full mt-3 h-9" onClick={(e) => { e.stopPropagation(); selectOrder(o); }}>
                          <Package className="h-3.5 w-3.5 mr-1.5" />
                          Update delivery
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Order detail + action form */}
        {order && (
          <div className="space-y-4">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-gray-500 -mb-1"
              onClick={resetForm}
            >
              ← Back to list
            </button>

            {/* Order summary card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-400">Order</p>
                  <p className="font-bold text-gray-900">{order.orderNumber}</p>
                </div>
                <p className="font-bold text-gray-900">{formatCurrency(order.total)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {order.shippingAddress.name}{' '}
                  <span className="text-gray-400 font-normal text-xs">· {order.shippingAddress.phone}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} – {order.shippingAddress.pincode}
                </p>
              </div>
              <div className="border-t border-gray-50 pt-3 space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between gap-2 text-xs text-gray-700">
                    <span className="truncate">{item.name}{item.variantName ? ` (${item.variantName})` : ''} × {item.quantity}</span>
                    <span className="shrink-0">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status selector */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
              <p className="text-sm font-semibold text-gray-800">Delivery status</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'delivery_done', label: 'Delivered ✓' },
                    { value: 'customer_ringing', label: 'No answer' },
                    { value: 'customer_cancelled', label: 'Cancelled' },
                    { value: 'customer_tomorrow', label: 'Tomorrow' },
                  ] as { value: DeliveryStatus; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`h-11 rounded-xl text-sm font-medium border transition-all ${
                      status === opt.value
                        ? opt.value === 'delivery_done'
                          ? 'bg-green-500 text-white border-green-500'
                          : 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Photos — only required/shown for delivery_done */}
            {isDone && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-5">
                <div className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-gray-800">Delivery photos</p>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Both photos are required to mark this order as delivered.</p>
                </div>

                <PhotoUploadBox
                  label="Delivery proof"
                  hint="Photo of the package handed to customer or placed at door"
                  required
                  url={deliveryProofUrl}
                  uploading={uploadingDelivery}
                  onFile={(f) => uploadPhoto(f, 'delivery-proof', setDeliveryProofUrl, setUploadingDelivery)}
                  onClear={() => setDeliveryProofUrl(undefined)}
                />

                <PhotoUploadBox
                  label="Payment proof"
                  hint="Photo of cash received or UPI payment screen"
                  required
                  url={paymentProofUrl}
                  uploading={uploadingPayment}
                  onFile={(f) => uploadPhoto(f, 'delivery-payments', setPaymentProofUrl, setUploadingPayment)}
                  onClear={() => setPaymentProofUrl(undefined)}
                />

                {/* Payment method */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-800">Payment method</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`h-11 rounded-xl text-sm font-medium border transition-all ${paymentMethod === 'cash' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('upi')}
                      className={`h-11 rounded-xl text-sm font-medium border transition-all ${paymentMethod === 'upi' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}
                    >
                      UPI
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-2">
              <p className="text-sm font-medium text-gray-800">Notes <span className="text-gray-400 font-normal">(optional)</span></p>
              <Textarea
                rows={3}
                placeholder="Any details about this delivery…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="resize-none"
              />
            </div>

            {/* Submit */}
            <Button
              size="lg"
              className={`w-full h-14 text-base font-semibold rounded-2xl transition-all ${
                isDone && canSubmit ? 'bg-green-600 hover:bg-green-700' : ''
              }`}
              onClick={() => updateDelivery.mutate()}
              disabled={!canSubmit}
            >
              {updateDelivery.isPending ? (
                <><RefreshCw className="h-5 w-5 mr-2 animate-spin" /> Saving…</>
              ) : isDone ? (
                <><CheckCircle2 className="h-5 w-5 mr-2" /> Mark as Delivered</>
              ) : (
                <><CheckCircle2 className="h-5 w-5 mr-2" /> Save update</>
              )}
            </Button>

            {isDone && (!deliveryProofUrl || !paymentProofUrl) && (
              <p className="text-xs text-center text-red-500">
                {!deliveryProofUrl && !paymentProofUrl
                  ? 'Both delivery and payment photos are required'
                  : !deliveryProofUrl
                  ? 'Delivery proof photo is required'
                  : 'Payment proof photo is required'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
