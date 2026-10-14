'use client';
import { motion } from 'framer-motion';
import { Printer, Save, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/motion/billing-motion';
import { amountInWords } from '@/lib/billing/utils/amountInWords';
import { formatINR } from '@/lib/billing/utils/formatINR';
import type { LineItem, BillTotals } from '../types';

export interface SummaryPanelProps {
  totals: BillTotals;
  isInterState: boolean;
  lines: LineItem[];
  onSave: () => void;
  onSaveAndPrint: () => void;
  onSaveAndNew: () => void;
  isSaving: boolean;
}

export function SummaryPanel({ totals, isInterState, lines, onSave, onSaveAndPrint, onSaveAndNew, isSaving }: SummaryPanelProps) {
  // Group tax by gstRate
  const gstByRate: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {};
  for (const l of lines) {
    if (l.gstRate === 0) continue;
    if (!gstByRate[l.gstRate]) gstByRate[l.gstRate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    gstByRate[l.gstRate].taxable += l.taxable;
    gstByRate[l.gstRate].cgst += l.cgst;
    gstByRate[l.gstRate].sgst += l.sgst;
    gstByRate[l.gstRate].igst += l.igst;
  }
  const gstRates = Object.keys(gstByRate).map(Number).sort((a, b) => a - b);

  const totalTaxPaise = totals.cgstTotalPaise + totals.sgstTotalPaise + totals.igstTotalPaise;

  return (
    <div className="flex flex-col gap-0 bg-white lg:w-[300px] lg:shrink-0 border-l border-gray-100">
      <div className="p-4 flex-1 space-y-3 overflow-y-auto">
        {/* Main totals */}
        <div className="space-y-2 text-sm">
          <TotalRow label="Taxable" value={totals.taxablePaise} />
          {totals.billDiscAmtPaise > 0 && (
            <TotalRow label="Bill Discount" value={-totals.billDiscAmtPaise} className="text-red-600" />
          )}
          {totals.chargesTotalPaise > 0 && (
            <TotalRow label="Charges" value={totals.chargesTotalPaise} />
          )}

          {/* GST split */}
          {gstRates.length > 0 && (
            <div className="border border-gray-100 rounded p-2 space-y-1">
              {gstRates.map(rate => {
                const g = gstByRate[rate];
                return (
                  <div key={rate} className="text-xs">
                    <div className="flex justify-between text-gray-400">
                      <span>GST {rate}% taxable</span>
                      <span className="tabular-nums">{formatINR(g.taxable)}</span>
                    </div>
                    {isInterState ? (
                      <div className="flex justify-between pl-2">
                        <span className="text-gray-500">IGST {rate}%</span>
                        <CountUp value={g.igst} className="text-gray-700" />
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between pl-2">
                          <span className="text-gray-500">CGST {rate / 2}%</span>
                          <CountUp value={g.cgst} className="text-gray-700" />
                        </div>
                        <div className="flex justify-between pl-2">
                          <span className="text-gray-500">SGST {rate / 2}%</span>
                          <CountUp value={g.sgst} className="text-gray-700" />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <div className="flex justify-between font-medium text-xs border-t border-gray-100 pt-1 mt-1">
                <span>Total Tax</span>
                <CountUp value={totalTaxPaise} className="text-gray-800" />
              </div>
            </div>
          )}

          {totals.roundOffPaise !== 0 && (
            <TotalRow label="Round Off"
              value={totals.roundOffPaise}
              className={totals.roundOffPaise < 0 ? 'text-red-500' : 'text-gray-500'}
            />
          )}

          <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-base">
            <span>Grand Total</span>
            <CountUp value={totals.grandTotalPaise} className="text-[#2d7a4f]" />
          </div>

          {totals.amountDuePaise < totals.grandTotalPaise && (
            <TotalRow label="Balance Due" value={totals.amountDuePaise} className="text-orange-600 font-medium" />
          )}
        </div>

        {/* Amount in words */}
        {totals.grandTotalPaise > 0 && (
          <p className="text-[11px] text-gray-400 italic leading-relaxed border-t border-gray-100 pt-2">
            {amountInWords(totals.grandTotalPaise)}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-4 border-t border-gray-100 space-y-2">
        <Button
          className="w-full bg-[#2d7a4f] hover:bg-[#245f3e] text-white h-9 relative overflow-hidden"
          onClick={onSaveAndPrint}
          disabled={isSaving}
        >
          {isSaving ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span>
          ) : (
            <span className="flex items-center gap-2">
              <Printer className="h-4 w-4" /> Save & Print
              <kbd className="ml-auto text-[10px] bg-[#1e5436] px-1.5 py-0.5 rounded font-mono opacity-70">F9</kbd>
            </span>
          )}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-8 text-xs" onClick={onSave} disabled={isSaving}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save
            <kbd className="ml-auto text-[10px] bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-400">F8</kbd>
          </Button>
          <Button variant="outline" className="flex-1 h-8 text-xs" onClick={onSaveAndNew} disabled={isSaving}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Save & New
          </Button>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={`flex justify-between text-sm ${className ?? 'text-gray-600'}`}>
      <span>{label}</span>
      <CountUp value={value} />
    </div>
  );
}
