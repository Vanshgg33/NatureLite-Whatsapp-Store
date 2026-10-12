import { describe, it, expect } from 'vitest'
import { selectRate, TaxRateRuleLike, ItemDescriptor } from './resolveRate'

const mkRule = (overrides: Partial<TaxRateRuleLike>): TaxRateRuleLike => ({
  _id: 'r' + Math.random(), scope: 'hsn', hsnPrefix: '0405',
  gstRate: 5, cessRate: 0, taxability: 'taxable',
  effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
  status: 'active',
  ...overrides,
})

const ghee: ItemDescriptor = { _id: 'item-ghee', hsnCode: '04059020' }

describe('selectRate', () => {
  it('R1 – invoice 21 Sep 2025 → 12% (old rule)', () => {
    const rules = [
      mkRule({ _id: 'old', gstRate: 12, effectiveFrom: new Date('2020-01-01'), effectiveTo: new Date('2025-09-22') }),
      mkRule({ _id: 'new', gstRate: 5,  effectiveFrom: new Date('2025-09-22'), effectiveTo: null }),
    ]
    const r = selectRate(rules, ghee, new Date('2025-09-21'))
    expect(r?.gstRate).toBe(12)
  })

  it('R2 – invoice 22 Sep 2025 → 5% (new rule)', () => {
    const rules = [
      mkRule({ _id: 'old', gstRate: 12, effectiveFrom: new Date('2020-01-01'), effectiveTo: new Date('2025-09-22') }),
      mkRule({ _id: 'new', gstRate: 5,  effectiveFrom: new Date('2025-09-22'), effectiveTo: null }),
    ]
    const r = selectRate(rules, ghee, new Date('2025-09-22'))
    expect(r?.gstRate).toBe(5)
  })

  it('R3 – item override wins over HSN rule', () => {
    const rules = [
      mkRule({ _id: 'hsn', scope: 'hsn', gstRate: 5, effectiveFrom: new Date('2020-01-01') }),
      mkRule({ _id: 'item', scope: 'item', itemId: ghee._id, gstRate: 18, effectiveFrom: new Date('2026-11-01') }),
    ]
    // For the specific SKU, item rule wins
    const r = selectRate(rules, ghee, new Date('2026-11-02'))
    expect(r?.gstRate).toBe(18)
    expect(r?.source).toBe('item')

    // For a different item with same HSN, hsn rule applies
    const other: ItemDescriptor = { _id: 'other-ghee', hsnCode: '04059020' }
    const r2 = selectRate(rules, other, new Date('2026-11-02'))
    expect(r2?.gstRate).toBe(5)
  })

  it('R4 – longest HSN prefix wins (0405 over 04)', () => {
    const rules = [
      mkRule({ _id: 'broad', hsnPrefix: '04',   gstRate: 5  }),
      mkRule({ _id: 'specific', hsnPrefix: '0405', gstRate: 12 }),
    ]
    const r = selectRate(rules, ghee, new Date('2026-01-01'))
    expect(r?.gstRate).toBe(12)
    expect(r?.ruleId).toBe('specific')
  })
})
