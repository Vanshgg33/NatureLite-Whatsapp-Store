'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Search, Plus, X, Printer, Save, User, Package, ChevronDown, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/layout/header';

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
  total: number;       // unitPrice * qty
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

const STATUS_STYLE = {
  paid: 'bg-green-100 text-green-700 border-green-200',
  partial: 'bg-amber-100 text-amber-700 border-amber-200',
  unpaid: 'bg-red-100 text-red-700 border-red-200',
};

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
          placeholder="Search customer by name or phone…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f] bg-white"
          autoComplete="off"
        />
      </div>

      {open && (q.length > 0 || showCreate) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
          {results.map(c => (
            <button
              key={c._id}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 text-left transition-colors"
              onClick={() => { onSelect(c); setQ(''); setOpen(false); }}
            >
              <div className="h-8 w-8 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-sm shrink-0">
                {c.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{c.name}</div>
                <div className="text-xs text-gray-400">{c.phone}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {c.tags?.slice(0, 2).map((t: string) => (
                  <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full ${TAG_COLORS[t] ?? 'bg-gray-100 text-gray-600'}`}>{t}</span>
                ))}
              </div>
            </button>
          ))}

          {!showCreate ? (
            <button
              className="w-full flex items-center gap-2 px-4 py-3 text-[#2d7a4f] font-medium text-sm hover:bg-green-50 border-t border-gray-50 transition-colors"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" /> Add New Customer
            </button>
          ) : (
            <div className="p-4 border-t border-gray-100 space-y-3">
              <p className="text-xs font-semibold text-gray-600">Quick Create Customer</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Name *" value={newName} onChange={e => setNewName(e.target.value)} className="text-sm" />
                <Input placeholder="Phone *" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="text-sm" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TAGS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-all ${
                      newTags.includes(t) ? TAG_COLORS[t] + ' border-current' : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={creating || !newName || !newPhone} className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white text-xs">
                  {creating ? 'Creating…' : 'Create & Select'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="text-xs">Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Product search combobox ──────────────────────────────────────────────

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
        <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => q && setOpen(true)}
          placeholder="Search by product name or SKU…"
          className="w-full pl-9 pr-4 py-2.5 border border-dashed border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f] bg-white/50 hover:bg-white transition-colors"
          autoComplete="off"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
          {results.map(p => {
            const price = resolvePrice(p.price, customerTags, p.tagPrices ?? []);
            const isTagPrice = price !== p.price;
            return (
              <button
                key={p._id}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 text-left transition-colors"
                onClick={() => add(p)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.sku}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-semibold ${isTagPrice ? 'text-[#2d7a4f]' : 'text-gray-700'}`}>{fmt(price)}</div>
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

  // Derived totals
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
    // auto-set order tag from highest priority customer tag
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

  // Keyboard shortcuts
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

  const billingAddr = customer?.addresses?.[selectedAddrIdx];

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header
        title="New Bill"
        description="F2: Customer  F8: Save  F9: Print  Esc: Cancel"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/billing/customers')} className="text-xs">
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMutation.mutate(false)}
              disabled={saveMutation.isPending}
              className="text-xs border-[#2d7a4f] text-[#2d7a4f]"
            >
              <Save className="h-3.5 w-3.5 mr-1" /> Save (F8)
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(true)}
              disabled={saveMutation.isPending}
              className="text-xs bg-[#2d7a4f] hover:bg-[#245f3e] text-white"
            >
              <Printer className="h-3.5 w-3.5 mr-1" /> Save & Print (F9)
            </Button>
          </div>
        }
      />

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        {/* Customer section */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Customer</h2>

          {!customer ? (
            <CustomerSearch onSelect={selectCustomer} />
          ) : (
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold shrink-0">
                {customer.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{customer.name}</span>
                  {customer.tags?.map((t: string) => (
                    <span key={t} className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[t] ?? 'bg-gray-100'}`}>{t}</span>
                  ))}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{customer.phone}</div>
                {customer.gstNo && <div className="text-xs text-gray-400 mt-0.5">GSTIN: {customer.gstNo}</div>}

                {/* Address */}
                {customer.addresses?.length > 0 && (
                  <div className="mt-2">
                    {customer.addresses.length === 1 ? (
                      <span className="text-sm text-gray-600">{customer.addresses[0].line}</span>
                    ) : (
                      <select
                        value={selectedAddrIdx}
                        onChange={e => setSelectedAddrIdx(Number(e.target.value))}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
                      >
                        {customer.addresses.map((a: any, i: number) => (
                          <option key={i} value={i}>{a.label}: {a.line}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setCustomer(null)} className="text-gray-400 hover:text-red-500 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Order tag */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Order Tag</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_TAGS.map(t => (
              <button
                key={t}
                onClick={() => setOrderTag(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  orderTag === t
                    ? (TAG_COLORS[t] ?? 'bg-gray-100') + ' ring-2 ring-offset-1 ring-current'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Products */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Products</h2>

          <ProductSearch customerTags={customer?.tags ?? []} onAdd={addItem} />

          {items.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left pb-2 font-medium">Product</th>
                    <th className="text-center pb-2 font-medium w-20">Qty</th>
                    <th className="text-right pb-2 font-medium w-28">Price</th>
                    <th className="text-center pb-2 font-medium w-20">GST%</th>
                    <th className="text-right pb-2 font-medium w-28">Total</th>
                    <th className="w-8 pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item, idx) => (
                    <tr key={item.productId} className="group">
                      <td className="py-2.5">
                        <div className="font-medium text-gray-800">{item.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{item.sku}{item.hsnCode && ` · HSN ${item.hsnCode}`}</div>
                      </td>
                      <td className="py-2.5 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={e => updateItem(idx, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
                        />
                      </td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={item.unitPrice}
                          onChange={e => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="w-24 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
                        />
                      </td>
                      <td className="py-2.5 text-center">
                        <select
                          value={item.gstRate}
                          onChange={e => updateItem(idx, { gstRate: Number(e.target.value) })}
                          className="border border-gray-200 rounded-lg px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
                        >
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-gray-800">{fmt(item.total)}</td>
                      <td className="py-2.5 pl-2">
                        <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Totals + Payment */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Totals */}
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal (taxable)</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>GST</span>
                <span>{fmt(totalGst)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t pt-2 mt-2">
                <span>Grand Total</span>
                <span>{fmt(grandTotal)}</span>
              </div>
            </div>

            {/* Payment */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Amount Paid</label>
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
                    className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Amount Due</span>
                <span className={`text-lg font-bold ${amountDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(amountDue)}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Status:</span>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_STYLE[paymentStatus]}`}>
                  {paymentStatus === 'paid' ? 'Paid' : paymentStatus === 'partial' ? 'Partially Paid' : 'Unpaid'}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mt-4">
            <label className="text-xs font-medium text-gray-500 block mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes for this bill…"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]"
            />
          </div>
        </div>

        {/* Save buttons (bottom, mobile-friendly) */}
        <div className="flex gap-3 pb-8">
          <Button
            variant="outline"
            className="flex-1 border-[#2d7a4f] text-[#2d7a4f]"
            onClick={() => saveMutation.mutate(false)}
            disabled={saveMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" /> Save Bill
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
    </div>
  );
}
