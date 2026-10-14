'use client';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BillCharge, PaymentMode } from '../types';

const PAYMENT_MODES: { key: PaymentMode; label: string }[] = [
  { key: 'credit', label: 'Credit' },
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'bank', label: 'Bank' },
  { key: 'cheque', label: 'Cheque' },
];

export interface BillFooterProps {
  billDiscountPct: number;
  onBillDiscountPctChange: (v: number) => void;
  charges: BillCharge[];
  onChargesChange: (c: BillCharge[]) => void;
  roundOffEnabled: boolean;
  onRoundOffEnabledChange: (v: boolean) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (v: PaymentMode) => void;
  amountPaidRupees: number;
  onAmountPaidChange: (v: number) => void;
  terms: string;
  onTermsChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
}

export function BillFooter({
  billDiscountPct, onBillDiscountPctChange,
  charges, onChargesChange,
  roundOffEnabled, onRoundOffEnabledChange,
  paymentMode, onPaymentModeChange,
  amountPaidRupees, onAmountPaidChange,
  terms, onTermsChange,
  notes, onNotesChange,
}: BillFooterProps) {
  return (
    <div className="space-y-4">
      {/* Bill-level discount */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 w-36 shrink-0">Bill Discount</label>
        <div className="flex items-center gap-1">
          <input type="number" min="0" max="100" step="0.5"
            value={billDiscountPct || ''}
            onChange={e => onBillDiscountPctChange(Math.min(100, parseFloat(e.target.value) || 0))}
            className="w-16 text-right border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
            placeholder="0"
          />
          <span className="text-xs text-gray-400">%</span>
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

      {/* Payment mode */}
      <div className="space-y-2">
        <label className="text-xs text-gray-500">Payment Mode</label>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_MODES.map(m => (
            <button key={m.key} type="button"
              onClick={() => onPaymentModeChange(m.key)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-all',
                paymentMode === m.key
                  ? 'bg-[#2d7a4f] text-white border-[#2d7a4f]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#2d7a4f]/50'
              )}>
              {m.label}
            </button>
          ))}
        </div>
        {paymentMode !== 'credit' && (
          <div className="flex items-center gap-2 mt-1">
            <label className="text-xs text-gray-500 w-36 shrink-0">Amount Received (₹)</label>
            <input type="number" min="0" step="1" value={amountPaidRupees || ''}
              onChange={e => onAmountPaidChange(parseFloat(e.target.value) || 0)}
              className="w-28 text-right border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
              placeholder="0"
            />
          </div>
        )}
      </div>

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
