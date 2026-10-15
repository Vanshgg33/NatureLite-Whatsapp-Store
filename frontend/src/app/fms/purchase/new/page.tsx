'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ChevronRight, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { getStage } from '@/lib/fms/stage';
import { usePermission } from '@/lib/fms/permissions';
import { filterMaterials } from './material-search-utils';

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

function MaterialCombobox({ value, materials, canAdd, onChange, onQuickAdd }: {
  value: string;
  materials: any[];
  canAdd: boolean;
  onChange: (id: string, name: string, uom: string) => void;
  onQuickAdd: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = filterMaterials(materials, q);
  const selectedName = materials.find((m: any) => m._id === value)?.name ?? '';
  const displayVal = open ? q : (value ? selectedName : '');
  const exactMatch = materials.some(m => m.name.toLowerCase() === q.toLowerCase().trim());

  return (
    <div className="relative">
      <input
        value={displayVal}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search material…"
        className="w-full h-9 rounded-[10px] border border-[#ECE9E1] bg-white px-3 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-[#1E5E3F]/20"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#ECE9E1] rounded-[10px] shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 20).map((m: any) => (
            <button key={m._id} type="button"
              className="w-full text-left px-3 py-2 hover:bg-[#F7F6F2] text-sm font-jakarta"
              onMouseDown={() => onChange(m._id, m.name, m.uom || 'kg')}>
              {m.name}
              <span className="text-xs text-[#8A9490] ml-1.5 font-jetbrains">{m.uom || 'kg'}</span>
            </button>
          ))}
          {canAdd && q.trim() && !exactMatch && (
            <button type="button"
              className="w-full text-left px-3 py-2 text-sm text-[#1E5E3F] font-medium hover:bg-[#F7F6F2] font-jakarta"
              onMouseDown={() => { onQuickAdd(q.trim()); }}>
              + Add "{q.trim()}" as new material
            </button>
          )}
          {filtered.length === 0 && !q.trim() && (
            <p className="px-3 py-2 text-xs text-[#8A9490] font-jakarta">No materials yet.</p>
          )}
        </div>
      )}
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
  const canAddMaterial = usePermission('materials.manage');

  const queryClient = useQueryClient();
  const [items, setItems]       = useState([{ materialId: '', materialName: '', uom: 'kg', qtyKg: '', tagId: '', tagName: '', tagColor: '' }]);
  const { data: tags = [] } = useQuery({ queryKey: ['purchase-tags'], queryFn: () => api.getPurchaseTags() });
  const [department, setDept]   = useState('');
  const [requiredBy, setReqBy]  = useState('');
  const [priority, setPriority] = useState<'NORMAL'|'URGENT'>('NORMAL');
  const [purpose, setPurpose]   = useState('');

  const [quickAddOpen, setQuickAddOpen]   = useState(false);
  const [quickAddName, setQuickAddName]   = useState('');
  const [quickAddUom,  setQuickAddUom]    = useState('kg');
  const [quickAddIdx,  setQuickAddIdx]    = useState(-1);

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

  const quickAddMut = useMutation({
    mutationFn: (data: { name: string; uom: string }) => api.createPurchaseMaterial(data),
    onSuccess: (mat: any) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-materials'] });
      const id = mat._id ?? mat.data?._id;
      if (id && quickAddIdx >= 0) {
        setItems(prev => {
          const next = [...prev];
          next[quickAddIdx] = { ...next[quickAddIdx], materialId: id, materialName: quickAddName, uom: quickAddUom };
          return next;
        });
      }
      setQuickAddOpen(false);
      toast({ title: `"${quickAddName}" added` });
    },
    onError: (err) => toast({ title: 'Error', description: getApiError(err), variant: 'destructive' }),
  });

  const addRow    = () => setItems(p => [...p, { materialId: '', materialName: '', uom: 'kg', qtyKg: '', tagId: '', tagName: '', tagColor: '' }]);
  const removeRow = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: string, value: string) => setItems(prev => {
    const next = [...prev];
    if (field === 'materialId') {
      const mat = materials.find((m: any) => m._id === value);
      next[i] = { ...next[i], materialId: value, materialName: mat?.name || '', uom: mat?.uom || 'kg' };
    } else {
      next[i] = { ...next[i], [field]: value };
    }
    return next;
  });
  const setMaterialFromCombobox = (i: number, id: string, name: string, uom: string) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], materialId: id, materialName: name, uom };
      return next;
    });
  };
  const setRowTag = (i: number, tagId: string, tagName: string, tagColor: string) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], tagId, tagName, tagColor };
      return next;
    });
  };
  const setAllTag = (tagId: string) => {
    const t = (tags as any[]).find((t: any) => t._id === tagId);
    if (!t) return;
    setItems(prev => prev.map(r => ({ ...r, tagId: t._id, tagName: t.name, tagColor: t.color })));
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!department) { toast({ title: 'Department is required', variant: 'destructive' }); return; }
    if (!requiredBy) { toast({ title: 'Required By date is required', variant: 'destructive' }); return; }
    for (const item of items) {
      if (!item.materialId) { toast({ title: 'Select material for all rows', variant: 'destructive' }); return; }
      const qty = parseFloat(item.qtyKg);
      if (!qty || qty <= 0) { toast({ title: 'Enter valid quantity for all rows', variant: 'destructive' }); return; }
    }
    createMut.mutate({
      items:      items.map(i => ({ materialId: i.materialId, materialName: i.materialName, qtyKg: parseFloat(i.qtyKg), tagId: i.tagId || undefined, tagName: i.tagName || undefined, tagColor: i.tagColor || undefined })),
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
          <div className="px-5 py-3 border-b border-[#ECE9E1] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#18211C] font-jakarta">Materials</h2>
            {(tags as any[]).length > 0 && (
              <select className="h-7 rounded-lg border border-[#ECE9E1] px-2 text-xs font-jakarta" onChange={e => { if (e.target.value) setAllTag(e.target.value); e.target.value = ''; }}>
                <option value="">Set all to…</option>
                {(tags as any[]).map((t: any) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <div className="p-5 space-y-2.5">
            {items.map((item, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                <div className="flex-1">
                  <MaterialCombobox
                    value={item.materialId}
                    materials={materials as any[]}
                    canAdd={canAddMaterial}
                    onChange={(id, name, uom) => setMaterialFromCombobox(i, id, name, uom)}
                    onQuickAdd={(name) => { setQuickAddName(name); setQuickAddIdx(i); setQuickAddUom('kg'); setQuickAddOpen(true); }}
                  />
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
                    {item.uom || 'kg'}
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
                {(tags as any[]).length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pl-0">
                    {(tags as any[]).map((t: any) => (
                      <button key={t._id} type="button"
                        onClick={() => setRowTag(i, item.tagId === t._id ? '' : t._id, item.tagId === t._id ? '' : t.name, item.tagId === t._id ? '' : t.color)}
                        className="px-2 py-0.5 rounded-full text-xs font-medium border transition-all font-jakarta"
                        style={item.tagId === t._id ? { background: t.color, borderColor: t.color, color: '#fff' } : { borderColor: '#ECE9E1', color: '#66706A' }}>
                        {t.name}
                      </button>
                    ))}
                    {item.materialId && item.tagId && (
                      <label className="flex items-center gap-1 ml-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[#1E5E3F]"
                          checked={(materials as any[]).find((m: any) => m._id === item.materialId)?.defaultTagId === item.tagId}
                          onChange={() => {
                            const mat = (materials as any[]).find((m: any) => m._id === item.materialId);
                            if (!mat) return;
                            const newDefault = mat.defaultTagId === item.tagId ? null : item.tagId;
                            api.updatePurchaseMaterial(item.materialId, { defaultTagId: newDefault ?? '' });
                            queryClient.invalidateQueries({ queryKey: ['purchase-materials'] });
                            queryClient.invalidateQueries({ queryKey: ['purchase-materials-all'] });
                          }}
                        />
                        <span className="text-[10px] text-[#8A9490] font-jakarta">Remember</span>
                      </label>
                    )}
                  </div>
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
                <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Department <span className="text-red-500">*</span></label>
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
                <label className="text-xs font-medium text-[#66706A] mb-1.5 block font-jakarta">Required By <span className="text-red-500">*</span></label>
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

        {/* Quick-add material dialog */}
        {quickAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setQuickAddOpen(false)}>
            <div className="bg-white rounded-[18px] border border-[#ECE9E1] p-6 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="font-fraunces text-[17px] font-semibold text-[#18211C] mb-4">Add New Material</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#66706A] font-jakarta mb-1 block">Name</label>
                  <Input
                    className="h-9 text-sm font-jakarta"
                    value={quickAddName}
                    onChange={e => setQuickAddName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#66706A] font-jakarta mb-1 block">Unit</label>
                  <select
                    className="h-9 w-full rounded-[10px] border border-[#ECE9E1] px-3 text-sm font-jetbrains"
                    value={quickAddUom}
                    onChange={e => setQuickAddUom(e.target.value)}
                  >
                    {['kg','g','L','ml','pcs','box','packet','roll'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <Button type="button" variant="outline" size="sm" className="flex-1 font-jakarta" onClick={() => setQuickAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="flex-1 font-jakarta text-white" style={{ background: '#1E5E3F' }}
                  disabled={!quickAddName.trim() || quickAddMut.isPending}
                  onClick={() => quickAddMut.mutate({ name: quickAddName.trim(), uom: quickAddUom })}>
                  {quickAddMut.isPending ? 'Adding…' : 'Add Material'}
                </Button>
              </div>
            </div>
          </div>
        )}

      </form>
    </div>
  );
}
