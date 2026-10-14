'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Plus, X, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/utils';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { GST_STATE_CODES } from '@/lib/billing/constants/stateCodes';
import type { GodownDto } from '../types';

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
            <button key={c._id}
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

export interface BillHeaderProps {
  paymentTerm: 'cash' | 'credit';
  onPaymentTermChange: (v: 'cash' | 'credit') => void;
  invoiceNo: string;
  onInvoiceNoChange: (v: string) => void;
  invoiceDate: string;
  onInvoiceDateChange: (v: string) => void;
  invoiceTime: string;
  onInvoiceTimeChange: (v: string) => void;
  godownId: string;
  onGodownChange: (id: string) => void;
  godowns: GodownDto[];
  customer: any | null;
  onCustomerSelect: (c: any) => void;
  onCustomerClear: () => void;
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
}

export function BillHeader({
  paymentTerm, onPaymentTermChange,
  invoiceNo, onInvoiceNoChange,
  invoiceDate, onInvoiceDateChange,
  invoiceTime, onInvoiceTimeChange,
  godownId, onGodownChange, godowns,
  customer, onCustomerSelect, onCustomerClear,
  billingAddress, onBillingAddressChange,
  shippingAddress, onShippingAddressChange,
  sameAsBilling, onSameAsBillingChange,
  placeOfSupply, onPlaceOfSupplyChange, isInterState,
  orderTag, onOrderTagChange,
}: BillHeaderProps) {
  return (
    <div className="space-y-3">
      {/* Row 1: Cash/Credit toggle + Invoice meta + Godown */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs shrink-0">
          {(['credit', 'cash'] as const).map(t => (
            <button key={t} onClick={() => onPaymentTermChange(t)}
              className={cn('px-3 py-1.5 font-medium capitalize transition-colors',
                paymentTerm === t ? 'bg-[#2d7a4f] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              )}>
              {t === 'credit' ? 'Credit' : 'Cash Sale'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold shrink-0">Invoice No</label>
          <input value={invoiceNo} onChange={e => onInvoiceNoChange(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs font-mono w-36 focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
            placeholder="Auto"
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
        <div className="flex items-center gap-3 p-3 bg-[#f7faf8] rounded border border-[#2d7a4f]/20">
          <div className="h-9 w-9 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold shrink-0">
            {customer.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-800 truncate">{customer.name}</div>
            <div className="text-xs text-gray-400 font-mono">{customer.phone}</div>
            {customer.gstNo && <div className="text-xs text-gray-500 font-mono">{customer.gstNo}</div>}
          </div>
          <div className="flex gap-1 shrink-0">
            {customer.tags?.slice(0, 3).map((t: string) => (
              <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded', TAG_COLORS[t] ?? 'bg-gray-100 text-gray-600')}>{t}</span>
            ))}
          </div>
          <button onClick={onCustomerClear} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <CustomerSearch onSelect={onCustomerSelect} />
      )}

      {/* Row 4: Billing/Shipping address */}
      {customer && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold block mb-1">Billing Address</label>
            <select value={billingAddress} onChange={e => onBillingAddressChange(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
              <option value="">— Pick address —</option>
              {customer.addresses?.map((a: any, i: number) => (
                <option key={i} value={a.line}>{a.label}: {a.line}</option>
              ))}
            </select>
          </div>
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
        {ALL_TAGS.map(tag => (
          <button key={tag} type="button"
            onClick={() => onOrderTagChange(orderTag === tag ? '' : tag)}
            className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
              orderTag === tag
                ? (TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-700') + ' border-current shadow-sm'
                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
            )}>
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
