'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/utils';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/billing/utils/formatINR';
import type { LineItem } from '../types';

const TAG_PRIORITY = ['Wholesale', 'B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Retail'];
const UNITS = ['KGS', 'LTR', 'NOS', 'PCS', 'BOX', 'PAC', 'BTL', 'GMS', 'MLT'];
const GST_RATES = [0, 5, 12, 18, 28];

function resolvePrice(basePrice: number, tags: string[], tagPrices: Array<{ tag: string; price: number }>) {
  for (const tag of TAG_PRIORITY) {
    if (!tags.includes(tag)) continue;
    const tp = tagPrices.find(p => p.tag === tag);
    if (tp) return tp.price;
  }
  return basePrice;
}

function ProductSearch({ customerTags, onAdd }: { customerTags: string[]; onAdd: (item: Omit<LineItem, 'discountAmt' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'>) => void }) {
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
    onAdd({
      _key: crypto.randomUUID(),
      productId: p._id.toString(),
      name: p.name,
      sku: p.sku,
      hsnCode: p.hsnCode ?? '',
      mrp: p.mrp ?? 0,
      qty: 1,
      unit: p.unit ?? p.uqc ?? 'NOS',
      rate: price,
      priceInclTax: true,
      discountPct: 0,
      gstRate: p.gstRate ?? 5,
    });
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
          placeholder="Search by product name or SKU to add item…"
          className="w-full pl-9 pr-4 py-2 border border-dashed border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 bg-gray-50 hover:bg-white transition-colors focus:bg-white focus:border-solid"
          autoComplete="off"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {results.map(p => {
            const price = resolvePrice(p.price, customerTags, p.tagPrices ?? []);
            const isTagPrice = price !== p.price;
            return (
              <button key={p._id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f7faf8] text-left transition-colors"
                onClick={() => add(p)}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.sku} · HSN: {p.hsnCode || '—'} · {p.gstRate ?? 5}% GST</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn('text-sm font-semibold', isTagPrice ? 'text-[#2d7a4f]' : 'text-gray-700')}>₹{price}</div>
                  {isTagPrice && <div className="text-[10px] text-gray-400 line-through">₹{p.price}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface ItemGridProps {
  lines: LineItem[];
  rawItems: LineItem[];
  isInterState: boolean;
  customerTags: string[];
  onUpdate: (idx: number, patch: Partial<Pick<LineItem, 'mrp' | 'qty' | 'unit' | 'rate' | 'priceInclTax' | 'discountPct' | 'gstRate' | 'hsnCode'>>) => void;
  onRemove: (idx: number) => void;
  onAdd: (item: Omit<LineItem, 'discountAmt' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'>) => void;
  globalPriceInclTax: boolean;
  onGlobalInclTaxToggle: () => void;
}

export function ItemGrid({
  lines, rawItems, isInterState, customerTags,
  onUpdate, onRemove, onAdd,
  globalPriceInclTax, onGlobalInclTaxToggle,
}: ItemGridProps) {
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalDiscAmt = lines.reduce((s, l) => s + l.discountAmt, 0);
  const totalTaxAmt = lines.reduce((s, l) => s + l.cgst + l.sgst + l.igst, 0);
  const totalAmt = lines.reduce((s, l) => s + l.total, 0);

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-medium">
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-2 py-2 text-left min-w-[160px]">Item</th>
              <th className="px-2 py-2 text-left w-24">HSN</th>
              <th className="px-2 py-2 text-right w-20">MRP</th>
              <th className="px-2 py-2 text-center w-16">Qty</th>
              <th className="px-2 py-2 text-left w-20">Unit</th>
              <th className="px-2 py-2 text-right w-28">
                <button onClick={onGlobalInclTaxToggle}
                  className="inline-flex items-center gap-1 text-[10px] hover:text-[#2d7a4f] transition-colors">
                  Price/Unit
                  <span className={cn('px-1 rounded font-normal',
                    globalPriceInclTax ? 'bg-[#2d7a4f]/10 text-[#2d7a4f]' : 'bg-gray-200 text-gray-400'
                  )}>
                    {globalPriceInclTax ? 'incl.' : 'excl.'} tax
                  </span>
                </button>
              </th>
              <th className="px-2 py-2 text-center w-20">Tax%</th>
              <th className="px-2 py-2 text-center w-16">Disc%</th>
              <th className="px-2 py-2 text-right w-24">Tax Amt</th>
              <th className="px-2 py-2 text-right w-24">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {lines.map((line, idx) => (
                <motion.tr key={line._key}
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}
                  className="group border-b border-gray-100 hover:bg-[#f7faf8]">
                  <td className="px-3 py-2 text-gray-400 tabular-nums">{idx + 1}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-gray-800">{line.name}</div>
                    <div className="text-[11px] text-gray-400 font-mono">{line.sku}</div>
                  </td>
                  <td className="px-2 py-2">
                    <input value={line.hsnCode} onChange={e => onUpdate(idx, { hsnCode: e.target.value })}
                      className="w-20 border border-gray-200 rounded px-1.5 py-1 text-xs font-mono focus:ring-1 focus:ring-[#2d7a4f]/30 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2 text-right text-gray-400 tabular-nums">
                    {line.mrp > 0 ? `₹${line.mrp}` : '—'}
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0.001" step="0.001" value={line.qty}
                      onChange={e => onUpdate(idx, { qty: parseFloat(e.target.value) || 1 })}
                      className="w-14 text-center border border-gray-200 rounded px-1.5 py-1 text-sm focus:ring-1 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select value={line.unit} onChange={e => onUpdate(idx, { unit: e.target.value })}
                      className="border border-gray-200 rounded px-1 py-1 text-xs focus:ring-1 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.5" value={line.rate}
                      onChange={e => onUpdate(idx, { rate: parseFloat(e.target.value) || 0 })}
                      className="w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-sm focus:ring-1 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select value={line.gstRate} onChange={e => onUpdate(idx, { gstRate: Number(e.target.value) })}
                      className="border border-gray-200 rounded px-1 py-1 text-xs focus:ring-1 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
                      {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" max="100" step="0.5" value={line.discountPct || ''}
                      onChange={e => onUpdate(idx, { discountPct: Math.min(100, parseFloat(e.target.value) || 0) })}
                      className="w-14 text-center border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-2 text-right text-gray-600 tabular-nums">
                    {formatINR(line.cgst + line.sgst + line.igst)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-gray-800 tabular-nums">
                    {formatINR(line.total)}
                  </td>
                  <td className="px-2 py-2">
                    <button onClick={() => onRemove(idx)}
                      className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs text-gray-600">
                <td colSpan={4} className="px-3 py-2">{lines.length} item{lines.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-center tabular-nums">{totalQty.toFixed(3).replace(/\.?0+$/, '')}</td>
                <td colSpan={3} />
                <td className="px-2 py-2 text-center text-gray-400 tabular-nums text-[11px]">
                  Disc: {formatINR(totalDiscAmt)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{formatINR(totalTaxAmt)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatINR(totalAmt)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Product search row */}
      <div className="p-3 border-t border-gray-100">
        <ProductSearch customerTags={customerTags} onAdd={onAdd} />
      </div>
    </div>
  );
}
