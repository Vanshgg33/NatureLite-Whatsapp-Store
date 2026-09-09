'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Pencil, X, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const ALL_TAGS = ['B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Wholesale', 'Retail'] as const;
type CTag = typeof ALL_TAGS[number];

const TAG_COLORS: Record<CTag, string> = {
  B2B: 'bg-blue-50 text-blue-700',
  Transport: 'bg-orange-50 text-orange-700',
  'Home Delivery': 'bg-teal-50 text-teal-700',
  'Store/Retail': 'bg-purple-50 text-purple-700',
  Wholesale: 'bg-amber-50 text-amber-700',
  Retail: 'bg-pink-50 text-pink-700',
};

const TAG_FILTER_ACTIVE: Record<CTag, string> = {
  B2B: 'bg-blue-100 text-blue-700 border-blue-300',
  Transport: 'bg-orange-100 text-orange-700 border-orange-300',
  'Home Delivery': 'bg-teal-100 text-teal-700 border-teal-300',
  'Store/Retail': 'bg-purple-100 text-purple-700 border-purple-300',
  Wholesale: 'bg-amber-100 text-amber-700 border-amber-300',
  Retail: 'bg-pink-100 text-pink-700 border-pink-300',
};

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium', TAG_COLORS[tag as CTag] ?? 'bg-gray-100 text-gray-600')}>
      {tag}
    </span>
  );
}

type Address = { label: string; line: string; isDefault: boolean };

interface CustomerFormState {
  name: string;
  phone: string;
  altPhone: string;
  gstNo: string;
  tags: CTag[];
  addresses: Address[];
}

const BLANK: CustomerFormState = {
  name: '', phone: '', altPhone: '', gstNo: '', tags: [], addresses: [],
};

function CustomerForm({
  initial,
  onSave,
  saving,
}: {
  initial: CustomerFormState;
  onSave: (data: CustomerFormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CustomerFormState>(initial);
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrLine, setAddrLine] = useState('');

  const set = (k: keyof CustomerFormState, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleTag = (t: CTag) =>
    set('tags', form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t]);

  const addAddress = () => {
    if (!addrLine.trim()) return;
    const isFirst = form.addresses.length === 0;
    set('addresses', [...form.addresses, { label: addrLabel, line: addrLine.trim(), isDefault: isFirst }]);
    setAddrLine('');
  };

  const removeAddress = (i: number) =>
    set('addresses', form.addresses.filter((_, idx) => idx !== i));

  const setDefault = (i: number) =>
    set('addresses', form.addresses.map((a, idx) => ({ ...a, isDefault: idx === i })));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Name *</label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Customer name" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Phone *</label>
          <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="10-digit mobile" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Alt Phone</label>
          <Input value={form.altPhone} onChange={e => set('altPhone', e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">GST Number</label>
          <Input value={form.gstNo} onChange={e => set('gstNo', e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 mb-1.5 block">Tags</label>
        <div className="flex flex-wrap gap-2">
          {ALL_TAGS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={cn(
                'px-3 py-1 rounded text-xs font-medium border transition-all',
                form.tags.includes(t)
                  ? TAG_FILTER_ACTIVE[t]
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 mb-1.5 block">Addresses</label>
        {form.addresses.map((a, i) => (
          <div key={i} className="flex items-center gap-2 mb-1.5 bg-gray-50 px-3 py-2 rounded text-sm">
            <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-600 shrink-0">{a.label}:</span>
            <span className="flex-1 text-gray-700 truncate">{a.line}</span>
            {a.isDefault
              ? <span className="text-xs text-green-600 font-medium shrink-0">Default</span>
              : <button type="button" onClick={() => setDefault(i)} className="text-xs text-blue-500 shrink-0">Set default</button>
            }
            <button type="button" onClick={() => removeAddress(i)} className="text-gray-400 hover:text-red-500 shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <select
            value={addrLabel}
            onChange={e => setAddrLabel(e.target.value)}
            className="text-sm border rounded px-2 py-1.5 bg-white"
          >
            <option>Home</option>
            <option>Shop</option>
            <option>Warehouse</option>
            <option>Office</option>
            <option>Other</option>
          </select>
          <Input
            className="flex-1"
            value={addrLine}
            onChange={e => setAddrLine(e.target.value)}
            placeholder="Address line"
            onKeyDown={e => e.key === 'Enter' && addAddress()}
          />
          <Button type="button" variant="outline" size="sm" onClick={addAddress}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={() => onSave(form)} disabled={saving || !form.name || !form.phone}>
          {saving ? 'Saving…' : 'Save Customer'}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function BillingCustomersPage() {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<CTag | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const [editing, setEditing] = useState<any | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['billing-customers', debouncedSearch],
    queryFn: () => api.searchBillingCustomers(debouncedSearch),
  });

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormState) => api.createBillingCustomer({
      name: data.name,
      phone: data.phone,
      altPhone: data.altPhone || undefined,
      gstNo: data.gstNo || undefined,
      tags: data.tags,
      addresses: data.addresses,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-customers'] });
      toast({ title: 'Customer created' });
      setEditing(null);
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? 'Failed to create customer', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomerFormState }) =>
      api.updateBillingCustomer(id, {
        altPhone: data.altPhone || undefined,
        gstNo: data.gstNo || undefined,
        tags: data.tags,
        addresses: data.addresses,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-customers'] });
      toast({ title: 'Customer updated' });
      setEditing(null);
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? 'Failed to update', variant: 'destructive' });
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = (data: CustomerFormState) => {
    if (editing?._id) {
      updateMutation.mutate({ id: editing._id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEdit = (c: any) => setEditing({
    ...c,
    _formState: {
      name: c.canonicalName ?? c.name,
      phone: c.phone,
      altPhone: c.altPhone ?? '',
      gstNo: c.gstNo ?? '',
      tags: c.tags ?? [],
      addresses: c.addresses ?? [],
    },
  });

  const initialForEdit = (c: any): CustomerFormState => c?._formState ?? BLANK;

  const filtered = tagFilter
    ? customers.filter((c: any) => c.tags?.includes(tagFilter))
    : customers;

  return (
    <>
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 h-12 bg-white border-b border-gray-200">
        <div className="relative w-52 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 h-8 text-sm border-gray-200 rounded focus-visible:ring-[#2d7a4f]/30"
            placeholder="Name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none">
          {ALL_TAGS.map(t => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={cn(
                'px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap transition-colors shrink-0',
                tagFilter === t
                  ? TAG_FILTER_ACTIVE[t]
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              )}
            >
              {t}
            </button>
          ))}
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className="px-2.5 py-1 rounded text-[11px] font-medium border bg-white text-gray-400 border-gray-200 hover:bg-gray-50 whitespace-nowrap shrink-0 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 font-mono">{filtered.length} customers</span>
          <Button
            onClick={() => setEditing({})}
            size="sm"
            className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white h-8 text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> New Customer
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="h-6 w-6 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="sticky top-12 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tags</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">GST No</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Orders</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total Billed</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Outstanding</th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-gray-400 text-sm">
                  {search || tagFilter ? 'No customers match your filters.' : 'No customers yet — create one.'}
                </td>
              </tr>
            ) : filtered.map((c: any) => (
              <tr key={c._id} className="hover:bg-[#f7faf8] transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-[#e8f5ee] flex items-center justify-center shrink-0">
                      <span className="text-[#2d7a4f] font-bold text-xs">{c.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="font-medium text-gray-900 text-sm">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 flex-wrap max-w-[200px]">
                    {c.tags?.map((t: string) => <TagBadge key={t} tag={t} />)}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{c.gstNo || '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-600 text-sm tabular-nums">{c.orderCount ?? 0}</td>
                <td className="px-4 py-2.5 text-right text-gray-700 font-medium text-sm tabular-nums">
                  ₹{(c.totalPurchase ?? 0).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {(c.outstanding ?? 0) > 0 ? (
                    <span className="text-red-600 font-semibold text-sm">₹{c.outstanding.toLocaleString('en-IN')}</span>
                  ) : (
                    <span className="text-gray-300 text-sm">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => openEdit(c)}
                    className="text-gray-300 hover:text-[#2d7a4f] transition-colors p-0.5"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?._id ? 'Edit Customer' : 'New Customer'}</DialogTitle>
          </DialogHeader>
          {editing !== null && (
            <CustomerForm
              initial={editing?._id ? initialForEdit(editing) : BLANK}
              onSave={handleSave}
              saving={saving}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
