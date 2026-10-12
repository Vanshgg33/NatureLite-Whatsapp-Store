import { describe, it, expect } from 'vitest'
import {
  calcLine, applyRoundOff, classifyGstr1,
  allocateBillDiscount, computeSetOff, computePL, weightedAvgCost
} from './calc'

describe('calcLine', () => {
  it('T1 – incl. tax, intra-state 5%', () => {
    const r = calcLine({ qty: 1, rate: 90000, priceInclTax: true, gstRate: 5 }, 'intra')
    expect(r.taxable).toBe(85714)
    expect(r.cgst).toBe(2143)
    expect(r.sgst).toBe(2143)
    expect(r.total).toBe(90000)
  })

  it('T2 – incl. tax, inter-state 5%', () => {
    const r = calcLine({ qty: 1, rate: 90000, priceInclTax: true, gstRate: 5 }, 'inter')
    expect(r.taxable).toBe(85714)
    expect(r.igst).toBe(4286)
    expect(r.cgst).toBe(0)
    expect(r.total).toBe(90000)
  })

  it('T3 – excl. tax, 10% line discount, 5%', () => {
    const r = calcLine({ qty: 2, rate: 50000, priceInclTax: false, discountPct: 10, gstRate: 5 }, 'intra')
    expect(r.gross).toBe(100000)
    expect(r.discountAmt).toBe(10000)
    expect(r.taxable).toBe(90000)
    expect(r.cgst + r.sgst).toBe(4500)
    expect(r.total).toBe(94500)
  })
})

describe('applyRoundOff', () => {
  it('T4 – rounds up .50', () => {
    const { rounded, roundOff } = applyRoundOff(94550)
    expect(rounded).toBe(94600)
    expect(roundOff).toBe(50)
  })

  it('T5 – rounds down .49', () => {
    const { rounded, roundOff } = applyRoundOff(123449)
    expect(rounded).toBe(123400)
    expect(roundOff).toBe(-49)
  })
})

describe('classifyGstr1', () => {
  const B2CL_THRESHOLD = 10_000_000 // Rs 1 lakh in paise

  it('T6 – inter-state unregistered > 1L = B2CL', () => {
    expect(classifyGstr1({ hasValidGstin: false, isInterState: true, invoiceValuePaise: 12_000_000, b2clThresholdPaise: B2CL_THRESHOLD })).toBe('B2CL')
  })

  it('T7 – intra-state unregistered = B2CS', () => {
    expect(classifyGstr1({ hasValidGstin: false, isInterState: false, invoiceValuePaise: 12_000_000, b2clThresholdPaise: B2CL_THRESHOLD })).toBe('B2CS')
  })

  it('T8 – inter-state unregistered exactly 1L = B2CS (threshold is exceeds)', () => {
    expect(classifyGstr1({ hasValidGstin: false, isInterState: true, invoiceValuePaise: 10_000_000, b2clThresholdPaise: B2CL_THRESHOLD })).toBe('B2CS')
  })
})

describe('allocateBillDiscount (T13)', () => {
  it('allocates proportionally, recalcs tax', () => {
    const linesTaxable = [60000, 40000] // Rs 600 and Rs 400 in paise
    const [d1, d2] = allocateBillDiscount(linesTaxable, 10000) // Rs 100 discount
    expect(d1).toBe(6000)
    expect(d2).toBe(4000)
    const t1 = linesTaxable[0] - d1 // 54000 = Rs 540
    const t2 = linesTaxable[1] - d2 // 36000 = Rs 360
    expect(t1).toBe(54000)
    expect(t2).toBe(36000)
    expect(Math.round(t1 * 5 / 100)).toBe(2700)  // tax Rs 27
    expect(Math.round(t2 * 18 / 100)).toBe(6480) // tax Rs 64.80
  })
})

describe('computeSetOff (T14)', () => {
  it('IGST credit covers IGST; remainder covers CGST; CGST credit covers remaining CGST', () => {
    const r = computeSetOff(
      { igst: 1000, cgst: 500, sgst: 500 },
      { igst: 1200, cgst: 100, sgst: 0 }
    )
    expect(r.cashIgst).toBe(0)
    expect(r.cashCgst).toBe(200)  // 500 - 200 (IGST leftover) - 100 (CGST credit) = 200
    expect(r.cashSgst).toBe(500)
    expect(r.cashIgst + r.cashCgst + r.cashSgst).toBe(700)
  })
})

describe('computePL (T15)', () => {
  it('COGS, gross profit, net profit', () => {
    const r = computePL({
      openingStockPaise:   5_000_000,
      purchasesPaise:     20_000_000,
      directExpensesPaise: 1_000_000,
      closingStockPaise:   7_000_000,
      salesPaise:         30_000_000,
      otherIncomePaise:            0,
      indirectExpensesPaise: 4_000_000,
      stockWrittenOffPaise:        0,
    })
    expect(r.cogs).toBe(19_000_000)
    expect(r.grossProfit).toBe(11_000_000)
    expect(r.netProfit).toBe(7_000_000)
  })
})

describe('weightedAvgCost (T16)', () => {
  it('buy 10@100, 10@120, sell 5 → avg Rs 110, cost 5*110=550', () => {
    const avg = weightedAvgCost([
      { qty: 10, ratePaise: 10000 },
      { qty: 10, ratePaise: 12000 },
    ])
    expect(avg).toBe(11000)              // Rs 110 per unit
    expect(5 * avg).toBe(55000)         // Rs 550 cost of sale
  })
})
