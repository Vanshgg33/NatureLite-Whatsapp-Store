'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Plus, X, Pin, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/utils';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { GST_STATE_CODES } from '@/lib/billing/constants/stateCodes';
import { CHANNELS, CHANNEL_COLORS, type PriceTier } from '@/lib/billing/channel';
import type { GodownDto } from '../types';
import { useListNav } from '../useListNav';
import { getApiError } from '@/lib/api-error';

type CTag = 'B2B' | 'Transport' | 'Home Delivery' | 'Store/Retail' | 'Wholesale' | 'Retail';
const ALL_TAGS: CTag[] = ['B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Wholesale', 'Retail'];
const TAG_COLORS: Record<string, string> = {
  B2B: 'bg-blue-100 text-blue-700',
  Transport: 'bg-orange-100 text-orange-700',
  'Home Delivery': 'bg-teal-100 text-teal-700',
  'Store/Retail': 'bg-purple-100 text-purple-700',
  Wholesale: 'bg-amber-100 text-amber-700',
  Retail: 'bg-pink-100 text-pink-700',
};

/** a bill needs a customer phone of exactly 10 digits (the server shows 91XXXXXXXXXX as the 10-digit number) */
export const isTenDigitPhone = (p: unknown) => /^\d{10}$/.test(String(p ?? '').trim());
export const phoneProblem = (p: unknown) => {
  const s = String(p ?? '').trim();
  if (!s) return 'Phone number is required';
  if (/\D/.test(s)) return 'Use digits only (no spaces, +91 or dashes)';
  if (s.length !== 10) return `Phone number must be exactly 10 digits (${s.length} entered)`;
  return '';
};

const STATE_OPTIONS = Object.entries(GST_STATE_CODES)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([code, name]) => ({ code, name }));

function CustomerSearch({ onSelect }: { onSelect: (c: any) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 250);
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newGst, setNewGst] = useState('');
  const [newTags, setNewTags] = useState<CTag[]>([]);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneErr = phoneTouched ? phoneProblem(newPhone) : '';
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dq) { setResults([]); return; }
    let live = true; // a slow older response must not overwrite a newer one
    api.searchBillingCustomers(dq).then(r => { if (live) setResults(r); }).catch(() => {});
    return () => { live = false; };
  }, [dq]);

  const pick = (c: any) => { onSelect(c); setQ(''); setOpen(false); };
  const startCreate = () => {
    // prefill from what was typed in the search box
    if (/^[\d\s+-]{6,}$/.test(q)) setNewPhone(q.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')); else if (q.trim()) setNewName(q.trim());
    setCreateErr('');
    setPhoneTouched(false);
    setShowCreate(true);
    setOpen(true);
  };
  const showing = open && (q.length > 0 || showCreate);
  // options: each result, then "Add New Customer"
  const nav = useListNav(showing && !showCreate ? results.length + 1 : 0,
    i => (i < results.length ? pick(results[i]) : startCreate()), () => setOpen(false));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleCreate = async () => {
    setPhoneTouched(true);
    if (creating) return;
    if (!newName.trim()) { setCreateErr('Name is required'); return; }
    if (phoneProblem(newPhone)) return; // shown under the phone field
    const gst = newGst.trim().toUpperCase();
    if (gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst)) { setCreateErr('Enter a valid 15-character GSTIN'); return; }
    setCreateErr('');
    setCreating(true);
    try {
      const line = newAddress.trim();
      const customer = await api.createBillingCustomer({
        name: newName.trim(), phone: newPhone.trim(), tags: newTags, gstNo: gst || undefined,
        addresses: line ? [{ label: 'Billing', line, isDefault: true }] : [],
      });
      onSelect(customer);
      toast({ title: `${customer.name} added and selected` });
      setShowCreate(false);
      setNewName(''); setNewPhone(''); setNewAddress(''); setNewGst(''); setNewTags([]); setPhoneTouched(false);
      setQ('');
      setOpen(false);
    } catch (e: any) {
      setCreateErr(getApiError(e, 'Failed to create customer')); // stays open with what was typed
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1 min-w-0">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            id="customer-search"
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={nav.onKeyDown}
            role="combobox" aria-expanded={showing} aria-autocomplete="list"
            placeholder="Search by name or phone… (↑↓ Enter)"
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 bg-white"
            autoComplete="off"
          />
        </div>
        <Button type="button" onClick={startCreate} aria-expanded={showCreate && open}
          className="shrink-0 h-auto bg-[#2d7a4f] hover:bg-[#245f3e] text-white text-xs px-3 focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/40 focus-visible:ring-offset-1">
          <Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">New Customer</span><span className="sr-only sm:hidden">New Customer</span>
        </Button>
      </div>
      {showing && (
        <div role="listbox" className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg overflow-hidden animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none">
          {results.map((c, i) => (
            <button key={c._id} role="option" aria-selected={nav.active === i}
              onMouseEnter={() => nav.setActive(i)}
              className={cn('w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f7faf8] text-left transition-colors', nav.active === i && !showCreate && 'bg-[#f7faf8]')}
              onClick={() => pick(c)}
            >
              <div className="h-8 w-8 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-sm shrink-0">
                {(c.name || c.phone || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{c.name}</div>
                <div className="text-xs text-gray-400 font-mono">{c.phone}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {c.tags?.slice(0, 2).map((t: string) => (
                  <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded', TAG_COLORS[t] ?? 'bg-gray-100 text-gray-600')}>{t}</span>
                ))}
              </div>
            </button>
          ))}
          {!showCreate ? (
            <button role="option" aria-selected={nav.active === results.length}
              onMouseEnter={() => nav.setActive(results.length)}
              className={cn('w-full flex items-center gap-2 px-4 py-2.5 text-[#2d7a4f] font-medium text-sm hover:bg-[#f7faf8] border-t border-gray-100 transition-colors', nav.active === results.length && 'bg-[#f7faf8]')}
              onClick={startCreate}
            >
              <Plus className="h-4 w-4" /> Add New Customer
              {dq && results.length === 0 && <span className="ml-auto text-xs font-normal text-gray-400">No match for “{dq}”</span>}
            </button>
          ) : (
            <div className="p-4 border-t border-gray-100 space-y-3 animate-in fade-in-0 duration-150"
              onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); handleCreate(); } }}>
              <p className="text-xs font-semibold text-gray-600">New Customer</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
                <Input autoFocus aria-label="Customer name" placeholder="Name *" value={newName} onChange={e => { setNewName(e.target.value); setCreateErr(''); }} className="text-sm h-8" disabled={creating} />
                <div>
                  <Input aria-label="Phone (10 digits)" type="tel" inputMode="numeric" placeholder="Phone * (10 digits)" maxLength={10} required
                    aria-invalid={!!phoneErr} aria-describedby={phoneErr ? 'new-cust-phone-err' : undefined}
                    value={newPhone} onChange={e => { setNewPhone(e.target.value); setCreateErr(''); }} onBlur={() => newPhone && setPhoneTouched(true)}
                    className={cn('text-sm h-8 font-mono', phoneErr && 'border-red-400 focus-visible:ring-red-300')} disabled={creating} />
                  {phoneErr && <p id="new-cust-phone-err" role="alert" className="mt-1 text-[11px] text-red-600">{phoneErr}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input aria-label="Address" placeholder="Address (optional)" value={newAddress} onChange={e => setNewAddress(e.target.value)} className="text-sm h-8" disabled={creating} />
                <Input aria-label="GSTIN" placeholder="GSTIN (optional, B2B)" maxLength={15} value={newGst} onChange={e => { setNewGst(e.target.value.toUpperCase()); setCreateErr(''); }} className="text-sm h-8 font-mono" disabled={creating} />
              </div>
              {createErr && <p role="alert" className="text-xs text-red-600">{createErr}</p>}
              <div className="flex flex-wrap gap-1.5">
                {ALL_TAGS.map(t => (
                  <button key={t} type="button"
                    onClick={() => setNewTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                    className={cn('px-2 py-0.5 rounded text-xs border transition-all',
                      newTags.includes(t) ? TAG_COLORS[t] + ' border-current' : 'bg-gray-50 text-gray-400 border-gray-200'
                    )}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={creating}
                  className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white text-xs h-7">
                  {creating ? 'Creating…' : 'Create & Select'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="text-xs h-7">Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Edits the customer master (GSTIN, tags). Saved invoices keep their own GSTIN snapshot. */
function CustomerQuickEdit({ customer, onDone }: { customer: any; onDone: (updated?: any) => void }) {
  const [gst, setGst] = useState(customer.gstNo ?? '');
  const [tags, setTags] = useState<string[]>(customer.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { toast } = useToast();

  const save = async () => {
    if (saving) return;
    const g = gst.trim().toUpperCase();
    if (g && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) { setErr('Enter a valid 15-character GSTIN'); return; }
    setSaving(true); setErr('');
    try {
      const updated = await api.updateBillingCustomer(customer._id, { gstNo: g, tags });
      toast({ title: `${customer.name} updated`, description: 'Applies to this and future bills. Saved invoices are unchanged.' });
      onDone(updated);
    } catch (e) {
      setErr(getApiError(e, 'Could not update customer')); // keep what was typed
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-3 pb-3 pt-2 border-t border-[#2d7a4f]/10 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none"
      onKeyDown={e => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); onDone(); }
      }}>
      <label className="block">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">GSTIN</span>
        <Input autoFocus value={gst} maxLength={15} disabled={saving} placeholder="Leave empty for B2C"
          onChange={e => { setGst(e.target.value.toUpperCase()); setErr(''); }} className="h-8 text-sm font-mono mt-1 bg-white" />
      </label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Customer tags">
        {ALL_TAGS.map(t => (
          <button key={t} type="button" disabled={saving} aria-pressed={tags.includes(t)}
            onClick={() => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
            className={cn('px-2 py-0.5 rounded text-xs border transition-all',
              tags.includes(t) ? TAG_COLORS[t] + ' border-current' : 'bg-white text-gray-400 border-gray-200')}>
            {t}
          </button>
        ))}
      </div>
      {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={saving} className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white text-xs h-7">
          {saving ? 'Saving…' : 'Save customer'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone()} disabled={saving} className="text-xs h-7">Cancel</Button>
        <span className="text-[10px] text-gray-400 ml-auto">Name &amp; phone are changed in Customers</span>
      </div>
    </div>
  );
}

/**
 * Pick which saved address this bill uses, or add / edit one. Saves go to the customer master one address at a time
 * (the server refuses if the list changed meanwhile), and the bill keeps its own copy of the chosen line.
 */
function AddressPicker({ customer, value, onChange, onCustomerUpdate }: {
  customer: any; value: string; onChange: (line: string) => void; onCustomerUpdate: (c: any) => void;
}) {
  const saved: Array<{ label: string; line: string; isDefault?: boolean }> = (customer.addresses ?? []).filter((a: any) => a?.line);
  const idx = saved.findIndex(a => a.line === value);
  const [form, setForm] = useState<null | { index: number; label: string; line: string; isDefault: boolean }>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { toast } = useToast();
  useEffect(() => { setForm(null); setErr(''); }, [customer._id]);

  const open = (index: number) => {
    const a = saved[index];
    setErr('');
    setForm(a ? { index, label: a.label || '', line: a.line, isDefault: !!a.isDefault } : { index: -1, label: '', line: '', isDefault: !saved.length });
  };
  const save = async () => {
    if (!form || saving) return;
    if (!form.line.trim()) { setErr('Type the address'); return; }
    setSaving(true); setErr('');
    try {
      const body = { label: form.label.trim() || 'Address', line: form.line.trim(), isDefault: form.isDefault };
      const updated = form.index < 0
        ? await api.addBillingCustomerAddress(customer._id, body)
        : await api.updateBillingCustomerAddress(customer._id, form.index, { ...body, was: saved[form.index].line });
      onCustomerUpdate(updated);
      // use what was just saved on this bill (the server tidies spaces)
      const line = body.line.replace(/\s+/g, ' ');
      onChange(updated.addresses?.find((a: any) => a.line.toLowerCase() === line.toLowerCase())?.line ?? line);
      toast({ title: form.index < 0 ? 'Address added' : 'Address updated', description: 'Saved to the customer. Saved invoices keep their own copy.' });
      setForm(null);
    } catch (e) {
      setErr(getApiError(e, 'Could not save the address')); // keep what was typed
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white';
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label htmlFor="bill-address" className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Billing Address</label>
        <div className="ml-auto flex items-center gap-2">
          {idx >= 0 && !form && (
            <button type="button" onClick={() => open(idx)} className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#2d7a4f] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/40">
              <Pencil className="h-3 w-3" />Edit
            </button>
          )}
          {!form && (
            <button type="button" onClick={() => open(-1)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2d7a4f] hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/40">
              <Plus className="h-3 w-3" />Add address
            </button>
          )}
        </div>
      </div>
      {saved.length > 0 || value ? (
        <select id="bill-address" value={value} onChange={e => onChange(e.target.value)} className={cn(field, 'truncate')}>
          {!value && <option value="">— No address on this bill —</option>}
          {saved.map((a, i) => (
            <option key={i} value={a.line}>{a.label ? `${a.label}: ` : ''}{a.line}{a.isDefault ? ' (default)' : ''}</option>
          ))}
          {/* an edited / older bill can carry an address that is no longer saved */}
          {value && idx < 0 && <option value={value}>On this bill: {value}</option>}
          {value && saved.length > 0 && <option value="">— No address on this bill —</option>}
        </select>
      ) : !form && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          No saved address for this customer. <button type="button" onClick={() => open(-1)} className="underline font-medium">Add one</button> or bill without an address.
        </p>
      )}
      <AnimatePresence initial={false}>
        {form && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}
            className="overflow-hidden">
            <div className="mt-2 p-2.5 rounded border border-[#2d7a4f]/20 bg-[#f7faf8] space-y-2"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); save(); }
                if (e.key === 'Escape') { e.preventDefault(); setForm(null); }
              }}>
              <p className="text-[11px] font-semibold text-gray-600">{form.index < 0 ? 'New address' : 'Edit address'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-2">
                <input aria-label="Address label" placeholder="Label (Home, Shop…)" maxLength={40} value={form.label} disabled={saving}
                  onChange={e => setForm({ ...form, label: e.target.value })} className={field} />
                <input autoFocus aria-label="Address" placeholder="Address *" maxLength={300} value={form.line} disabled={saving}
                  onChange={e => { setForm({ ...form, line: e.target.value }); setErr(''); }} className={field} />
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer w-fit">
                <input type="checkbox" checked={form.isDefault} disabled={saving} onChange={e => setForm({ ...form, isDefault: e.target.checked })} className="h-3 w-3 accent-[#2d7a4f]" />
                Default address for this customer
              </label>
              {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={save} disabled={saving} className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white text-xs h-7">
                  {saving ? 'Saving…' : form.index < 0 ? 'Save & use' : 'Save changes'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)} disabled={saving} className="text-xs h-7">Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface BillHeaderProps {
  priceMode: PriceTier;
  onPriceModeChange: (v: PriceTier) => void;
  invoiceNo: string;
  onInvoiceNoChange: (v: string) => void;
  /** editing an existing bill: its number is fixed */
  invoiceNoLocked?: boolean;
  invoiceDate: string;
  onInvoiceDateChange: (v: string) => void;
  invoiceTime: string;
  onInvoiceTimeChange: (v: string) => void;
  godownId: string;
  onGodownChange: (id: string) => void;
  godowns: GodownDto[];
  customer: any | null;
  onCustomerSelect: (c: any) => void;
  /** omitted = the customer is fixed (bill opened from that customer's CRM profile) */
  onCustomerClear?: () => void;
  /** customer master was edited from the bill (GSTIN / tags) */
  onCustomerUpdate: (c: any) => void;
  billingAddress: string;
  onBillingAddressChange: (v: string) => void;
  shippingAddress: string;
  onShippingAddressChange: (v: string) => void;
  sameAsBilling: boolean;
  onSameAsBillingChange: (v: boolean) => void;
  placeOfSupply: string;
  onPlaceOfSupplyChange: (v: string) => void;
  isInterState: boolean;
  orderTag: string;
  onOrderTagChange: (v: string) => void;
  /** IMS store the stock is taken from */
  storeId: string;
  onStoreChange: (v: string) => void;
  stores: Array<{ _id: string; name: string }>;
}

export function BillHeader({
  priceMode, onPriceModeChange,
  invoiceNo, onInvoiceNoChange, invoiceNoLocked,
  invoiceDate, onInvoiceDateChange,
  invoiceTime, onInvoiceTimeChange,
  godownId, onGodownChange, godowns,
  customer, onCustomerSelect, onCustomerClear, onCustomerUpdate,
  billingAddress, onBillingAddressChange,
  shippingAddress, onShippingAddressChange,
  sameAsBilling, onSameAsBillingChange,
  placeOfSupply, onPlaceOfSupplyChange, isInterState,
  orderTag, onOrderTagChange, storeId, onStoreChange, stores,
}: BillHeaderProps) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [customer?._id]); // a different customer starts closed
  return (
    <div className="space-y-3">
      {/* Row 1: Retail/B2B pricing + Invoice meta + Godown */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs shrink-0">
          {([['Store/Retail', 'Retail Pricing'], ['B2B', 'B2B Pricing']] as const).map(([tier, label]) => (
            <button key={tier} type="button" onClick={() => onPriceModeChange(tier)}
              className={cn('px-3 py-1.5 font-medium transition-colors',
                priceMode === tier ? 'bg-[#2d7a4f] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              )}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold shrink-0">Invoice No</label>
          <input value={invoiceNo} onChange={e => onInvoiceNoChange(e.target.value)} readOnly={invoiceNoLocked}
            title={invoiceNoLocked ? 'An edited bill keeps its invoice number' : undefined}
            className={`border border-gray-200 rounded px-2 py-1 text-xs font-mono w-36 focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none${invoiceNoLocked ? ' bg-gray-50 text-gray-600' : ''}`}
            maxLength={16} placeholder="NLF-…"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold shrink-0">Date</label>
          <input type="date" value={invoiceDate} onChange={e => onInvoiceDateChange(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
          />
          <input type="time" value={invoiceTime} onChange={e => onInvoiceTimeChange(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none w-24"
          />
        </div>

        {godowns.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold shrink-0">Godown</label>
            <select value={godownId} onChange={e => onGodownChange(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
              <option value="">— Select —</option>
              {godowns.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Row 2: State of Supply + tax chip */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold shrink-0">State of Supply</label>
          <select value={placeOfSupply} onChange={e => onPlaceOfSupplyChange(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
            {STATE_OPTIONS.map(s => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
        <AnimatePresence mode="wait">
          <motion.span key={isInterState ? 'inter' : 'intra'}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className={cn('text-[11px] px-2.5 py-1 rounded-full font-medium',
              isInterState ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
            )}>
            {isInterState ? 'Inter-state → IGST' : 'Intra-state → CGST + SGST'}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Row 3: Customer */}
      {customer ? (
        <div className="rounded border border-[#2d7a4f]/20 bg-[#f7faf8]">
          <div className="flex items-center gap-3 p-3">
            <div className="h-9 w-9 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold shrink-0">
              {(customer.name || customer.phone || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-gray-800 truncate">{customer.name || 'Unnamed customer'}</div>
              <div className="text-xs text-gray-400 font-mono">{customer.phone}</div>
              {customer.gstNo && <div className="text-xs text-gray-500 font-mono">{customer.gstNo}</div>}
            </div>
            <div className="hidden sm:flex gap-1 shrink-0">
              {customer.tags?.slice(0, 3).map((t: string) => (
                <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded', TAG_COLORS[t] ?? 'bg-gray-100 text-gray-600')}>{t}</span>
              ))}
            </div>
            <button type="button" onClick={() => setEditing(v => !v)} aria-expanded={editing} aria-label="Edit customer GSTIN and tags" title="Edit GSTIN / tags"
              className={cn('transition-colors', editing ? 'text-[#2d7a4f]' : 'text-gray-300 hover:text-gray-500')}>
              <Pencil className="h-4 w-4" />
            </button>
            {onCustomerClear && (
              <button type="button" onClick={onCustomerClear} aria-label="Change customer" className="text-gray-300 hover:text-gray-500 transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!isTenDigitPhone(customer.phone) && (
            <p role="alert" className="mx-3 mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
              {customer.phone ? <>This customer&apos;s phone <b className="font-mono">{customer.phone}</b> is not a valid 10-digit number.</> : <>This customer has no phone number.</>}
              {' '}A bill can&apos;t be saved until it is corrected in{' '}
              <Link href="/billing/customers" target="_blank" className="underline font-medium">Customers</Link>
              {onCustomerClear ? ', or pick another customer.' : '.'}
            </p>
          )}
          {editing && <CustomerQuickEdit key={customer._id} customer={customer} onDone={c => { if (c) onCustomerUpdate(c); setEditing(false); }} />}
        </div>
      ) : (
        <CustomerSearch onSelect={onCustomerSelect} />
      )}

      {/* Row 4: Billing/Shipping address */}
      {customer && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AddressPicker customer={customer} value={billingAddress} onChange={onBillingAddressChange} onCustomerUpdate={onCustomerUpdate} />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Shipping Address</label>
              <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                <input type="checkbox" checked={sameAsBilling} onChange={e => onSameAsBillingChange(e.target.checked)} className="h-3 w-3" />
                Same as billing
              </label>
            </div>
            {sameAsBilling ? (
              <div className="text-xs text-gray-400 px-2 py-1.5 border border-dashed border-gray-200 rounded">{billingAddress || '—'}</div>
            ) : (
              <input value={shippingAddress} onChange={e => onShippingAddressChange(e.target.value)}
                placeholder="Type shipping address…"
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
              />
            )}
          </div>
        </div>
      )}

      {/* Row 5: Order tag chips */}
      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map(tag => (
          <button key={tag} type="button"
            onClick={() => onOrderTagChange(tag)}
            className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
              orderTag === tag
                ? CHANNEL_COLORS[tag] + ' border-current shadow-sm'
                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
            )}>
            {tag}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          Store
          <select value={storeId} onChange={e => onStoreChange(e.target.value)}
            className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30">
            <option value="">— Select store —</option>
            {stores.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
