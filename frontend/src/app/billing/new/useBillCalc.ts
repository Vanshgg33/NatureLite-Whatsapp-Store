'use client';
import { useMemo } from 'react';
import { calcBill, DEFAULT_FORMULAS, type Formulas } from '@/lib/billing/formula-engine';
import type { LineItem, BillCharge, BillTotals } from './types';

/**
 * Live bill preview. The maths comes from the shared formula engine (formulas are edited on the Logics page);
 * the server recomputes on save and is the final authority.
 */
export function billCalcPure(
  items: LineItem[],
  billDiscountValue: number,
  charges: BillCharge[],
  roundOffEnabled: boolean,
  isInterState: boolean,
  amountPaidRupees: number,
  discountMode: 'percent' | 'amount' = 'percent',
  formulas: Formulas = DEFAULT_FORMULAS,
): { lines: LineItem[]; totals: BillTotals } {
  const chargesTotalPaise = charges.reduce((s, c) => s + Math.round(c.amtRupees * 100), 0);
  const opts = { discountValue: billDiscountValue, discountMode, roundOff: roundOffEnabled, isInterState, chargesTotalPaise };
  const n = (x: number) => (Number.isFinite(x) ? x : 0); // half-typed inputs must never crash the page
  const input = items.map(i => ({ rate: n(i.rate), qty: n(i.qty), discountPct: n(i.discountPct), gstRate: n(i.gstRate), priceInclTax: i.priceInclTax }));
  const safeOpts = { ...opts, discountValue: n(opts.discountValue), chargesTotalPaise: n(opts.chargesTotalPaise) };
  let r;
  try { r = calcBill(input, safeOpts, formulas); } catch { r = calcBill(input, safeOpts, DEFAULT_FORMULAS); } // broken custom formula: show the standard preview, the server will explain

  const amountDuePaise = Math.max(0, r.grandTotalPaise - Math.round(amountPaidRupees * 100));
  return {
    lines: items.map((item, i) => {
      const l = r.lines[i];
      return { ...item, discountAmt: l.discountAmt, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, total: l.total };
    }),
    totals: {
      taxablePaise: r.taxableTotal,
      billDiscAmtPaise: r.billDiscAmtPaise,
      chargesTotalPaise,
      cgstTotalPaise: r.cgstTotal,
      sgstTotalPaise: r.sgstTotal,
      igstTotalPaise: r.igstTotal,
      grandBeforePaise: r.grandBeforePaise,
      roundOffPaise: r.roundOffPaise,
      grandTotalPaise: r.grandTotalPaise,
      amountDuePaise,
    },
  };
}

export function useBillCalc(
  items: LineItem[],
  billDiscountValue: number,
  charges: BillCharge[],
  roundOffEnabled: boolean,
  isInterState: boolean,
  amountPaidRupees: number,
  discountMode: 'percent' | 'amount' = 'percent',
  formulas: Formulas = DEFAULT_FORMULAS,
): { lines: LineItem[]; totals: BillTotals } {
  return useMemo(
    () => billCalcPure(items, billDiscountValue, charges, roundOffEnabled, isInterState, amountPaidRupees, discountMode, formulas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, billDiscountValue, charges, roundOffEnabled, isInterState, amountPaidRupees, discountMode, formulas],
  );
}
