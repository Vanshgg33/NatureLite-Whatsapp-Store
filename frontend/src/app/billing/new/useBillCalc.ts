'use client';
import { useMemo } from 'react';
import type { LineItem, BillCharge, BillTotals } from './types';

function calcLineFields(
  item: Pick<LineItem, 'rate' | 'qty' | 'priceInclTax' | 'discountPct' | 'gstRate'>,
  billDiscAllocPaise: number,
  isInterState: boolean,
): Pick<LineItem, 'discountAmt' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'> {
  const ratePaise = Math.round(item.rate * 100);
  const gross = ratePaise * item.qty;
  const lineDiscAmt = Math.round(gross * item.discountPct / 100);
  const afterLineDisc = gross - lineDiscAmt;
  const taxable = item.priceInclTax
    ? Math.round(afterLineDisc * 100 / (100 + item.gstRate))
    : afterLineDisc;
  const taxableABD = Math.max(0, taxable - billDiscAllocPaise);
  const taxAmt = Math.round(taxableABD * item.gstRate / 100);
  const cgst = isInterState ? 0 : Math.floor(taxAmt / 2);
  const sgst = isInterState ? 0 : (taxAmt - Math.floor(taxAmt / 2));
  const igst = isInterState ? taxAmt : 0;
  return { discountAmt: lineDiscAmt, taxable: taxableABD, cgst, sgst, igst, total: taxableABD + taxAmt };
}

function preTaxable(item: Pick<LineItem, 'rate' | 'qty' | 'priceInclTax' | 'discountPct' | 'gstRate'>): number {
  const ratePaise = Math.round(item.rate * 100);
  const gross = ratePaise * item.qty;
  const lineDiscAmt = Math.round(gross * item.discountPct / 100);
  const afterLineDisc = gross - lineDiscAmt;
  return item.priceInclTax
    ? Math.round(afterLineDisc * 100 / (100 + item.gstRate))
    : afterLineDisc;
}

export function billCalcPure(
  items: LineItem[],
  billDiscountPct: number,
  charges: BillCharge[],
  roundOffEnabled: boolean,
  isInterState: boolean,
  amountPaidRupees: number,
): { lines: LineItem[]; totals: BillTotals } {
  const preTaxables = items.map(item => preTaxable(item));
  const totalPreTaxable = preTaxables.reduce((s, t) => s + t, 0);
  const billDiscAmtPaise = Math.round(totalPreTaxable * billDiscountPct / 100);

  const billDiscAlloc = (totalPreTaxable > 0 && billDiscAmtPaise > 0)
    ? preTaxables.map(t => Math.round(billDiscAmtPaise * t / totalPreTaxable))
    : preTaxables.map(() => 0);

  const lines: LineItem[] = items.map((item, i) => ({
    ...item,
    ...calcLineFields(item, billDiscAlloc[i], isInterState),
  }));

  const taxablePaise = lines.reduce((s, l) => s + l.taxable, 0);
  const cgstTotalPaise = lines.reduce((s, l) => s + l.cgst, 0);
  const sgstTotalPaise = lines.reduce((s, l) => s + l.sgst, 0);
  const igstTotalPaise = lines.reduce((s, l) => s + l.igst, 0);
  const chargesTotalPaise = charges.reduce((s, c) => s + Math.round(c.amtRupees * 100), 0);
  const grandBeforePaise = taxablePaise + cgstTotalPaise + sgstTotalPaise + igstTotalPaise + chargesTotalPaise;

  let roundOffPaise = 0;
  let grandTotalPaise = grandBeforePaise;
  if (roundOffEnabled) {
    const rounded = Math.round(grandBeforePaise / 100) * 100;
    roundOffPaise = rounded - grandBeforePaise;
    grandTotalPaise = rounded;
  }

  const amountPaidPaise = Math.round(amountPaidRupees * 100);
  const amountDuePaise = Math.max(0, grandTotalPaise - amountPaidPaise);

  return {
    lines,
    totals: {
      taxablePaise,
      billDiscAmtPaise,
      chargesTotalPaise,
      cgstTotalPaise,
      sgstTotalPaise,
      igstTotalPaise,
      grandBeforePaise,
      roundOffPaise,
      grandTotalPaise,
      amountDuePaise,
    },
  };
}

export function useBillCalc(
  items: LineItem[],
  billDiscountPct: number,
  charges: BillCharge[],
  roundOffEnabled: boolean,
  isInterState: boolean,
  amountPaidRupees: number,
): { lines: LineItem[]; totals: BillTotals } {
  return useMemo(
    () => billCalcPure(items, billDiscountPct, charges, roundOffEnabled, isInterState, amountPaidRupees),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, billDiscountPct, charges, roundOffEnabled, isInterState, amountPaidRupees],
  );
}
