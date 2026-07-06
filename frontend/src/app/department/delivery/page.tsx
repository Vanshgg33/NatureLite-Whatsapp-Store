'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiError } from '@/lib/api-error';
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
  MapPin,
  Phone,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import type { Order } from '@/types';

type DeliveryStatus = 'delivery_done' | 'customer_ringing' | 'customer_cancelled' | 'customer_tomorrow' | 'unpaid' | 'partial_payment';

// ─── Photo upload box ─────────────────────────────────────────────────────────

interface PhotoUploadBoxProps {
  label: string;
  hint: string;
  required?: boolean;
  url: string | undefined;
  uploading: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
  onBeforeOpen?: () => Promise<void>;
}

function PhotoUploadBox({ label, hint, required, url, uploading, onFile, onClear, onBeforeOpen }: PhotoUploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Incrementing the key forces the input to remount after each selection,
  // clearing any stale browser state that could retrigger the camera on Android.
  const [inputKey, setInputKey] = useState(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    setInputKey((k) => k + 1);
  };

  const handleOpen = async () => {
    // Refresh the access token before the file picker opens. On low-memory
    // Android devices the camera can kill the browser renderer; refreshing now
    // ensures a fresh token is written to localStorage so the page reload that
    // follows can re-authenticate without a redirect to the login screen.
    try { await onBeforeOpen?.(); } catch { /* best-effort */ }
    inputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {required && <span className="text-xs text-red-500 font-medium">Required</span>}
      </div>
      <p className="text-xs text-gray-500">{hint}</p>

      {url ? (
        <div
          className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50"
          onClick={(e) => e.stopPropagation()}
        >
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <div className="relative w-full" style={{ paddingBottom: '60%' }}>
              <Image src={url} alt={label} fill className="object-contain" sizes="(max-width: 768px) 100vw, 400px" />
            </div>
          </a>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
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
          onClick={handleOpen}
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

      {/* capture="environment" is intentionally omitted — it forces Chrome Android to launch
          the native camera as a separate Activity, which kills the browser renderer on low-memory
          phones and causes a full page reload. Without capture, Chrome opens an in-process file
          picker (bottom sheet) where the user can still tap "Camera", keeping the renderer alive. */}
      <input
        key={inputKey}
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        disabled={uploading || !!url}
        onChange={handleChange}
      />
    </div>
  );
}

// ─── Confirmation dialog ──────────────────────────────────────────────────────

interface ConfirmDeliveryDialogProps {
  open: boolean;
  order: Order;
  status: DeliveryStatus;
  deliveryProofUrl: string;
  paymentProofUrl: string | undefined;
  paymentMethod: 'cash' | 'upi';
  amountCollected: string;
  cashAmount: string;
  upiAmount: string;
  note: string;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDeliveryDialog({
  open,
  order,
  status,
  deliveryProofUrl,
  paymentProofUrl,
  paymentMethod,
  amountCollected,
  cashAmount,
  upiAmount,
  note,
  submitting,
  onConfirm,
  onCancel,
}: ConfirmDeliveryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onCancel(); }}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold text-gray-900">
            Confirm delivery
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Review everything before marking this order as delivered. This cannot be undone.
          </p>
        </DialogHeader>

        <div className="px-5 pb-2 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Order summary */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</span>
              <span className="text-sm font-bold text-gray-900">{order.orderNumber}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-700">
              <Phone className="h-3 w-3 text-gray-400" />
              {order.shippingAddress.name} · {order.shippingAddress.phone}
              {order.shippingAddress.alternatePhone && ` / ${order.shippingAddress.alternatePhone}`}
            </div>
            <div className="flex items-start gap-1.5 text-xs text-gray-500">
              <MapPin className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
              <span>{order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} – {order.shippingAddress.pincode}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-gray-200">
              <span className="text-xs text-gray-500">Order total</span>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(order.total)}</span>
            </div>
            {status === 'unpaid' ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Status</span>
                <span className="text-sm font-bold text-red-600">Unpaid — ₹0 collected</span>
              </div>
            ) : status === 'partial_payment' ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Cash collected</span>
                  <span className="text-sm font-bold text-gray-900">₹ {(parseFloat(cashAmount) || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">UPI collected</span>
                  <span className="text-sm font-bold text-gray-900">₹ {(parseFloat(upiAmount) || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total collected</span>
                  <span className="text-sm font-bold text-green-700">₹ {((parseFloat(cashAmount) || 0) + (parseFloat(upiAmount) || 0)).toLocaleString('en-IN')}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Amount collected</span>
                  <span className={`text-sm font-bold ${amountCollected ? 'text-green-700' : 'text-gray-400 italic'}`}>
                    {amountCollected ? `₹ ${parseFloat(amountCollected).toLocaleString('en-IN')}` : 'Not entered'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Payment via</span>
                  <span className="text-xs font-semibold text-gray-700 uppercase">{paymentMethod}</span>
                </div>
              </>
            )}
          </div>

          {/* Photos */}
          <div className={`grid gap-2 ${paymentProofUrl ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-600">Delivery proof</p>
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ paddingBottom: '75%' }}>
                <Image src={deliveryProofUrl} alt="Delivery proof" fill className="object-cover" sizes="150px" />
                <div className="absolute inset-0 flex items-end p-1">
                  <span className="bg-green-500/90 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <CheckCircle2 className="h-2.5 w-2.5" /> OK
                  </span>
                </div>
              </div>
            </div>
            {paymentProofUrl && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-600">Payment proof</p>
                <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ paddingBottom: '75%' }}>
                  <Image src={paymentProofUrl} alt="Payment proof" fill className="object-cover" sizes="150px" />
                  <div className="absolute inset-0 flex items-end p-1">
                    <span className="bg-green-500/90 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" /> OK
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {note ? (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-medium text-gray-500 mb-0.5">Note</p>
              <p className="text-xs text-gray-700">{note}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="px-5 pt-3 pb-5 flex flex-col gap-2">
          <Button
            className="w-full h-11 bg-green-600 hover:bg-green-700 font-semibold rounded-xl"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-2" /> Yes, mark as delivered</>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl"
            onClick={onCancel}
            disabled={submitting}
          >
            Go back & review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DELIVERY_STATE_BASE_KEY = 'nl-delivery-form';
const DELIVERY_STATE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — auto-expire stale recovery state

export default function DeliveryDashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  // Per-user key prevents a different delivery staff member on the same device from
  // triggering a recovery attempt against another person's order.
  const deliveryStateKey = user?.id ? `${DELIVERY_STATE_BASE_KEY}-${user.id}` : DELIVERY_STATE_BASE_KEY;

  const [orderNumber, setOrderNumber] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<DeliveryStatus>('delivery_done');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | undefined>();
  const [deliveryProofUrl, setDeliveryProofUrl] = useState<string | undefined>();
  const [amountCollected, setAmountCollected] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [note, setNote] = useState('');
  const [uploadingPayment, setUploadingPayment] = useState(false);
  const [uploadingDelivery, setUploadingDelivery] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const { data: billedData, isLoading: loadingBilled } = useQuery({
    queryKey: ['department', 'delivery', 'orders'],
    queryFn: () => api.getOrders({ forDelivery: true, page: 1, limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' }),
    refetchInterval: 15_000,
  });

  const billedOrders = useMemo(() => (billedData?.items ?? []) as Order[], [billedData]);

  const filteredBilledOrders = useMemo(() => {
    if (!orderNumber.trim()) return billedOrders;
    const q = orderNumber.trim().toLowerCase();
    return billedOrders.filter(o =>
      o.shippingAddress.name.toLowerCase().includes(q) ||
      o.shippingAddress.phone.includes(q) ||
      (o.shippingAddress.alternatePhone ?? '').includes(q) ||
      o.orderNumber.toLowerCase().includes(q)
    );
  }, [billedOrders, orderNumber]);

  // Restore state from localStorage on mount (handles Android camera-kill page reload)
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(deliveryStateKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        orderId?: string;
        status?: DeliveryStatus;
        paymentMethod?: 'cash' | 'upi';
        amountCollected?: string;
        cashAmount?: string;
        upiAmount?: string;
        note?: string;
        deliveryProofUrl?: string | null;
        paymentProofUrl?: string | null;
        savedAt?: number;
      };
      if (!saved?.orderId) return;
      // Treat missing timestamp as stale, or expire after TTL
      if (!saved.savedAt || Date.now() - saved.savedAt > DELIVERY_STATE_TTL_MS) {
        localStorage.removeItem(deliveryStateKey);
        return;
      }

      // Restore form fields immediately so they're ready when the order loads
      if (saved.status) setStatus(saved.status);
      if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
      if (saved.amountCollected !== undefined) setAmountCollected(saved.amountCollected);
      if (saved.cashAmount !== undefined) setCashAmount(saved.cashAmount);
      if (saved.upiAmount !== undefined) setUpiAmount(saved.upiAmount);
      if (saved.note) setNote(saved.note);
      if (saved.deliveryProofUrl) setDeliveryProofUrl(saved.deliveryProofUrl);
      if (saved.paymentProofUrl) setPaymentProofUrl(saved.paymentProofUrl);

      setRestoring(true);
      api.getOrder(saved.orderId)
        .then((order) => {
          if (!cancelled) {
            // Don't restore if the order was already delivered/cancelled while the tab was dead
            if (order.status !== 'out_for_delivery') {
              localStorage.removeItem(deliveryStateKey);
              setRestoring(false);
              return;
            }
            setSelectedOrder(order);
            setRestoring(false);
            toast({ title: 'Session restored', description: 'Your previous order has been reloaded.' });
          }
        })
        .catch(() => {
          if (!cancelled) {
            localStorage.removeItem(deliveryStateKey);
            setRestoring(false);
          }
        });
    } catch {
      localStorage.removeItem(deliveryStateKey);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist form state to localStorage so a camera-triggered page reload can recover
  useEffect(() => {
    if (!selectedOrder) return;
    try {
      localStorage.setItem(deliveryStateKey, JSON.stringify({
        orderId: selectedOrder._id,
        status,
        paymentMethod,
        amountCollected,
        cashAmount,
        upiAmount,
        note,
        deliveryProofUrl: deliveryProofUrl ?? null,
        paymentProofUrl: paymentProofUrl ?? null,
        savedAt: Date.now(),
      }));
    } catch {}
  }, [selectedOrder, status, paymentMethod, amountCollected, cashAmount, upiAmount, note, deliveryProofUrl, paymentProofUrl, deliveryStateKey]);

  const resetForm = useCallback(() => {
    try { localStorage.removeItem(deliveryStateKey); } catch {}
    setSelectedOrder(null);
    setOrderNumber('');
    setPaymentProofUrl(undefined);
    setDeliveryProofUrl(undefined);
    setAmountCollected('');
    setCashAmount('');
    setUpiAmount('');
    setNote('');
    setStatus('delivery_done');
    setPaymentMethod('cash');
    setShowConfirm(false);
  }, [deliveryStateKey]);

  const isCod = (o: Order) => o.paymentMethod === 'cod';

  const selectOrder = (o: Order) => {
    setSelectedOrder(o);
    setPaymentProofUrl(undefined);
    setDeliveryProofUrl(undefined);
    setAmountCollected(isCod(o) ? '' : '0');
    setCashAmount('');
    setUpiAmount('');
    setNote('');
    setStatus('delivery_done');
    setPaymentMethod(o.paymentMethod === 'upi' ? 'upi' : 'cash');
    setShowConfirm(false);
  };

  const searchOrder = () => {
    if (!orderNumber.trim()) return;
    if (filteredBilledOrders.length === 1) {
      selectOrder(filteredBilledOrders[0]);
    } else if (filteredBilledOrders.length === 0) {
      toast({ title: 'Not found', description: 'No assigned order matches that search.', variant: 'destructive' });
    }
    // multiple results → list stays visible, delivery boy picks manually
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
    } catch {
      toast({ title: 'Upload failed', description: 'Please try again or capture a clearer photo.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const isDone = status === 'delivery_done';
  const isUnpaid = status === 'unpaid';
  const isPartial = status === 'partial_payment';
  const needsDeliveryProof = isDone || isUnpaid || isPartial;

  const updateDelivery = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) throw new Error('No order selected');
      const parsedAmount = parseFloat(amountCollected);
      const isUnpaid = status === 'unpaid';
      const isPartial = status === 'partial_payment';
      const needsDelivery = isDone || isUnpaid || isPartial;
      const parsedCash = parseFloat(cashAmount) || 0;
      const parsedUpi = parseFloat(upiAmount) || 0;
      return api.updateDeliveryWorkflow(selectedOrder._id, {
        status,
        paymentMethod: isDone ? paymentMethod : undefined,
        paymentProofUrl: (isDone || isPartial) ? paymentProofUrl : undefined,
        deliveryProofUrl: needsDelivery ? deliveryProofUrl : undefined,
        amountCollected: isDone && !isNaN(parsedAmount) ? parsedAmount : isPartial ? parsedCash + parsedUpi : undefined,
        cashAmount: isPartial ? parsedCash : undefined,
        upiAmount: isPartial ? parsedUpi : undefined,
        note,
      });
    },
    onMutate: async () => {
      if (!selectedOrder) return;
      await queryClient.cancelQueries({ queryKey: ['department', 'delivery', 'orders'] });
      const prev = queryClient.getQueryData(['department', 'delivery', 'orders']);
      queryClient.setQueryData(['department', 'delivery', 'orders'], (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.filter((o: any) => o._id !== selectedOrder._id) };
      });
      return { prev };
    },
    onSuccess: () => {
      toast({ title: 'Delivery marked ✓', description: 'Order has been confirmed.' });
      resetForm();
    },
    onError: (err, _, context: any) => {
      if (context?.prev) queryClient.setQueryData(['department', 'delivery', 'orders'], context.prev);
      setShowConfirm(false);
      toast({
        title: 'Update failed',
        description: getApiError(err, 'Please try again.'),
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['department', 'delivery', 'orders'] });
    },
  });

  const order = selectedOrder;
  const orderIsCod = order ? isCod(order) : true;
  const uploading = uploadingPayment || uploadingDelivery;
  const partialAmountsValid = !isPartial || (parseFloat(cashAmount) || 0) + (parseFloat(upiAmount) || 0) > 0;
  const canOpenConfirm = !uploading && !!order && needsDeliveryProof && !!deliveryProofUrl && partialAmountsValid;
  const canSubmitOther = !updateDelivery.isPending && !uploading && !!order && !needsDeliveryProof;

  const handlePrimaryButton = () => {
    if (needsDeliveryProof) {
      setShowConfirm(true);
    } else {
      updateDelivery.mutate();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header
        title="Delivery Dashboard"
        description="Select an order, capture photos, and update delivery status."
        icon={<Truck className="h-6 w-6 text-amber-600" />}
      />

      <div className="flex-1 p-4 space-y-4 max-w-2xl mx-auto w-full pb-8">

        {/* Camera-reload recovery banner */}
        {restoring && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-sm text-amber-700">
            <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
            Restoring your session after camera reload…
          </div>
        )}

        {/* Search bar */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-2 items-center shadow-sm">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            placeholder="Search by name, phone or order number"
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
              <p className="text-sm text-gray-400 text-center py-8">No orders assigned to you yet.</p>
            )}
            {billedOrders.length > 0 && filteredBilledOrders.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No orders matching that search.</p>
            )}
            {filteredBilledOrders.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  Your assigned orders ({filteredBilledOrders.length})
                </p>
                <div className="grid gap-3">
                  {filteredBilledOrders.map((o) => (
                    <Card
                      key={o._id}
                      className="border-gray-100 shadow-sm active:shadow-none transition-all cursor-pointer"
                      onClick={() => selectOrder(o)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                              <span>{o.orderNumber}</span>
                              {o.source && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium leading-none capitalize ${
                                  o.source === 'whatsapp' ? 'bg-green-50 text-green-700 border border-green-200' :
                                  o.source === 'website' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  o.source === 'phone' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  o.source === 'vayepar' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                  'bg-gray-50 text-gray-700 border border-gray-200'
                                }`}>
                                  {o.source}
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-gray-700 truncate">{o.shippingAddress.name}</p>
                            <p className="text-xs text-gray-500">
                              {o.shippingAddress.phone}
                              {o.shippingAddress.alternatePhone && ` / ${o.shippingAddress.alternatePhone}`}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {o.shippingAddress.street}, {o.shippingAddress.city}
                            </p>
                            {o.shippingAddress.landmark && (
                              <p className="text-xs text-amber-600">Near: {o.shippingAddress.landmark}</p>
                            )}
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
                  <p className="font-bold text-gray-900 flex items-center gap-1.5">
                    <span>{order.orderNumber}</span>
                    {order.source && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium leading-none capitalize ${
                        order.source === 'whatsapp' ? 'bg-green-50 text-green-700 border border-green-200' :
                        order.source === 'website' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        order.source === 'phone' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        order.source === 'vayepar' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                        'bg-gray-50 text-gray-700 border border-gray-200'
                      }`}>
                        {order.source}
                      </span>
                    )}
                  </p>
                </div>
                <p className="font-bold text-gray-900">{formatCurrency(order.total)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {order.shippingAddress.name}{' '}
                  <span className="text-gray-400 font-normal text-xs">
                    · {order.shippingAddress.phone}
                    {order.shippingAddress.alternatePhone && ` / ${order.shippingAddress.alternatePhone}`}
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} – {order.shippingAddress.pincode}
                </p>
                {order.shippingAddress.landmark && (
                  <p className="text-xs text-amber-600 mt-0.5">Near: {order.shippingAddress.landmark}</p>
                )}
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
                    { value: 'unpaid', label: 'Unpaid' },
                    { value: 'partial_payment', label: 'Partial Payment' },
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

            {/* Photos — for delivery_done, unpaid, partial_payment */}
            {needsDeliveryProof && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-5">
                <div className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-gray-800">Delivery photos</p>
                </div>

                {/* Banners only for delivery_done */}
                {isDone && !orderIsCod && (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-green-700">
                      This order is <strong>prepaid</strong> ({order?.paymentMethod?.toUpperCase()}). No payment collection needed — just capture the delivery photo.
                    </p>
                  </div>
                )}

                {isDone && orderIsCod && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">Both photos are required. You will review them before confirming.</p>
                  </div>
                )}

                {isUnpaid && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">Customer did not pay. Capture delivery proof and confirm.</p>
                  </div>
                )}

                {isPartial && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">Partial payment — enter cash and UPI amounts below.</p>
                  </div>
                )}

                <PhotoUploadBox
                  label="Delivery proof"
                  hint="Photo of the package handed to customer or placed at door"
                  required
                  url={deliveryProofUrl}
                  uploading={uploadingDelivery}
                  onFile={(f) => uploadPhoto(f, 'delivery-proof', setDeliveryProofUrl, setUploadingDelivery)}
                  onClear={() => setDeliveryProofUrl(undefined)}
                  onBeforeOpen={() => api.refreshAccessToken().then(() => {})}
                />

                {(isDone && orderIsCod || isPartial) && (
                  <PhotoUploadBox
                    label="Payment proof"
                    hint={isPartial ? "Photo of cash or UPI payment received (optional)" : "Photo of cash received or UPI payment screen"}
                    required={isDone && orderIsCod}
                    url={paymentProofUrl}
                    uploading={uploadingPayment}
                    onFile={(f) => uploadPhoto(f, 'delivery-payments', setPaymentProofUrl, setUploadingPayment)}
                    onClear={() => setPaymentProofUrl(undefined)}
                    onBeforeOpen={() => api.refreshAccessToken().then(() => {})}
                  />
                )}

                {/* Amount collected — single input for delivery_done COD */}
                {isDone && orderIsCod && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-800">
                      Amount collected
                      <span className="text-xs text-gray-400 font-normal ml-1">(enter what customer paid)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">₹</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder={order ? order.total.toFixed(2) : '0.00'}
                        value={amountCollected}
                        onChange={(e) => setAmountCollected(e.target.value)}
                        className="pl-7 h-11 text-base font-semibold"
                      />
                    </div>
                    {amountCollected && parseFloat(amountCollected) !== order?.total && (
                      <p className={`text-xs font-medium ${parseFloat(amountCollected) < (order?.total ?? 0) ? 'text-red-500' : 'text-amber-600'}`}>
                        {parseFloat(amountCollected) < (order?.total ?? 0)
                          ? `Short by ₹ ${((order?.total ?? 0) - parseFloat(amountCollected)).toLocaleString('en-IN')}`
                          : `Excess ₹ ${(parseFloat(amountCollected) - (order?.total ?? 0)).toLocaleString('en-IN')}`}
                      </p>
                    )}
                  </div>
                )}

                {/* Cash + UPI split inputs for partial_payment */}
                {isPartial && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-800">Cash amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">₹</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                          className="pl-7 h-11 text-base font-semibold"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-800">UPI amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">₹</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={upiAmount}
                          onChange={(e) => setUpiAmount(e.target.value)}
                          className="pl-7 h-11 text-base font-semibold"
                        />
                      </div>
                    </div>
                    {(cashAmount || upiAmount) && (
                      <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                        <span className="text-sm text-gray-600 font-medium">Total collected</span>
                        <span className="text-base font-bold text-green-700">
                          ₹ {((parseFloat(cashAmount) || 0) + (parseFloat(upiAmount) || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment method — only for delivery_done COD */}
                {isDone && orderIsCod && (
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
                )}
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

            {/* Upload progress indicator */}
            {uploading && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-amber-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Uploading photo, please wait…
              </div>
            )}

            {/* Primary button */}
            <Button
              size="lg"
              className={`w-full h-14 text-base font-semibold rounded-2xl transition-all ${
                needsDeliveryProof && canOpenConfirm ? 'bg-green-600 hover:bg-green-700' : ''
              }`}
              onClick={handlePrimaryButton}
              disabled={needsDeliveryProof ? !canOpenConfirm : !canSubmitOther}
            >
              {updateDelivery.isPending ? (
                <><RefreshCw className="h-5 w-5 mr-2 animate-spin" /> Saving…</>
              ) : needsDeliveryProof ? (
                <><CheckCircle2 className="h-5 w-5 mr-2" /> Review & Confirm Delivery</>
              ) : (
                <><CheckCircle2 className="h-5 w-5 mr-2" /> Save update</>
              )}
            </Button>

            {/* Missing photo hint */}
            {needsDeliveryProof && !uploading && (!deliveryProofUrl || (isDone && orderIsCod && !paymentProofUrl)) && (
              <p className="text-xs text-center text-red-500">
                {!deliveryProofUrl && isDone && orderIsCod && !paymentProofUrl
                  ? 'Both delivery and payment photos are required'
                  : !deliveryProofUrl
                  ? 'Delivery proof photo is required'
                  : 'Payment proof photo is required'}
              </p>
            )}
            {/* Partial payment — amounts hint */}
            {isPartial && !uploading && deliveryProofUrl && !partialAmountsValid && (
              <p className="text-xs text-center text-red-500">
                Enter at least one amount (cash or UPI) for partial payment
              </p>
            )}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {order && needsDeliveryProof && deliveryProofUrl && (isDone && orderIsCod ? !!paymentProofUrl : true) && (
        <ConfirmDeliveryDialog
          open={showConfirm}
          order={order}
          status={status}
          deliveryProofUrl={deliveryProofUrl}
          paymentProofUrl={paymentProofUrl}
          paymentMethod={paymentMethod}
          amountCollected={amountCollected}
          cashAmount={cashAmount}
          upiAmount={upiAmount}
          note={note}
          submitting={updateDelivery.isPending}
          onConfirm={() => updateDelivery.mutate()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
