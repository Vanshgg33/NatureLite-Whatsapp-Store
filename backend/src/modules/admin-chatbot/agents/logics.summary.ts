import { CalcResult, Formulas, SAMPLE_BILL, calcBill } from '../../billing/logics/formula-engine';

export const inr = (paise: number) => `${paise < 0 ? '-' : ''}₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const istDate = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** The sample bill worked out with the given formulas, as display text. */
export function sampleSummary(f: Formulas): Record<string, string> {
  try {
    const r: CalcResult = calcBill(SAMPLE_BILL.items, SAMPLE_BILL.opts, f);
    return { taxableValue: inr(r.taxableTotal), cgst: inr(r.cgstTotal), sgst: inr(r.sgstTotal), roundOff: inr(r.roundOffPaise), billTotal: inr(r.grandTotalPaise) };
  } catch (e: any) {
    return { error: e.message as string };
  }
}
