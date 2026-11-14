'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/utils';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/billing/utils/formatINR';
import { type SalesChannel } from '@/lib/billing/channel';
import type { LineItem } from '../types';

/** Exactly two tiers exist. A missing tier price is an error, never a silent fallback. */
const tierPriceOf = (tagPrices: Array<{ tag: string; price: number }>, tier: string) => tagPrices.find(t => t.tag === tier)?.price;

const GST_RATES = [0, 5, 12, 18, 28];
const WEIGHT_UNITS = ['KGS', 'LTR'];

const roundQty = (n: number) => Math.round(n * 1000) / 1000;

/** Text-backed qty box: typing never snaps back to 1, +/- read the current text (no stale state). */
function QtyInput({ value, unit, onChange }: { value: number; unit: string; onChange: (n: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  const step = WEIGHT_UNITS.includes(unit) ? 0.5 : 1;

  // follow outside changes (e.g. same SKU added again) but not our own typing
  useEffect(() => {
    if (roundQty(parseFloat(txt) || 0) !== value) setTxt(String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const type = (raw: string) => {
    let s = raw.replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 3);
    s = s.replace(/^0+(?=\d)/, '');
    setTxt(s);
    const n = parseFloat(s);
    if (n > 0) onChange(roundQty(n));
  };
  const bump = (d: number) => {
    const next = Math.max(step, roundQty((parseFloat(txt) || 0) + d));
    setTxt(String(next));
    onChange(next);
  };
  const btn = 'w-5 h-6 border border-gray-200 rounded text-gray-500 hover:bg-gray-100 leading-none';

  return (
    <div className="flex items-center gap-0.5">
      <button type="button" className={btn} onClick={() => bump(-step)}>−</button>
      <input inputMode="decimal" value={txt} onChange={e => type(e.target.value)}
        onBlur={() => setTxt(String(value))}
        className="w-12 text-center border border-gray-200 rounded px-1 py-1 text-sm focus:ring-1 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
      />
      <button type="button" className={btn} onClick={() => bump(step)}>+</button>
    </div>
  );
}

function ProductSearch({ channel, tier, stockLocation, onAdd }: { channel: SalesChannel | ''; tier: string; stockLocation: 'godown' | 'store'; onAdd: (item: Omit<LineItem, 'discountAmt' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'>) => void }) {
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
    const price = tierPriceOf(p.tagPrices ?? [], tier);
    if (price === undefined) return;
    onAdd({
      _key: crypto.randomUUID(),
      productId: p._id.toString(),
      variantSku: p.variantSku,
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
      tierPrices: Object.fromEntries((p.tagPrices ?? []).map((t: any) => [t.tag, t.price])),
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
          placeholder={channel ? 'Search by product name or SKU to add item…' : 'Select a sales channel first'}
          disabled={!channel}
          className="w-full pl-9 pr-4 py-2 border border-dashed border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7a4f]/30 bg-gray-50 hover:bg-white transition-colors focus:bg-white focus:border-solid"
          autoComplete="off"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {results.map(p => {
            const price = tierPriceOf(p.tagPrices ?? [], tier);
            return (
              <button key={p.key ?? p._id} disabled={price === undefined} className="w-full flex disabled:opacity-60 disabled:cursor-not-allowed items-center gap-3 px-4 py-2.5 hover:bg-[#f7faf8] text-left transition-colors"
                onClick={() => add(p)}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.sku} · HSN: {p.hsnCode || '—'} · {p.gstRate ?? 5}% GST</div>
                  {p.stock && (
                    <div className={cn('text-[11px]', (p.stock[stockLocation] ?? 0) > 0 ? 'text-gray-500' : 'text-red-500')}>
                      Store {p.stock.store} · Godown {p.stock.godown}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {price === undefined
                    ? <div className="text-xs font-medium text-red-500">No {tier} rate set</div>
                    : <div className="text-sm font-semibold text-[#2d7a4f]">₹{price}</div>}
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
  channel: SalesChannel | '';
  tier: string;
  stockLocation: 'godown' | 'store';
  onUpdate: (idx: number, patch: Partial<Pick<LineItem, 'mrp' | 'qty' | 'unit' | 'rate' | 'priceInclTax' | 'discountPct' | 'gstRate' | 'hsnCode' | 'manualRate' | 'missingTier'>>) => void;
  onRemove: (idx: number) => void;
  onAdd: (item: Omit<LineItem, 'discountAmt' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'>) => void;
  globalPriceInclTax: boolean;
  onGlobalInclTaxToggle: () => void;
}

export function ItemGrid({
  lines, rawItems, isInterState, channel, tier, stockLocation,
  onUpdate, onRemove, onAdd,
  globalPriceInclTax, onGlobalInclTaxToggle,
}: ItemGridProps) {
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalDiscAmt = lines.reduce((s, l) => s + l.discountAmt, 0);
  const totalCgst = lines.reduce((s, l) => s + l.cgst, 0);
  const totalSgst = lines.reduce((s, l) => s + l.sgst, 0);
  const totalIgst = lines.reduce((s, l) => s + l.igst, 0);
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
              {isInterState
                ? <th className="px-2 py-2 text-right w-24">IGST</th>
                : <>
                    <th className="px-2 py-2 text-right w-24">CGST</th>
                    <th className="px-2 py-2 text-right w-24">SGST</th>
                  </>}
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
                    {line.missingTier && <div className="text-[11px] text-red-500">No {line.missingTier} rate set for this product</div>}
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
                    <QtyInput value={line.qty} unit={line.unit} onChange={qty => onUpdate(idx, { qty })} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" min="0" step="0.5" value={line.rate}
                      onChange={e => onUpdate(idx, { rate: parseFloat(e.target.value) || 0, manualRate: true, missingTier: undefined })}
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
                  {isInterState
                    ? <td className="px-2 py-2 text-right text-gray-600 tabular-nums">{formatINR(line.igst)}</td>
                    : <>
                        <td className="px-2 py-2 text-right text-gray-600 tabular-nums">{formatINR(line.cgst)}</td>
                        <td className="px-2 py-2 text-right text-gray-600 tabular-nums">{formatINR(line.sgst)}</td>
                      </>}
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
                <td colSpan={2} />
                <td className="px-2 py-2 text-center text-gray-400 tabular-nums text-[11px]">
                  Disc: {formatINR(totalDiscAmt)}
                </td>
                {isInterState
                  ? <td className="px-2 py-2 text-right tabular-nums">{formatINR(totalIgst)}</td>
                  : <>
                      <td className="px-2 py-2 text-right tabular-nums">{formatINR(totalCgst)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatINR(totalSgst)}</td>
                    </>}
                <td className="px-2 py-2 text-right tabular-nums">{formatINR(totalAmt)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Product search row */}
      <div className="p-3 border-t border-gray-100">
        <ProductSearch channel={channel} tier={tier} stockLocation={stockLocation} onAdd={onAdd} />
      </div>
    </div>
  );
}
