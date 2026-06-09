'use client';

import { useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, CheckCircle2, Package, Phone, MapPin } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function PackingDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const router = useRouter();
  const { user } = useAdminAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialUpdatedAt = useRef<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.getOrder(orderId),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  if (order && !initialUpdatedAt.current) {
    initialUpdatedAt.current = order.updatedAt;
  }
  const orderUpdatedByCrm =
    order && initialUpdatedAt.current && order.updatedAt !== initialUpdatedAt.current;

  const markPacked = useMutation({
    mutationFn: () => api.markOrderPacked(orderId, user?.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['department', 'packing', 'orders'] });
      toast({ title: 'Order packed!', description: 'Ready to assign delivery boy.' });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to mark packed',
        description: err?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="h-10 w-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Order not found.</p>
        <Link href="/department/packing">
          <Button variant="outline" className="mt-4 gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
        </Link>
      </div>
    );
  }

  const isPacked = !!order.packedAt;
  const canPack = !isPacked && ['placed', 'confirmed', 'preparing'].includes(order.status);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header
        title={`Pack ${order.orderNumber}`}
        description={`${order.shippingAddress.name} · ${order.items.length} item${order.items.length !== 1 ? 's' : ''}`}
        action={
          <Link href="/department/packing">
            <Button variant="outline" className="gap-1.5 rounded-full">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
        }
      />

      <div className="flex-1 p-3 sm:p-5 max-w-xl mx-auto w-full space-y-4">

        {/* CRM Update Banner */}
        {orderUpdatedByCrm && (
          <div className="bg-blue-50 border border-blue-300 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-500 shrink-0" />
            <div>
              <p className="text-sm font-bold text-blue-800">Order updated by CRM</p>
              <p className="text-xs text-blue-600">Data was changed after you opened this page. Showing latest.</p>
            </div>
          </div>
        )}

        {/* Packed Confirmation Banner */}
        {isPacked && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl px-4 py-4 flex items-center gap-3">
            <CheckCircle2 className="h-7 w-7 text-emerald-500 shrink-0" />
            <div>
              <p className="text-base font-black text-emerald-800">Order Packed ✓</p>
              {order.packedAt && (
                <p className="text-xs text-emerald-600">{formatDate(order.packedAt)}</p>
              )}
              {order.packedByName && (
                <p className="text-xs text-emerald-600">by {order.packedByName}</p>
              )}
            </div>
          </div>
        )}

        {/* ── ORDER INFORMATION ─────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Order Information</p>
          <div>
            <p className="text-base font-bold text-gray-900">{order.shippingAddress.name}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{order.shippingAddress.phone}</span>
          </div>
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
            <span>
              {[
                order.shippingAddress.street,
                order.shippingAddress.landmark,
                order.shippingAddress.city,
                order.shippingAddress.state,
                order.shippingAddress.pincode,
              ].filter(Boolean).join(', ')}
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${order.paymentMethod === 'cod' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
              {order.paymentMethod === 'cod' ? 'COD' : 'PREPAID'}
            </span>
            <span className="text-sm font-bold text-gray-800 ml-auto">{formatCurrency(order.total)}</span>
          </div>
        </div>

        {/* ── SPECIAL INSTRUCTIONS ────────────────────────── */}
        {order.notes && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl" aria-hidden>⚠️</span>
              <span className="font-black text-amber-800 uppercase tracking-widest text-sm">Special Instructions</span>
            </div>
            <p className="text-amber-900 font-semibold text-base leading-snug">{order.notes}</p>
          </div>
        )}
        {order.adminNotes && (
          <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl" aria-hidden>🔴</span>
              <span className="font-black text-red-800 uppercase tracking-widest text-sm">Admin Notes</span>
            </div>
            <p className="text-red-900 font-semibold text-base leading-snug">{order.adminNotes}</p>
          </div>
        )}

        {/* ── PRODUCTS TO PACK ────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-black text-gray-800 text-sm uppercase tracking-wide">Products to Pack</span>
          </div>
          <div className="divide-y divide-gray-50">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4">
                {/* Giant Quantity Display */}
                <div className="flex flex-col items-center justify-center bg-emerald-50 border-2 border-emerald-300 rounded-xl w-20 h-20 shrink-0">
                  <span className="text-5xl font-black text-emerald-700 leading-none">{item.quantity}</span>
                  <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">QTY</span>
                </div>
                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-900 leading-tight">{item.name}</p>
                  {item.variantName && (
                    <p className="text-sm text-gray-500 mt-0.5">{item.variantName}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{formatCurrency(item.price)} × {item.quantity}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-gray-800">{formatCurrency(item.total)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── MARK PACKED BUTTON ──────────────────────────── */}
        <div className="pb-6">
          {canPack && (
            <Button
              className="w-full h-14 text-base font-black gap-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl"
              onClick={() => markPacked.mutate()}
              disabled={markPacked.isPending}
            >
              {markPacked.isPending ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Marking Packed…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Mark Order as Packed
                </>
              )}
            </Button>
          )}
          {!canPack && !isPacked && (
            <p className="text-center text-sm text-gray-500 py-3">
              Cannot pack — order status: {order.status}
            </p>
          )}
          {isPacked && (
            <Button
              variant="outline"
              className="w-full h-12 text-sm rounded-xl"
              onClick={() => router.push('/department/packing')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Packing List
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
