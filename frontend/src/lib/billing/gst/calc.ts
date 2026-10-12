/** All money in integer paise. Rates are percentages (e.g. 5 means 5%). */

export type TaxMode = 'intra' | 'inter'

export interface LineInput {
  qty: number            // units (integer)
  rate: number           // paise per unit
  priceInclTax: boolean
  discountPct?: number   // 0-100; ignored if discountAmt given
  discountAmt?: number   // paise; takes precedence
  gstRate: number        // e.g. 5
  cessRate?: number      // default 0
}

export interface LineResult {
  gross: number       // qty * rate (paise)
  discountAmt: number
  taxable: number
  cgst: number        // 0 for inter
  sgst: number        // 0 for inter
  igst: number        // 0 for intra
  cess: number
  total: number       // taxable + all tax heads
}

export function calcLine(input: LineInput, mode: TaxMode): LineResult {
  const gstRate = input.gstRate
  const cessRate = input.cessRate ?? 0
  const gross = input.qty * input.rate

  let discountAmt: number
  if (input.discountAmt !== undefined) {
    discountAmt = input.discountAmt
  } else if (input.discountPct) {
    discountAmt = Math.round(gross * input.discountPct / 100)
  } else {
    discountAmt = 0
  }

  let taxable: number
  let totalTaxAmt: number

  if (input.priceInclTax) {
    const netGross = gross - discountAmt
    // back-calculate: netGross = taxable * (1 + (gstRate + cessRate) / 100)
    taxable = Math.round(netGross * 100 / (100 + gstRate + cessRate))
    totalTaxAmt = netGross - taxable
  } else {
    taxable = gross - discountAmt
    totalTaxAmt = Math.round(taxable * (gstRate + cessRate) / 100)
  }

  const cess = cessRate > 0 ? Math.round(taxable * cessRate / 100) : 0
  const gstAmt = totalTaxAmt - cess

  let cgst = 0, sgst = 0, igst = 0
  if (mode === 'intra') {
    // odd paisa goes to CGST (blueprint §3.4)
    cgst = Math.ceil(gstAmt / 2)
    sgst = gstAmt - cgst
  } else {
    igst = gstAmt
  }

  return { gross, discountAmt, taxable, cgst, sgst, igst, cess, total: taxable + cgst + sgst + igst + cess }
}

/** Round grand total to nearest rupee (Section 170). roundOff in paise, range -50 to +50. */
export function applyRoundOff(grandTotalPaise: number): { rounded: number; roundOff: number } {
  // half-up: 0.5 rounds up
  const rounded = Math.round(grandTotalPaise / 100) * 100
  return { rounded, roundOff: rounded - grandTotalPaise }
}

export type Gstr1Section = 'B2B' | 'B2CL' | 'B2CS' | 'EXEMPT'

export interface GstrClassifyInput {
  hasValidGstin: boolean
  isInterState: boolean
  invoiceValuePaise: number
  b2clThresholdPaise: number  // from Settings; default 10_000_000 (Rs 1 lakh)
}

/** GSTR-1 classification (§3.6). Threshold is exclusive (> not >=). */
export function classifyGstr1(input: GstrClassifyInput): Gstr1Section {
  if (input.hasValidGstin) return 'B2B'
  if (input.isInterState && input.invoiceValuePaise > input.b2clThresholdPaise) return 'B2CL'
  return 'B2CS'
}

/**
 * Allocate bill-level discount proportionally across lines by taxable value (§3.5).
 * Returns paise discount per line. Remainder goes to first lines to avoid drift.
 */
export function allocateBillDiscount(
  linesTaxable: number[],
  billDiscountAmt: number
): number[] {
  const total = linesTaxable.reduce((s, t) => s + t, 0)
  if (total === 0) return linesTaxable.map(() => 0)
  const allocs = linesTaxable.map(t => Math.floor(billDiscountAmt * t / total))
  const remainder = billDiscountAmt - allocs.reduce((s, a) => s + a, 0)
  for (let i = 0; i < remainder; i++) allocs[i]++
  return allocs
}

export interface GstLiability { igst: number; cgst: number; sgst: number }
export interface GstCredit    { igst: number; cgst: number; sgst: number }
export interface SetOffResult  { cashIgst: number; cashCgst: number; cashSgst: number }

/**
 * GST set-off (Section 49, Rule 88A).
 * Returns cash payable per head after applying ITC.
 */
export function computeSetOff(liability: GstLiability, credit: GstCredit): SetOffResult {
  let { igst: li, cgst: lc, sgst: ls } = { ...liability }
  let { igst: ci, cgst: cc, sgst: cs } = { ...credit }

  // IGST credit → IGST liability first
  const fromIgst = Math.min(li, ci); li -= fromIgst; ci -= fromIgst
  // Remaining IGST credit → CGST
  if (ci > 0) { const u = Math.min(ci, lc); lc -= u; ci -= u }
  // Remaining IGST credit → SGST
  if (ci > 0) { const u = Math.min(ci, ls); ls -= u; ci -= u }
  // CGST credit → CGST
  const fromCgst = Math.min(lc, cc); lc -= fromCgst; cc -= fromCgst
  // Remaining CGST credit → IGST
  if (cc > 0) { const u = Math.min(cc, li); li -= u; cc -= u }
  // SGST credit → SGST (NEVER against CGST)
  const fromSgst = Math.min(ls, cs); ls -= fromSgst; cs -= fromSgst
  // Remaining SGST credit → IGST
  if (cs > 0) { const u = Math.min(cs, li); li -= u; cs -= u }

  return { cashIgst: li, cashCgst: lc, cashSgst: ls }
}

export interface PLInput {
  openingStockPaise: number
  purchasesPaise: number
  directExpensesPaise: number
  closingStockPaise: number
  salesPaise: number
  otherIncomePaise: number
  indirectExpensesPaise: number
  stockWrittenOffPaise: number
}
export interface PLResult { cogs: number; grossProfit: number; netProfit: number }

/** Vyapar-style P&L (§10.2). All values in paise. */
export function computePL(i: PLInput): PLResult {
  const cogs = i.openingStockPaise + i.purchasesPaise + i.directExpensesPaise - i.closingStockPaise
  const grossProfit = i.salesPaise - cogs
  const netProfit = grossProfit + i.otherIncomePaise - i.indirectExpensesPaise - i.stockWrittenOffPaise
  return { cogs, grossProfit, netProfit }
}

/** Weighted average cost. Returns paise per unit. */
export function weightedAvgCost(batches: { qty: number; ratePaise: number }[]): number {
  const totalQty = batches.reduce((s, b) => s + b.qty, 0)
  if (totalQty === 0) return 0
  return Math.round(batches.reduce((s, b) => s + b.qty * b.ratePaise, 0) / totalQty)
}
