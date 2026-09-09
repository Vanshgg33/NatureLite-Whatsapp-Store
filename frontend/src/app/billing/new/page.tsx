'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Search, Plus, X, Printer, Save, User, Package, Trash2, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ─── Types ────────────────────────────────────────────────────────────────

type CTag = 'B2B' | 'Transport' | 'Home Delivery' | 'Store/Retail' | 'Wholesale' | 'Retail';

const TAG_PRIORITY: CTag[] = ['Wholesale', 'B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Retail'];

const TAG_COLORS: Record<string, string> = {
  B2B: 'bg-blue-100 text-blue-700',
  Transport: 'bg-orange-100 text-orange-700',
  'Home Delivery': 'bg-teal-100 text-teal-700',
  'Store/Retail': 'bg-purple-100 text-purple-700',
  Wholesale: 'bg-amber-100 text-amber-700',
  Retail: 'bg-pink-100 text-pink-700',
};

const ALL_TAGS: CTag[] = ['B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Wholesale', 'Retail'];
const GST_RATES = [0, 5, 12, 18, 28];

interface LineItem {
  productId: string;
  name: string;
  sku: string;
  hsnCode: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
  total: number;
  taxableAmount: number;
  gstAmount: number;
}

function computeItem(i: Omit<LineItem, 'total' | 'taxableAmount' | 'gstAmount'>): LineItem {
  const total = Math.round(i.unitPrice * i.qty * 100) / 100;
  const taxableAmount = Math.round(total / (1 + i.gstRate / 100) * 100) / 100;
  const gstAmount = Math.round((total - taxableAmount) * 100) / 100;
  return { ...i, total, taxableAmount, gstAmount };
}

function resolvePrice(basePrice: number, tags: string[], tagPrices: Array<{ tag: string; price: number }>) {
  for (const tag of TAG_PRIORITY) {
    if (!tags.includes(tag)) continue;
    const tp = tagPrices.find(p => p.tag === tag);
    if (tp) return tp.price;
  }
  return basePrice;
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Customer search combobox ─────────────────────────────────────────────

function CustomerSearch({ onSelect }: { onSelect: (c: any) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 250);
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTags, setNewTags] = useState<CTag[]>([]);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dq) { setResults([]); return; }
    api.searchBillingCustomers(dq).then(setResults).catch(() => {});
  }, [dq]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    setCreating(true);
    try {
      const customer = await api.createBillingCustomer({ name: newName.trim(), phone: newPhone.trim(), tags: newTags });
      onSelect(customer);
      setShowCreate(false);
      setQ('');
      setOpen(false);
    } catch (e: any) {
      toast({ title: e?.response?.data?.message ?? 'Failed to create customer', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          id="customer-search"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search by name or phone…"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 bg-white"
          autoComplete="off"
        />
      </div>

      {open && (q.length > 0 || showCreate) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg overflow-hidden">
          {results.map(c => (
            <button
              key={c._id}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f7faf8] text-left transition-colors"
              onClick={() => { onSelect(c); setQ(''); setOpen(false); }}
            >
              <div className="h-8 w-8 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-sm shrink-0">
                {c.name[0].toUpperCase()}
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
            <button
              className="w-full flex items-center gap-2 px-4 py-2.5 text-[#2d7a4f] font-medium text-sm hover:bg-[#f7faf8] border-t border-gray-100 transition-colors"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" /> Add New Customer
            </button>
          ) : (
            <div className="p-4 border-t border-gray-100 space-y-3">
              <p className="text-xs font-semibold text-gray-600">Quick Create Customer</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Name *" value={newName} onChange={e => setNewName(e.target.value)} className="text-sm h-8" />
                <Input placeholder="Phone *" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="text-sm h-8" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TAGS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                    className={cn('px-2 py-0.5 rounded text-xs border transition-all',
                      newTags.includes(t) ? TAG_COLORS[t] + ' border-current' : 'bg-gray-50 text-gray-400 border-gray-200'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={creating || !newName || !newPhone}
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

// ─── Product search ───────────────────────────────────────────────────────

function ProductSearch({ customerTags, onAdd }: { customerTags: string[]; onAdd: (item: LineItem) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 250);
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dq) { setResults([]); return; }
    api.searchBillingProducts(dq).then(setResults).catch(() => {});
  }, [dq]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const add = (p: any) => {
    const price = resolvePrice(p.price, customerTags, p.tagPrices ?? []);
    onAdd(computeItem({ productId: p._id, name: p.name, sku: p.sku, hsnCode: p.hsnCode ?? '', qty: 1, unitPrice: price, gstRate: 5 }));
    setQ('');
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => q && setOpen(true)}
          placeholder="Search by product name or SKU…"
          className="w-full pl-9 pr-4 py-2 border border-dashed border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 bg-gray-50 hover:bg-white transition-colors focus:bg-white focus:border-solid"
          autoComplete="off"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg overflow-hidden">
          {results.map(p => {
            const price = resolvePrice(p.price, customerTags, p.tagPrices ?? []);
            const isTagPrice = price !== p.price;
            return (
              <button
                key={p._id}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f7faf8] text-left transition-colors"
                onClick={() => add(p)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.sku}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn('text-sm font-semibold', isTagPrice ? 'text-[#2d7a4f]' : 'text-gray-700')}>{fmt(price)}</div>
                  {isTagPrice && <div className="text-[10px] text-gray-400 line-through">{fmt(p.price)}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function NewBillPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [customer, setCustomer] = useState<any | null>(null);
  const [selectedAddrIdx, setSelectedAddrIdx] = useState(0);
  const [orderTag, setOrderTag] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState('');

  const subtotal = Math.round(items.reduce((s, i) => s + i.taxableAmount, 0) * 100) / 100;
  const totalGst = Math.round(items.reduce((s, i) => s + i.gstAmount, 0) * 100) / 100;
  const grandTotal = Math.round((subtotal + totalGst) * 100) / 100;
  const amountDue = Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);
  const paymentStatus: 'paid' | 'partial' | 'unpaid' =
    amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

  const selectCustomer = (c: any) => {
    setCustomer(c);
    const defaultAddr = c.addresses?.findIndex((a: any) => a.isDefault) ?? 0;
    setSelectedAddrIdx(Math.max(0, defaultAddr));
    const primary = TAG_PRIORITY.find(t => c.tags?.includes(t)) ?? '';
    setOrderTag(primary);
  };

  const addItem = (item: LineItem) => {
    setItems(prev => {
      const existing = prev.findIndex(i => i.productId === item.productId);
      if (existing >= 0) {
        const updated = [...prev];
        const it = updated[existing];
        updated[existing] = computeItem({ ...it, qty: it.qty + 1 });
        return updated;
      }
      return [...prev, item];
    });
  };

  const updateItem = (idx: number, patch: Partial<Pick<LineItem, 'qty' | 'unitPrice' | 'gstRate'>>) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = computeItem({ ...updated[idx], ...patch });
      return updated;
    });
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); document.getElementById('customer-search')?.focus(); }
      if (e.key === 'Escape') router.push('/billing/customers');
      if (e.key === 'F8') { e.preventDefault(); saveMutation.mutate(false); }
      if (e.key === 'F9') { e.preventDefault(); saveMutation.mutate(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [customer, items, amountPaid, orderTag, notes]);

  const saveMutation = useMutation({
    mutationFn: async (print: boolean) => {
      if (!customer) throw new Error('Select a customer first');
      if (!items.length) throw new Error('Add at least one product');
      if (!orderTag) throw new Error('Select an order tag');
      const address = customer.addresses?.[selectedAddrIdx]?.line;
      const bill = await api.createBillingBill({
        customerId: customer._id,
        billingAddress: address,
        orderTag,
        items: items.map(i => ({
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          hsnCode: i.hsnCode,
          qty: i.qty,
          unitPrice: i.unitPrice,
          gstRate: i.gstRate,
        })),
        amountPaid,
        notes,
      });
      return { bill, print };
    },
    onSuccess: ({ bill, print }) => {
      toast({ title: `Bill ${bill.invoiceNo} saved` });
      if (print) {
        router.push(`/billing/invoice/${bill._id}?print=1`);
      } else {
        router.push(`/billing/invoice/${bill._id}`);
      }
    },
    onError: (e: any) => {
      toast({ title: e?.message ?? e?.response?.data?.message ?? 'Failed to save bill', variant: 'destructive' });
    },
  });

  return (
    <div className="flex flex-col min-h-full">
      {/* Page header bar */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 h-12 bg-white border-b border-gray-200 shrink-0">
        <button
          onClick={() => router.push('/billing/customers')}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-700 text-sm transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Back</span>
        </button>
        <div className="w-px h-4 bg-gray-200" />
        <span className="font-semibold text-gray-800 text-sm">New Bill</span>
        <span className="hidden lg:flex items-center gap-1 text-[11px] text-gray-400 ml-1">
          <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">F2</kbd> Customer ·
          <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">F8</kbd> Save ·
          <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">F9</kbd> Print ·
          <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Esc</kbd> Cancel
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/billing/customers')} className="text-xs h-8">
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_300px] flex-1">

        {/* ── Left: Customer + Order tag + Items ── */}
        <div className="flex flex-col gap-0 border-b lg:border-b-0 lg:border-r border-gray-200">

          {/* Customer section */}
          <div className="p-4 bg-white border-b border-gray-200">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Customer</p>
            {!customer ? (
              <CustomerSearch onSelect={selectCustomer} />
            ) : (
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold shrink-0">
                  {customer.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{customer.name}</span>
                    {customer.tags?.map((t: string) => (
                      <span key={t} className={cn('text-[11px] px-1.5 py-0.5 rounded', TAG_COLORS[t] ?? 'bg-gray-100')}>{t}</span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{customer.phone}
                    {customer.gstNo && <span className="ml-2 text-gray-400">GST: {customer.gstNo}</span>}
                  </div>
                  {customer.addresses?.length > 0 && (
                    <div className="mt-1.5">
                      {customer.addresses.length === 1 ? (
                        <span className="text-xs text-gray-500">{customer.addresses[0].line}</span>
                      ) : (
                        <select
                          value={selectedAddrIdx}
                          onChange={e => setSelectedAddrIdx(Number(e.target.value))}
                          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                        >
                          {customer.addresses.map((a: any, i: number) => (
                            <option key={i} value={i}>{a.label}: {a.line}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => setCustomer(null)} className="text-gray-300 hover:text-red-500 shrink-0 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Order tag */}
          <div className="px-4 py-3 bg-white border-b border-gray-200">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Order Type</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TAGS.map(t => (
                <button
                  key={t}
                  onClick={() => setOrderTag(t)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                    orderTag === t
                      ? (TAG_COLORS[t] ?? 'bg-gray-100') + ' border-current ring-1 ring-current ring-offset-1'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Products */}
          <div className="flex-1 bg-white">
            <div className="px-4 pt-3 pb-2 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Items</p>
              <ProductSearch customerTags={customer?.tags ?? []} onAdd={addItem} />
            </div>

            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-2 font-medium">#</th>
                      <th className="text-left px-2 py-2 font-medium">Product</th>
                      <th className="text-center px-2 py-2 font-medium w-20">Qty</th>
                      <th className="text-right px-2 py-2 font-medium w-28">Rate</th>
                      <th className="text-center px-2 py-2 font-medium w-20">GST%</th>
                      <th className="text-right px-2 py-2 font-medium w-28">Amount</th>
                      <th className="w-8 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((item, idx) => (
                      <tr key={item.productId} className="group hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{idx + 1}</td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium text-gray-800 text-sm">{item.name}</div>
                          <div className="text-[11px] text-gray-400 font-mono">{item.sku}{item.hsnCode && ` · ${item.hsnCode}`}</div>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={e => updateItem(idx, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-14 text-center border border-gray-200 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={item.unitPrice}
                            onChange={e => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <select
                            value={item.gstRate}
                            onChange={e => updateItem(idx, { gstRate: Number(e.target.value) })}
                            className="border border-gray-200 rounded px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30"
                          >
                            {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-gray-800 tabular-nums">{fmt(item.total)}</td>
                        <td className="px-2 py-2.5 pl-1">
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-gray-300 text-sm">
                Search for a product above to add items
              </div>
            )}
          </div>

          {/* Mobile save buttons */}
          <div className="flex gap-3 p-4 bg-white border-t border-gray-200 lg:hidden">
            <Button
              variant="outline"
              className="flex-1 border-[#2d7a4f] text-[#2d7a4f]"
              onClick={() => saveMutation.mutate(false)}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" /> Save
            </Button>
            <Button
              className="flex-1 bg-[#2d7a4f] hover:bg-[#245f3e] text-white"
              onClick={() => saveMutation.mutate(true)}
              disabled={saveMutation.isPending}
            >
              <Printer className="h-4 w-4 mr-2" /> Save & Print
            </Button>
          </div>
        </div>

        {/* ── Right: Sticky summary panel ── */}
        <div className="hidden lg:flex flex-col bg-white lg:sticky lg:top-12 lg:self-start lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto">

          {/* Summary header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Bill Summary</p>
            <p className="text-xs text-gray-400 mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Totals */}
          <div className="px-4 py-3 border-b border-gray-100 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Taxable Amount</span>
              <span className="tabular-nums">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>GST</span>
              <span className="tabular-nums">{fmt(totalGst)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200">
              <span>Grand Total</span>
              <span className="tabular-nums">{fmt(grandTotal)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="px-4 py-3 border-b border-gray-100 space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Amount Paid</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  step="0.5"
                  value={amountPaid || ''}
                  onChange={e => setAmountPaid(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full pl-7 pr-4 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Balance Due</span>
              <span className={cn('text-lg font-bold tabular-nums', amountDue > 0 ? 'text-red-600' : 'text-[#2d7a4f]')}>{fmt(amountDue)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Status:</span>
              <span className={cn(
                'text-[11px] px-2 py-0.5 rounded font-semibold',
                paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              )}>
                {paymentStatus === 'paid' ? 'PAID' : paymentStatus === 'partial' ? 'PARTIAL' : 'UNPAID'}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="px-4 py-3 border-b border-gray-100">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional note for this bill…"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 resize-none"
            />
          </div>

          {/* Save buttons */}
          <div className="px-4 py-3 space-y-2 mt-auto">
            <Button
              className="w-full bg-[#2d7a4f] hover:bg-[#245f3e] text-white text-sm h-9"
              onClick={() => saveMutation.mutate(true)}
              disabled={saveMutation.isPending}
            >
              <Printer className="h-4 w-4 mr-2" />
              Save & Print
              <kbd className="ml-auto text-[10px] bg-[#1e5436] px-1.5 py-0.5 rounded font-mono opacity-70">F9</kbd>
            </Button>
            <Button
              variant="outline"
              className="w-full border-[#2d7a4f] text-[#2d7a4f] text-sm h-9 hover:bg-[#f0faf5]"
              onClick={() => saveMutation.mutate(false)}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Only
              <kbd className="ml-auto text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-400">F8</kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
