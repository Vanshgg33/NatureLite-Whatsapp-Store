'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, ChevronRight, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { getStage } from '@/lib/fms/stage';

const DEPARTMENTS = ['PRODUCTION','PACKAGING','ADMIN','DISPATCH','MAINTENANCE','QUALITY','OTHER'] as const;

function SimilarRequestAlert({ materialIds, openRequests }: { materialIds: string[]; openRequests: any[] }) {
  if (!materialIds.length) return null;
  const OPEN = new Set(['NEEDS_PO','AWAITING_APPROVAL','AWAITING_DELIVERY','PARTLY_RECEIVED']);
  const matches = openRequests.filter(r => {
    if (!OPEN.has(getStage(r))) return false;
    return r.items?.some((i: any) => materialIds.includes(i.materialId));
  });
  if (!matches.length) return null;
  const names = matches.map(r => r.reqNo).join(', ');
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-[#F5D798] bg-[#FDF3E3] p-3">
      <AlertCircle className="h-4 w-4 text-[#8A4B06] shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-[#8A4B06] font-jakarta">Same material in open requests</p>
        <p className="text-xs text-[#8A4B06] font-jakarta mt-0.5">{names} — consider merging instead.</p>
      </div>
    </div>
  );
}

export default function FmsNewPurchaseRequestPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAdminAuthStore();
  const isSuperadmin = user?.role === 'superadmin';
  const canCreate = user?.purchaseRole === 'requester' || isSuperadmin ||
    (!user?.storeId && user?.role === 'admin');

  const [items, setItems]       = useState([{ materialId: '', materialName: '', qtyKg: '' }]);
  const [department, setDept]   = useState('');
  const [requiredBy, setReqBy]  = useState('');
  const [priority, setPriority] = useState<'NORMAL'|'URGENT'>('NORMAL');
  const [purpose, setPurpose]   = useState('');

  const { data: materials = [] } = useQuery({
    queryKey: ['purchase-materials'],
    queryFn: () => api.getPurchaseMaterials(),
  });
  const { data: openRequests = [] } = useQuery({
    queryKey: ['purchase-requests'],
    queryFn: () => api.getPurchaseRequests(),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.createPurchaseRequest(data),
    onSuccess: (req) => {
      toast({ title: 'Request created', description: `${req.reqNo} sent to Purchase Desk.` });
      router.push('/fms/purchase');
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const addRow    = () => setItems(p => [...p, { materialId: '', materialName: '', qtyKg: '' }]);
  const removeRow = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: string, value: string) => setItems(prev => {
    const next = [...prev];
    if (field === 'materialId') {
      const mat = materials.find((m: any) => m._id === value);
      next[i] = { ...next[i], materialId: value, materialName: mat?.name || '' };
    } else {
      next[i] = { ...next[i], [field]: value };
    }
    return next;
  });

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    for (const item of items) {
      if (!item.materialId) { toast({ title: 'Select material for all rows', variant: 'destructive' }); return; }
      const qty = parseFloat(item.qtyKg);
      if (!qty || qty <= 0) { toast({ title: 'Enter valid quantity for all rows', variant: 'destructive' }); return; }
    }
    createMut.mutate({
      items:      items.map(i => ({ materialId: i.materialId, materialName: i.materialName, qtyKg: parseFloat(i.qtyKg) })),
      department: department || undefined,
      requiredBy: requiredBy || undefined,
      priority,
      note:       purpose || undefined,
    });
  };

  const selectedMaterialIds = items.map(i => i.materialId).filter(Boolean);

  if (!canCreate) {
    return (
      <div className="flex h-screen items-center justify-center font-jakarta text-[#66706A]" style={{ background: '#F7F6F2' }}>
        Only requesters can create purchase requests.
      </div>
    );
  }

  return (
    <div className="min-h-full" style={{ background: '#F7F6F2' }}>
      {/* Header */}
      <div className="bg-white border-b border-[#ECE9E1] px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#8A9490] mb-1 font-jakarta">
            <button onClick={() => router.push('/fms/purchase')} className="text-[#1E5E3F] font-medium hover:underline">
              Purchase FMS
            </button>
            <ChevronRight className="h-3 w-3" />
            <span>New Request</span>
          </div>
          <h1 className="font-fraunces text-[22px] font-semibold text-[#18211C]">New Purchase Request</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs font-jakarta rounded-[10px]"
            onClick={() => router.back()}>Cancel</Button>
          <Button size="sm" className="h-8 text-xs font-jakarta rounded-[10px] text-white"
            style={{ background: '#1E5E3F' }} disabled={createMut.isPending}
            onClick={handleSubmit}>
            {createMut.isPending ? 'Sending…' : 'Send Request'}
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 max-w-2xl space-y-5">

        {/* Similar-request alert */}
        <SimilarRequestAlert materialIds={selectedMaterialIds} openRequests={openRequests as any[]} />

        {/* Materials */}
        <div className="bg-white rounded-[18px] border border-[#ECE9E1] overflow-hidden shadow-[0_1px_2px_rgba(24,33,28,.06)]">
          <div className="px-5 py-3 border-b border-[#ECE9E1]">
            <h2 className="text-sm font-semibold text-[#18211C] font-jakarta">Materials</h2>
          </div>
          <div className="p-5 space-y-2.5">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <select
                    className="w-full h-9 rounded-[10px] border border-[#ECE9E1] bg-white px-3 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-[#1E5E3F]/20"
                    value={item.materialId}
                    onChange={e => updateRow(i, 'materialId', e.target.value)}
                  >
                    <option value="">Select material</option>
                    {materials.map((m: any) => (
                      <option key={m._id} value={m._id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-36 flex items-center">
                  <Input
                    type="number" inputMode="decimal" min="0.1" step="0.1"
                    value={item.qtyKg}
                    onChange={e => updateRow(i, 'qtyKg', e.target.value)}
                    placeholder="Qty"
                    className="h-9 text-sm rounded-r-none font-jetbrains"
                  />
                  <span className="h-9 flex items-center px-2 border border-l-0 rounded-r-[10px] bg-[#FAF9F5] text-xs text-[#66706A] font-jetbrains shrink-0">
                    {materials.find((m: any) => m._id === item.materialId)?.uom || 'kg'}
                  </span>
                </div>
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="icon"
                    className="h-9 w-9 text-red-400 hover:text-red-600 shrink-0"
                    onClick={() => removeRow(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRow}
              className="text-xs font-jakarta rounded-[10px] border-dashed">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add material
            </Button>
          </div>
        </div>

        {/* Request details */}
        <div className="bg-white rounded-[18px] border border-[#ECE9E1] overflow-hidden shadow-[0_1px_2px_rgba(24,33,28,.06)]">
          <div className="px-5 py-3 border-b border-[#ECE9E1]">
            <h2 className="text-sm font-semibold text-[#18211C] font-jakarta">Request Details</h2>
          </div>
          <div className="p-5 space-y-4">
            {/* Department + Required By */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Department</label>
                <select
                  className="w-full h-9 rounded-[10px] border border-[#ECE9E1] bg-white px-3 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-[#1E5E3F]/20"
                  value={department}
                  onChange={e => setDept(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Required By</label>
                <Input type="date" className="h-9 text-sm font-jakarta" value={requiredBy} onChange={e => setReqBy(e.target.value)} />
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Priority</label>
              <div className="flex gap-2">
                {(['NORMAL','URGENT'] as const).map(p => (
                  <button key={p} type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 h-9 rounded-[10px] border text-xs font-medium font-jakarta transition-all ${
                      priority === p
                        ? p === 'URGENT'
                          ? 'bg-[#FDECEA] border-[#E87171] text-[#A3241A]'
                          : 'bg-[#EAF3EE] border-[#B8DFC8] text-[#1E5E3F]'
                        : 'bg-white border-[#ECE9E1] text-[#8A9490] hover:border-[#C5C2B9]'
                    }`}>
                    {p === 'URGENT' ? '🔥 Urgent' : '✓ Normal'}
                  </button>
                ))}
              </div>
            </div>

            {/* Purpose */}
            <div>
              <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Purpose / Note</label>
              <Input
                className="text-sm font-jakarta h-9"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                placeholder="e.g. urgent — press idle from Thursday"
              />
            </div>
          </div>
        </div>

        {/* Mobile bottom submit */}
        <div className="md:hidden">
          <Button type="submit" disabled={createMut.isPending}
            className="w-full h-11 text-sm font-jakarta rounded-[12px] text-white" style={{ background: '#1E5E3F' }}>
            {createMut.isPending ? 'Sending…' : 'Send Request'}
          </Button>
        </div>

      </form>
    </div>
  );
}
