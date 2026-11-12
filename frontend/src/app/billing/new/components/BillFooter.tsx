'use client';
import { Plus, X } from 'lucide-react';
import type { BillCharge, PaidSplit } from '../types';

const PAYMENT_MODES: { key: keyof PaidSplit; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
];

export interface BillFooterProps {
  billDiscountPct: number; // the typed value: rupees in 'amount' mode, percent otherwise
  onBillDiscountPctChange: (v: number) => void;
  discountMode: 'percent' | 'amount';
  /** parent converts the typed value so the discount stays the same */
  onDiscountModeChange: (m: 'percent' | 'amount') => void;
  billDiscAmtPaise: number;
  charges: BillCharge[];
  onChargesChange: (c: BillCharge[]) => void;
  roundOffEnabled: boolean;
  onRoundOffEnabledChange: (v: boolean) => void;
  paid: PaidSplit;
  onPaidChange: (v: PaidSplit) => void;
  sendWhatsApp: boolean;
  onSendWhatsAppChange: (v: boolean) => void;
  terms: string;
  onTermsChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
}

export function BillFooter({
  billDiscountPct, onBillDiscountPctChange,
  discountMode, onDiscountModeChange, billDiscAmtPaise,
  charges, onChargesChange,
  roundOffEnabled, onRoundOffEnabledChange,
  paid, onPaidChange,
  sendWhatsApp, onSendWhatsAppChange,
  terms, onTermsChange,
  notes, onNotesChange,
}: BillFooterProps) {
  return (
    <div className="space-y-4">
      {/* Bill-level discount */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 w-36 shrink-0">Bill Discount</label>
        <div className="flex items-center gap-1">
          <input type="number" min="0" step="0.01"
            value={billDiscountPct || ''}
            onChange={e => {
              const v = Math.max(0, parseFloat(e.target.value) || 0);
              onBillDiscountPctChange(discountMode === 'percent' ? Math.min(100, v) : v);
            }}
            className="w-20 text-right border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
            placeholder="0"
          />
          <div className="flex rounded border border-gray-200 overflow-hidden text-xs">
            {(['amount', 'percent'] as const).map(m => (
              <button key={m} type="button" onClick={() => onDiscountModeChange(m)}
                className={discountMode === m ? 'px-2 py-1 bg-[#2d7a4f] text-white' : 'px-2 py-1 text-gray-500 hover:bg-gray-100'}>
                {m === 'amount' ? '₹' : '%'}
              </button>
            ))}
          </div>
          {billDiscAmtPaise > 0 && (
            <span className="text-[11px] text-gray-400 ml-1">= ₹{(billDiscAmtPaise / 100).toFixed(2)} off</span>
          )}
        </div>
      </div>

      {/* Repeatable charges */}
      <div className="space-y-1.5">
        <label className="text-xs text-gray-500">Additional Charges</label>
        {charges.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={c.label}
              onChange={e => { const nc = [...charges]; nc[i] = { ...nc[i], label: e.target.value }; onChargesChange(nc); }}
              placeholder="Shipping / Packing…"
              className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
            />
            <input type="number" min="0" step="0.5" value={c.amtRupees || ''}
              onChange={e => { const nc = [...charges]; nc[i] = { ...nc[i], amtRupees: parseFloat(e.target.value) || 0 }; onChargesChange(nc); }}
              className="w-20 text-right border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
              placeholder="0"
            />
            <button onClick={() => onChargesChange(charges.filter((_, j) => j !== i))}
              className="text-gray-300 hover:text-red-400 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={() => onChargesChange([...charges, { label: '', amtRupees: 0 }])}
          className="flex items-center gap-1 text-xs text-[#2d7a4f] hover:underline mt-1">
          <Plus className="h-3 w-3" /> Add Charge
        </button>
      </div>

      {/* Round-off */}
      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
        <input type="checkbox" checked={roundOffEnabled}
          onChange={e => onRoundOffEnabledChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-[#2d7a4f]"
        />
        Round off to nearest rupee
      </label>

      {/* Payment received: any mix of cash and UPI; whatever is unpaid stays due */}
      <div className="space-y-2">
        <label className="text-xs text-gray-500">Payment Received</label>
        {PAYMENT_MODES.map(m => (
          <div key={m.key} className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-36 shrink-0">{m.label} (₹)</label>
            <input type="number" min="0" step="1" value={paid[m.key] || ''}
              onChange={e => onPaidChange({ ...paid, [m.key]: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-28 text-right border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
              placeholder="0"
            />
          </div>
        ))}
        <p className="text-[11px] text-gray-400">
          Received ₹{(paid.cash + paid.upi).toLocaleString('en-IN')}. Any balance stays due on the bill.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
        <input type="checkbox" checked={sendWhatsApp} onChange={e => onSendWhatsAppChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-[#2d7a4f]" />
        Send bill on WhatsApp
      </label>

      {/* Terms */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Terms & Conditions</label>
        <textarea value={terms} onChange={e => onTermsChange(e.target.value)} rows={2}
          placeholder="Payment due within 30 days…"
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs resize-none focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Internal Notes</label>
        <textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={2}
          placeholder="Notes for internal use…"
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs resize-none focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
        />
      </div>
    </div>
  );
}
