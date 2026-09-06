'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Pencil, X, MapPin, Phone, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const ALL_TAGS = ['B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Wholesale', 'Retail'] as const;
type CTag = typeof ALL_TAGS[number];

const TAG_COLORS: Record<CTag, string> = {
  B2B: 'bg-blue-100 text-blue-700 border-blue-200',
  Transport: 'bg-orange-100 text-orange-700 border-orange-200',
  'Home Delivery': 'bg-teal-100 text-teal-700 border-teal-200',
  'Store/Retail': 'bg-purple-100 text-purple-700 border-purple-200',
  Wholesale: 'bg-amber-100 text-amber-700 border-amber-200',
  Retail: 'bg-pink-100 text-pink-700 border-pink-200',
};

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TAG_COLORS[tag as CTag] ?? 'bg-gray-100 text-gray-700'}`}>
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
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                form.tags.includes(t)
                  ? TAG_COLORS[t] + ' ring-2 ring-offset-1 ring-current'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 mb-1.5 block">Addresses</label>
        {form.addresses.map((a, i) => (
          <div key={i} className="flex items-center gap-2 mb-1.5 bg-gray-50 px-3 py-2 rounded-lg text-sm">
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
            className="text-sm border rounded-md px-2 py-1.5 bg-white"
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
  const debouncedSearch = useDebouncedValue(search, 300);
  const [editing, setEditing] = useState<any | null>(null); // null = closed, {} = new, {...} = edit
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
        // name excluded — display name is set by dedup logic at create time
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

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header title="Billing Customers" />

      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* Header bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Search by name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setEditing({})} className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white">
            <Plus className="h-4 w-4 mr-1.5" /> New Customer
          </Button>
        </div>

        {/* Customer cards */}
        {isLoading ? (
          <div className="text-center text-gray-400 py-16">Loading…</div>
        ) : customers.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            {search ? 'No customers match your search.' : 'No customers yet. Create one!'}
          </div>
        ) : (
          <div className="grid gap-3">
            {customers.map((c: any) => (
              <Card key={c._id} className="shadow-sm border-0 bg-white rounded-xl">
                <CardContent className="p-4 flex items-start gap-4">
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-[#e8f5ee] flex items-center justify-center shrink-0">
                    <span className="text-[#2d7a4f] font-bold text-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{c.name}</span>
                      {c.tags?.map((t: string) => <TagBadge key={t} tag={t} />)}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />{c.phone}
                      </span>
                      {c.gstNo && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />{c.gstNo}
                        </span>
                      )}
                      {c.addresses?.[0] && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {c.addresses.find((a: Address) => a.isDefault)?.line ?? c.addresses[0].line}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                      <span>{c.orderCount} orders</span>
                      <span>₹{(c.totalPurchase ?? 0).toLocaleString('en-IN')} total</span>
                      {c.outstanding > 0 && (
                        <span className="text-red-600 font-semibold">₹{c.outstanding.toLocaleString('en-IN')} due</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => openEdit(c)}
                    className="text-gray-400 hover:text-[#2d7a4f] transition-colors shrink-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
