'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ArrowLeft, TrendingDown, TrendingUp, Minus, X } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { shortPr } from '@/lib/fms/format';

interface PoItem {
  materialId: string;
  materialName: string;
  qtyKg: number;
  uom: string;
  lastRate?: number;
  ratePerKg: string;
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  vendorAddress: string;
  terms: string;
}

function RateTrendIcon({ rate, lastRate }: { rate: string; lastRate?: number }) {
  const r = parseFloat(rate);
  if (!r || !lastRate) return null;
  const diff = ((r - lastRate) / lastRate) * 100;
  if (Math.abs(diff) < 2) return <Minus className="h-3.5 w-3.5 text-[#66706A]" />;
  if (diff > 0) return <TrendingUp className="h-3.5 w-3.5 text-[#A3241A]" />;
  return <TrendingDown className="h-3.5 w-3.5 text-[#1E5E3F]" />;
}

function ConfirmSheet({
  grouped,
  unassigned,
  onConfirm,
  onCancel,
  loading,
}: {
  grouped: Record<string, { vendorName: string; items: PoItem[]; total: number }>;
  unassigned: PoItem[];
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const vendors = Object.values(grouped);
  const assignedCount = vendors.reduce((s, g) => s + g.items.length, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-t-[24px] sm:rounded-[24px] w-full max-w-md mx-auto shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-fraunces text-lg font-semibold text-[#18211C]">Confirm Purchase Orders</h3>
          <button onClick={onCancel} className="p-1 text-[#8A9490] hover:text-[#18211C]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div className="rounded-[12px] border border-[#ECE9E1] p-4 bg-[#F7F6F2]">
            <p className="text-sm font-semibold text-[#18211C] font-jakarta mb-2">
              {assignedCount} item{assignedCount !== 1 ? 's' : ''} → {vendors.length} PO{vendors.length !== 1 ? 's' : ''}
            </p>
            {vendors.map(g => (
              <div key={g.vendorName} className="flex items-center justify-between text-xs font-jakarta py-0.5">
                <span className="text-[#66706A]">{g.vendorName} · {g.items.length} item{g.items.length !== 1 ? 's' : ''}</span>
                <span className="font-semibold text-[#1E5E3F] font-jetbrains">₹{g.total.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>

          {unassigned.length > 0 && (
            <div className="rounded-[12px] border border-[#F5D798] bg-[#FDF3E3] p-4">
              <p className="text-xs font-semibold text-[#8A4B06] font-jakarta mb-1">
                {unassigned.length} item{unassigned.length !== 1 ? 's' : ''} stay in Needs PO
              </p>
              <p className="text-xs text-[#8A4B06] font-jakarta">
                {unassigned.map(i => i.materialName).join(', ')}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-9 text-xs font-jakarta rounded-[10px]" onClick={onCancel}>
            Go back
          </Button>
          <Button
            className="flex-1 h-9 text-xs font-jakarta rounded-[10px] text-white"
            style={{ background: '#1E5E3F' }}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? 'Creating…' : `Create ${vendors.length} PO${vendors.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function FmsRaisePoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [poItems, setPoItems] = useState<PoItem[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: req } = useQuery({
    queryKey: ['purchase-request', params.id],
    queryFn:  () => api.getPurchaseRequest(params.id),
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ['purchase-vendors'],
    queryFn:  () => api.getPurchaseVendors(),
  });
  const { data: materials = [] } = useQuery({
    queryKey: ['purchase-materials'],
    queryFn:  () => api.getPurchaseMaterials(),
  });

  // Only show NEEDS_PO lines — already-raised and dropped lines are excluded
  useEffect(() => {
    if (!req || !materials.length || initialized) return;
    const pendingLines = req.items.filter(
      (i: any) => !i.lineStatus || i.lineStatus === 'NEEDS_PO',
    );
    setPoItems(pendingLines.map((i: any) => {
      const mat = (materials as any[]).find((m: any) => m._id === i.materialId);
      return {
        materialId: i.materialId, materialName: i.materialName,
        qtyKg: i.qtyKg, uom: i.uom || mat?.uom || 'kg',
        lastRate: mat?.lastRate || undefined,
        ratePerKg: '', vendorId: '', vendorName: '',
        vendorPhone: '', vendorAddress: '', terms: '',
      };
    }));
    setInitialized(true);
  }, [req, materials, initialized]);

  const mut = useMutation({
    mutationFn: (data: any) => api.splitPurchasePO(params.id, data),
    onSuccess: () => {
      toast({ title: 'POs created' });
      queryClient.invalidateQueries({ queryKey: ['purchase-request', params.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-summary'] });
      router.push(`/fms/purchase/${params.id}`);
    },
    onError: (err) => {
      setShowConfirm(false);
      toast({ title: 'Error', description: getApiError(err), variant: 'destructive' });
    },
  });

  const applyVendor = (idx: number, vid: string) => {
    const v = vendors.find((x: any) => x._id === vid);
    if (!v) {
      // Clear vendor if deselected
      setPoItems(prev => prev.map((p, i) => i !== idx ? p : {
        ...p, vendorId: '', vendorName: '', vendorPhone: '', vendorAddress: '', terms: '',
      }));
      return;
    }
    setPoItems(prev => prev.map((p, i) => i !== idx ? p : {
      ...p, vendorId: v._id, vendorName: v.name,
      vendorPhone: v.phone || '', vendorAddress: v.address || '', terms: v.paymentTerms || '',
    }));
  };
  const updateItem = (idx: number, field: keyof PoItem, val: string) =>
    setPoItems(prev => prev.map((p, i) => i !== idx ? p : { ...p, [field]: val }));

  // Assigned = vendor + rate > 0; unassigned = no vendor (left behind); error = vendor but no rate
  const assigned   = poItems.filter(i => i.vendorName && parseFloat(i.ratePerKg) > 0);
  const unassigned = poItems.filter(i => !i.vendorName);
  const errors     = poItems.filter(i => i.vendorName && !(parseFloat(i.ratePerKg) > 0));

  const grouped: Record<string, { vendorName: string; items: PoItem[]; total: number }> = {};
  for (const item of assigned) {
    if (!grouped[item.vendorName]) grouped[item.vendorName] = { vendorName: item.vendorName, items: [], total: 0 };
    grouped[item.vendorName].items.push(item);
    grouped[item.vendorName].total += item.qtyKg * parseFloat(item.ratePerKg);
  }

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (errors.length) {
      toast({ title: `Enter rate for: ${errors.map(i => i.materialName).join(', ')}`, variant: 'destructive' });
      return;
    }
    if (!assigned.length) {
      toast({ title: 'Assign at least one item to a vendor', variant: 'destructive' });
      return;
    }
    setShowConfirm(true);
  };

  const confirmCreate = () => {
    mut.mutate({
      expectedDelivery,
      items: assigned.map(i => ({
        materialId: i.materialId, materialName: i.materialName, qtyKg: i.qtyKg,
        ratePerKg: parseFloat(i.ratePerKg), vendorName: i.vendorName,
        vendorPhone: i.vendorPhone, vendorAddress: i.vendorAddress, terms: i.terms,
      })),
    });
  };

  const isLoading = !req;
  const total = assigned.reduce((s, i) => s + i.qtyKg * parseFloat(i.ratePerKg), 0);

  return (
    <div className="min-h-full" style={{ background: '#F7F6F2' }}>
      {showConfirm && (
        <ConfirmSheet
          grouped={grouped}
          unassigned={unassigned}
          onConfirm={confirmCreate}
          onCancel={() => setShowConfirm(false)}
          loading={mut.isPending}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-[#ECE9E1] px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#8A9490] mb-1 font-jakarta">
            <Link href="/fms/purchase" className="text-[#1E5E3F] font-medium hover:underline">Purchase FMS</Link>
            <ChevronRight className="h-3 w-3" />
            {req && <><Link href={`/fms/purchase/${params.id}`} className="text-[#1E5E3F] font-medium hover:underline font-jetbrains">{shortPr(req.reqNo)}</Link><ChevronRight className="h-3 w-3" /></>}
            <span>Raise PO</span>
          </div>
          <h1 className="font-fraunces text-[22px] font-semibold text-[#18211C]">Raise Purchase Order</h1>
          {req && (
            <p className="text-xs text-[#8A9490] font-jakarta mt-0.5">
              {poItems.length} pending item{poItems.length !== 1 ? 's' : ''} · {req.requestedByName}
              {req.items.some((i: any) => i.lineStatus === 'PO_RAISED') && (
                <span className="ml-1.5 text-[#1E5E3F]">
                  ({req.items.filter((i: any) => i.lineStatus === 'PO_RAISED').length} already raised)
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/fms/purchase/${params.id}`}>
            <Button variant="outline" size="sm" className="h-8 text-xs font-jakarta rounded-[10px]">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
          </Link>
          <Button
            size="sm"
            className="h-8 text-xs font-jakarta rounded-[10px] text-white"
            style={{ background: '#1E5E3F' }}
            onClick={handleSubmit}
            disabled={mut.isPending || isLoading || !assigned.length || errors.length > 0}
          >
            {mut.isPending ? 'Creating…' : `Create PO${Object.keys(grouped).length > 1 ? `s (${Object.keys(grouped).length})` : ''}`}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-[#1E5E3F] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : poItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-[#66706A] font-jakarta">All items already have POs raised.</p>
          <Link href={`/fms/purchase/${params.id}`} className="mt-3 text-xs text-[#1E5E3F] hover:underline font-jakarta">← Back to request</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6">
          <div className="max-w-3xl grid grid-cols-5 gap-5">

            {/* Left: item forms (col-span-3) */}
            <div className="col-span-3 space-y-4">
              {/* Delivery date */}
              <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
                <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Expected Delivery Date</label>
                <Input type="date" className="h-9 text-sm font-jakarta" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} />
              </div>

              {/* Per-item vendor + rate */}
              {poItems.map((item, i) => {
                const hasVendor = !!item.vendorName;
                const hasRate   = parseFloat(item.ratePerKg) > 0;
                const isError   = hasVendor && !hasRate;
                return (
                  <div key={i} className={`bg-white rounded-[18px] border p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)] transition-colors ${isError ? 'border-[#FBBCB8]' : hasVendor && hasRate ? 'border-[#A7D4BC]' : 'border-[#ECE9E1]'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-[#18211C] font-jakarta">{item.materialName}</p>
                        <p className="text-[11px] text-[#8A9490] font-jetbrains">{item.qtyKg} {item.uom}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasVendor && hasRate && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-jakarta font-medium" style={{ background: '#EAF3EE', color: '#1E5E3F' }}>
                            Assigned
                          </span>
                        )}
                        {!hasVendor && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-jakarta" style={{ background: '#F7F6F2', color: '#8A9490' }}>
                            Will stay in Needs PO
                          </span>
                        )}
                        {isError && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-jakarta" style={{ background: '#FDECEA', color: '#A3241A' }}>
                            Missing rate
                          </span>
                        )}
                        {item.lastRate && (
                          <div className="text-right">
                            <p className="text-[10px] text-[#8A9490] font-jakarta">Last paid</p>
                            <p className="text-xs font-semibold text-[#18211C] font-jetbrains">₹{item.lastRate}/{item.uom}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vendor select */}
                    <div className="mb-2.5">
                      <label className="text-[11px] font-medium text-[#66706A] mb-1 block font-jakarta">Vendor <span className="text-[#8A9490]">(leave blank to assign later)</span></label>
                      <select
                        className="w-full h-9 rounded-[10px] border border-[#ECE9E1] bg-white px-3 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-[#1E5E3F]/20"
                        value={item.vendorId}
                        onChange={e => applyVendor(i, e.target.value)}
                      >
                        <option value="">— Leave for later —</option>
                        {vendors.map((v: any) => (
                          <option key={v._id} value={v._id}>{v.name}{v.phone ? ` · ${v.phone}` : ''}</option>
                        ))}
                      </select>
                    </div>

                    {/* Rate — only shown once a vendor is selected */}
                    {hasVendor && (
                      <div>
                        <label className="text-[11px] font-medium text-[#66706A] mb-1 block font-jakarta">
                          Rate per {item.uom} *
                          {item.lastRate && <span className="ml-1 text-[#8A9490]">(last: ₹{item.lastRate})</span>}
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center flex-1">
                            <span className="h-9 flex items-center px-2.5 border border-r-0 rounded-l-[10px] bg-[#FAF9F5] text-xs text-[#66706A] shrink-0 font-jakarta">₹/{item.uom}</span>
                            <Input type="number" min="0" step="0.01" value={item.ratePerKg} placeholder="0.00"
                              onChange={e => updateItem(i, 'ratePerKg', e.target.value)}
                              className={`h-9 text-sm rounded-l-none flex-1 font-jetbrains ${isError ? 'border-[#FBBCB8] focus-visible:ring-red-200' : ''}`}
                              autoFocus={hasVendor && !hasRate} />
                          </div>
                          <div className="flex items-center gap-1">
                            <RateTrendIcon rate={item.ratePerKg} lastRate={item.lastRate} />
                            {hasRate && item.lastRate && (
                              <span className="text-[11px] font-jakarta" style={{
                                color: Math.abs((parseFloat(item.ratePerKg) - item.lastRate) / item.lastRate) < 0.02
                                  ? '#66706A' : parseFloat(item.ratePerKg) > item.lastRate ? '#A3241A' : '#1E5E3F',
                              }}>
                                {parseFloat(item.ratePerKg) > item.lastRate ? '+' : ''}
                                {(((parseFloat(item.ratePerKg) - item.lastRate) / item.lastRate) * 100).toFixed(1)}%
                              </span>
                            )}
                            {hasRate && (
                              <span className="text-xs font-semibold text-[#1E5E3F] font-jetbrains ml-1">
                                = ₹{(item.qtyKg * parseFloat(item.ratePerKg)).toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right: PO preview (col-span-2) */}
            <div className="col-span-2 space-y-4">
              {/* Total card */}
              <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
                <p className="text-[11px] font-semibold text-[#8A9490] uppercase tracking-[0.07em] font-jakarta mb-3">Summary</p>
                <p className="text-[28px] font-fraunces font-semibold text-[#1E5E3F]">
                  ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-[#8A9490] font-jakarta mt-0.5">
                  {Object.keys(grouped).length} PO{Object.keys(grouped).length !== 1 ? 's' : ''} · {assigned.length} item{assigned.length !== 1 ? 's' : ''} assigned
                </p>
                {unassigned.length > 0 && (
                  <p className="text-xs mt-1.5 font-jakarta" style={{ color: '#8A4B06' }}>
                    {unassigned.length} item{unassigned.length !== 1 ? 's' : ''} will stay in Needs PO
                  </p>
                )}
              </div>

              {/* PO Preview cards */}
              {Object.values(grouped).length > 0 ? (
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold text-[#8A9490] uppercase tracking-[0.07em] font-jakarta px-1">PO Preview</p>
                  {Object.values(grouped).map(g => (
                    <div key={g.vendorName} className="bg-white rounded-[18px] border border-[#ECE9E1] p-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-semibold text-[#18211C] font-jakarta">{g.vendorName}</p>
                        <p className="text-sm font-bold text-[#1E5E3F] font-jetbrains">₹{g.total.toLocaleString('en-IN')}</p>
                      </div>
                      {g.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs py-0.5 font-jakarta">
                          <span className="text-[#66706A]">{item.materialName} {item.qtyKg} {item.uom}</span>
                          <span className="text-[#18211C] font-medium">
                            ₹{(item.qtyKg * parseFloat(item.ratePerKg)).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-[18px] border border-dashed border-[#ECE9E1] p-5 text-center">
                  <p className="text-xs text-[#B0B8B3] font-jakarta">Assign vendors to see PO preview</p>
                </div>
              )}

              {/* Items staying behind */}
              {unassigned.length > 0 && (
                <div className="rounded-[14px] border border-[#F5D798] bg-[#FDF3E3] p-4">
                  <p className="text-[11px] font-semibold text-[#8A4B06] uppercase tracking-[0.06em] font-jakarta mb-1.5">Stays in Needs PO</p>
                  {unassigned.map((item, i) => (
                    <p key={i} className="text-xs text-[#8A4B06] font-jakarta py-0.5">{item.materialName} · {item.qtyKg} {item.uom}</p>
                  ))}
                </div>
              )}
            </div>

          </div>
        </form>
      )}
    </div>
  );
}
