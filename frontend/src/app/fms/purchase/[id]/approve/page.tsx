'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ChevronRight, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { shortPr } from '@/lib/fms/format';

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${ok ? 'bg-[#1E5E3F] border-[#1E5E3F]' : 'bg-white border-[#ECE9E1]'}`}>
        {ok && <CheckCircle2 className="h-3 w-3 text-white" />}
      </div>
      <span className={`text-sm font-jakarta ${ok ? 'text-[#18211C]' : 'text-[#8A9490]'}`}>{label}</span>
    </div>
  );
}

function RateBadge({ rate, lastRate, uom }: { rate: number; lastRate?: number; uom?: string }) {
  if (!lastRate) return <span className="text-xs text-[#8A9490] font-jakarta">No history</span>;
  const diff = ((rate - lastRate) / lastRate) * 100;
  const isHigh = diff > 5;
  const isLow  = diff < -5;
  const bg   = isHigh ? '#FDECEA' : isLow ? '#EAF3EE' : '#F7F6F2';
  const text = isHigh ? '#A3241A' : isLow ? '#1E5E3F' : '#66706A';
  const Icon = isHigh ? TrendingUp : isLow ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full font-jakarta"
      style={{ background: bg, color: text }}>
      <Icon className="h-3 w-3" />
      {isHigh ? '+' : ''}{diff.toFixed(1)}% vs last (₹{lastRate}/{uom || 'kg'})
    </span>
  );
}

export default function FmsApprovePoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showReject, setShowReject] = useState(false);
  const [rejReason, setRejReason]   = useState('');
  const [checks, setChecks]         = useState({ rateOk: false, vendorOk: false, deliveryOk: false, termsOk: false });

  const { data: req } = useQuery({
    queryKey: ['purchase-request', params.id],
    queryFn:  () => api.getPurchaseRequest(params.id),
  });
  const { data: materials = [] } = useQuery({
    queryKey: ['purchase-materials'],
    queryFn:  () => api.getPurchaseMaterials(),
  });

  const mut = useMutation({
    mutationFn: (data: any) => api.makePurchaseDecision(params.id, data),
    onSuccess: () => {
      toast({ title: 'Decision recorded' });
      queryClient.invalidateQueries({ queryKey: ['purchase-request', params.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-summary'] });
      router.push(`/fms/purchase/${params.id}`);
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const allChecked = Object.values(checks).every(Boolean);

  if (!req) return (
    <div className="flex h-screen items-center justify-center" style={{ background: '#F7F6F2' }}>
      <div className="h-8 w-8 border-2 border-[#1E5E3F] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (req.status !== 'PO_CREATED') {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-3" style={{ background: '#F7F6F2' }}>
        <p className="text-sm text-[#66706A] font-jakarta">This request is not pending approval.</p>
        <Link href={`/fms/purchase/${params.id}`}>
          <Button variant="outline" size="sm" className="font-jakarta rounded-[10px]">Back to request</Button>
        </Link>
      </div>
    );
  }

  const po = req.po;
  if (!po) return (
    <div className="flex h-screen items-center justify-center flex-col gap-3" style={{ background: '#F7F6F2' }}>
      <p className="text-sm text-[#66706A] font-jakarta">PO data missing for this request.</p>
      <Link href={`/fms/purchase/${params.id}`}>
        <Button variant="outline" size="sm" className="font-jakarta rounded-[10px]">Back to request</Button>
      </Link>
    </div>
  );
  const poItems: any[] = po.items || [];

  return (
    <div className="min-h-full" style={{ background: '#F7F6F2' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#ECE9E1] px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#8A9490] mb-1 font-jakarta">
            <Link href="/fms/purchase" className="text-[#1E5E3F] font-medium hover:underline">Purchase FMS</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/fms/purchase/${params.id}`} className="text-[#1E5E3F] font-medium hover:underline font-jetbrains">{shortPr(req.reqNo)}</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Approve</span>
          </div>
          <h1 className="font-fraunces text-[22px] font-semibold text-[#18211C]">Review Purchase Order</h1>
          <p className="text-xs text-[#8A9490] font-jakarta mt-0.5">{po?.poNo} — {po?.vendorName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/fms/purchase/${params.id}`}>
            <Button variant="outline" size="sm" className="h-8 text-xs font-jakarta rounded-[10px]">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
          </Link>
        </div>
      </div>

      <div className="p-6 max-w-3xl grid grid-cols-5 gap-5">

        {/* Left: PO details */}
        <div className="col-span-3 space-y-4">
          {/* Vendor info */}
          <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
            <p className="text-[11px] font-semibold text-[#8A9490] uppercase tracking-[0.07em] font-jakarta mb-3">Vendor</p>
            <p className="text-base font-semibold text-[#18211C] font-jakarta">{po?.vendorName}</p>
            {po?.vendorPhone && <p className="text-sm text-[#66706A] font-jakarta mt-0.5">{po.vendorPhone}</p>}
            {po?.vendorAddress && <p className="text-xs text-[#8A9490] font-jakarta mt-0.5">{po.vendorAddress}</p>}
            {po?.expectedDelivery && (
              <p className="text-xs text-[#66706A] font-jakarta mt-2">
                Expected delivery: <span className="font-medium text-[#18211C]">
                  {new Date(po.expectedDelivery).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </p>
            )}
          </div>

          {/* Line items with rate comparison */}
          <div className="bg-white rounded-[18px] border border-[#ECE9E1] overflow-hidden shadow-[0_1px_2px_rgba(24,33,28,.06)]">
            <div className="px-5 py-3 border-b border-[#ECE9E1]">
              <p className="text-sm font-semibold text-[#18211C] font-jakarta">Items</p>
            </div>
            <div className="divide-y divide-[#F5F3EE]">
              {poItems.map((item: any, i: number) => {
                const mat = materials.find((m: any) => m._id === item.materialId || m.name === item.materialName);
                return (
                  <div key={i} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#18211C] font-jakarta">{item.materialName}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-[#66706A] font-jetbrains">{item.qtyKg} {item.uom || 'kg'}</span>
                          <span className="text-xs text-[#66706A] font-jakarta">×</span>
                          <span className="text-xs font-semibold text-[#18211C] font-jetbrains">₹{item.ratePerKg}/{item.uom || 'kg'}</span>
                          {mat?.lastRate && (
                            <RateBadge rate={item.ratePerKg} lastRate={mat.lastRate} uom={item.uom || mat?.uom} />
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-[#1E5E3F] font-jetbrains shrink-0">
                        ₹{item.amount?.toLocaleString('en-IN') ?? (item.qtyKg * item.ratePerKg).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Total */}
            <div className="px-5 py-3 border-t border-[#ECE9E1] bg-[#FAF9F5] flex justify-between items-center">
              <span className="text-sm font-medium text-[#18211C] font-jakarta">Total</span>
              <span className="text-base font-bold text-[#1E5E3F] font-jetbrains">₹{po.totalAmount?.toLocaleString('en-IN') ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Right: checklist + actions */}
        <div className="col-span-2 space-y-4">
          {/* Approval checklist */}
          <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
            <p className="text-[11px] font-semibold text-[#8A9490] uppercase tracking-[0.07em] font-jakarta mb-2">Approval Checklist</p>
            {[
              { key: 'rateOk',      label: 'Rates are reasonable' },
              { key: 'vendorOk',    label: 'Vendor is approved' },
              { key: 'deliveryOk',  label: 'Delivery date is set' },
              { key: 'termsOk',     label: 'Payment terms confirmed' },
            ].map(({ key, label }) => (
              <button key={key} type="button" className="w-full text-left"
                onClick={() => setChecks(p => ({ ...p, [key]: !p[key as keyof typeof p] }))}>
                <CheckItem label={label} ok={checks[key as keyof typeof checks]} />
              </button>
            ))}
            {!allChecked && (
              <p className="text-[11px] text-[#8A9490] font-jakarta mt-1">Check all items before approving.</p>
            )}
          </div>

          {/* Actions */}
          {!showReject ? (
            <div className="space-y-2">
              <Button
                onClick={() => mut.mutate({ action: 'APPROVED' })}
                disabled={mut.isPending || !allChecked}
                className="w-full h-10 text-sm font-jakarta rounded-[12px] text-white" style={{ background: '#1E5E3F' }}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {mut.isPending ? 'Approving…' : 'Approve PO'}
              </Button>
              <Button variant="outline" onClick={() => setShowReject(true)}
                className="w-full h-10 text-sm text-red-600 border-red-200 font-jakarta rounded-[12px]">
                <XCircle className="h-4 w-4 mr-2" /> Reject PO
              </Button>
              <button type="button"
                onClick={() => mut.mutate({ action: 'REJECTED', reason: 'Sent back for revision' })}
                disabled={mut.isPending}
                className="w-full h-9 text-xs text-[#66706A] hover:text-[#18211C] font-jakarta border border-dashed border-[#ECE9E1] rounded-[10px]">
                ↩ Send Back for Revision
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-4 space-y-3 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
              <p className="text-sm font-semibold text-[#18211C] font-jakarta">Rejection Reason</p>
              <Input placeholder="Required — will be shown to PO creator"
                value={rejReason} onChange={e => setRejReason(e.target.value)}
                className="text-sm font-jakarta" />
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1 h-9 text-xs font-jakarta rounded-[10px]"
                  onClick={() => mut.mutate({ action: 'REJECTED', reason: rejReason })}
                  disabled={!rejReason.trim() || mut.isPending}>
                  Confirm Rejection
                </Button>
                <Button variant="outline" className="h-9 text-xs font-jakarta rounded-[10px]"
                  onClick={() => setShowReject(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
