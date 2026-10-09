'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Upload, Camera, Check, X } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { shortPr } from '@/lib/fms/format';

interface RcvItem {
  materialName: string;
  orderedKg: number;
  receivedKg: number;
  qualityOk: boolean;
}

function QtyStepper({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button"
        onClick={() => onChange(Math.max(0, parseFloat((value - 0.5).toFixed(1))))}
        className="h-10 w-10 rounded-full border border-[#ECE9E1] bg-white text-lg font-medium text-[#18211C] hover:bg-[#F7F6F2] active:bg-[#ECE9E1] transition-colors select-none">
        −
      </button>
      <input
        type="number" min="0" step="0.1"
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={e => {
          const v = parseFloat(e.target.value);
          onChange(isNaN(v) ? 0 : Math.max(0, v));
        }}
        className="w-20 h-10 text-center text-base font-semibold font-jetbrains border border-[#ECE9E1] rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[#1E5E3F]/20 focus:border-[#1E5E3F]/60"
      />
      <button type="button"
        onClick={() => onChange(parseFloat((value + 0.5).toFixed(1)))}
        className="h-10 w-10 rounded-full border border-[#ECE9E1] bg-white text-lg font-medium text-[#18211C] hover:bg-[#F7F6F2] active:bg-[#ECE9E1] transition-colors select-none">
        +
      </button>
      <span className="text-xs text-[#8A9490] font-jakarta ml-1">of {max}</span>
    </div>
  );
}

export default function FmsReceiveGoodsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [gateBill, setGateBill]     = useState<any>(null);
  const [uploading, setUploading]   = useState(false);
  const [remarks, setRemarks]       = useState('');
  const [initialized, setInitialized] = useState(false);
  const [items, setItems]           = useState<RcvItem[]>([]);

  const { data: req } = useQuery({
    queryKey: ['purchase-request', params.id],
    queryFn:  () => api.getPurchaseRequest(params.id),
  });

  useEffect(() => {
    if (!req || initialized) return;
    const src = req.po?.items || req.items || [];
    setItems(src.map((i: any) => ({ materialName: i.materialName, orderedKg: i.qtyKg, receivedKg: i.qtyKg, qualityOk: true })));
    setInitialized(true);
  }, [req, initialized]);

  const receiveMut = useMutation({
    mutationFn: (data: any) => api.receivePurchaseGoods(params.id, data),
    onSuccess: () => {
      toast({ title: 'Goods receipt recorded — order closed' });
      queryClient.invalidateQueries({ queryKey: ['purchase-request', params.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-summary'] });
      router.push(`/fms/purchase/${params.id}`);
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const handleUploadBill = async (file: File) => {
    setUploading(true);
    try {
      const r = await api.uploadDocument(file, 'purchase-bills');
      setGateBill({ url: r.secureUrl || r.url, name: file.name, mime: file.type, publicId: r.publicId });
    } catch (err) {
      toast({ title: 'Upload failed', description: getApiError(err), variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const handleSubmit = () => {
    if (!gateBill) { toast({ title: 'Upload gate bill first', variant: 'destructive' }); return; }
    receiveMut.mutate({
      gateBill,
      receivedItems: items.map(i => ({ ...i })),
      remarks,
    });
  };

  const updateItem = (i: number, field: keyof RcvItem, val: any) =>
    setItems(prev => prev.map((x, idx) => idx !== i ? x : { ...x, [field]: val }));

  const totalOrdered  = items.reduce((s, i) => s + i.orderedKg, 0);
  const totalReceived = items.reduce((s, i) => s + i.receivedKg, 0);
  const variance      = totalReceived - totalOrdered;

  return (
    <div className="min-h-full" style={{ background: '#F7F6F2' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#ECE9E1] px-4 py-3 flex items-center gap-3">
        <Link href={`/fms/purchase/${params.id}`}>
          <button className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-[#F7F6F2]">
            <ChevronRight className="h-4 w-4 text-[#66706A] rotate-180" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          {req && <p className="text-[11px] text-[#8A9490] font-jetbrains">{shortPr(req.reqNo)}</p>}
          <h1 className="font-fraunces text-[20px] font-semibold text-[#18211C] leading-tight">Receive Goods</h1>
        </div>
        <Button size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white shrink-0" style={{ background: '#1E5E3F' }}
          onClick={handleSubmit} disabled={receiveMut.isPending || !req}>
          {receiveMut.isPending ? 'Saving…' : 'Mark Received'}
        </Button>
      </div>

      {/* Mobile-first: max 390px centered on desktop */}
      <div className="mx-auto max-w-[390px] p-4 space-y-4 md:max-w-lg">

        {!req ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-2 border-[#1E5E3F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Ordered',  val: `${totalOrdered} kg` },
                { label: 'Received', val: `${totalReceived} kg` },
                { label: 'Variance', val: `${variance > 0 ? '+' : ''}${variance.toFixed(1)} kg`,
                  color: Math.abs(variance / totalOrdered) > 0.05 ? '#A3241A' : variance < 0 ? '#8A4B06' : '#1E5E3F' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-white rounded-[14px] border border-[#ECE9E1] p-3 text-center">
                  <p className="text-[10px] text-[#8A9490] font-jakarta mb-0.5">{label}</p>
                  <p className="text-sm font-semibold font-jetbrains" style={{ color: color || '#18211C' }}>{val}</p>
                </div>
              ))}
            </div>

            {/* Per-item cards */}
            {items.map((item, i) => {
              const v = item.receivedKg - item.orderedKg;
              const pct = Math.abs(v / item.orderedKg);
              const vColor = pct > 0.05 ? '#A3241A' : v < 0 ? '#8A4B06' : '#1E5E3F';
              return (
                <div key={i} className="bg-white rounded-[18px] border border-[#ECE9E1] p-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-[#18211C] font-jakarta">{item.materialName}</p>
                    {/* Quality toggle */}
                    <button type="button"
                      onClick={() => updateItem(i, 'qualityOk', !item.qualityOk)}
                      className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full font-jakarta transition-all ${
                        item.qualityOk
                          ? 'bg-[#EAF3EE] border border-[#B8DFC8] text-[#1E5E3F]'
                          : 'bg-[#FDECEA] border border-[#F3C7C2] text-[#A3241A]'
                      }`}>
                      {item.qualityOk ? <><Check className="h-3 w-3" /> Good</> : <><X className="h-3 w-3" /> Rejected</>}
                    </button>
                  </div>

                  <p className="text-xs text-[#8A9490] font-jakarta mb-2">Received quantity</p>
                  <QtyStepper
                    value={item.receivedKg}
                    onChange={v => updateItem(i, 'receivedKg', v)}
                    max={item.orderedKg}
                  />

                  {item.receivedKg !== item.orderedKg && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-jakarta" style={{ color: vColor }}>
                      <span>{v > 0 ? '▲' : '▼'}</span>
                      <span className="font-medium">{Math.abs(v).toFixed(1)} kg {v > 0 ? 'more' : 'short'} than ordered</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Gate bill */}
            <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
              <p className="text-sm font-semibold text-[#18211C] font-jakarta mb-3">Gate Bill <span className="text-red-500">*</span></p>
              {/* hidden inputs: normal file + camera capture */}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadBill(f); }} />

              {gateBill ? (
                <div className="flex items-center gap-2 rounded-[12px] border border-[#B8DFC8] bg-[#EAF3EE] px-3 py-2.5">
                  <span className="text-sm text-[#1E5E3F] font-jakarta flex-1 truncate">✓ {gateBill.name}</span>
                  <button type="button" onClick={() => setGateBill(null)} className="text-red-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => {
                      if (fileRef.current) { fileRef.current.capture = 'environment'; fileRef.current.click(); }
                    }}
                    disabled={uploading}
                    className="h-12 flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#ECE9E1] text-xs font-jakarta text-[#66706A] hover:border-[#1E5E3F] hover:text-[#1E5E3F] transition-colors">
                    <Camera className="h-4 w-4" />
                    {uploading ? 'Uploading…' : 'Take Photo'}
                  </button>
                  <button type="button"
                    onClick={() => {
                      if (fileRef.current) { fileRef.current.capture = ''; fileRef.current.click(); }
                    }}
                    disabled={uploading}
                    className="h-12 flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#ECE9E1] text-xs font-jakarta text-[#66706A] hover:border-[#1E5E3F] hover:text-[#1E5E3F] transition-colors">
                    <Upload className="h-4 w-4" />
                    {uploading ? 'Uploading…' : 'Upload File'}
                  </button>
                </div>
              )}
            </div>

            {/* Remarks */}
            <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
              <label className="text-sm font-semibold text-[#18211C] font-jakarta block mb-2">Remarks</label>
              <textarea
                className="w-full text-sm border border-[#ECE9E1] rounded-[12px] px-3 py-2.5 min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-[#1E5E3F]/20 placeholder:text-[#B0B8B3] font-jakarta bg-[#FAF9F5]"
                placeholder="Any notes on delivery quality, shortages, etc."
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
              />
            </div>

            {/* Bottom CTA (mobile sticky) */}
            <div className="pb-4">
              <Button onClick={handleSubmit} disabled={receiveMut.isPending}
                className="w-full h-12 text-base font-jakarta rounded-[14px] text-white" style={{ background: '#1E5E3F' }}>
                {receiveMut.isPending ? 'Saving…' : 'Mark Goods Received'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
