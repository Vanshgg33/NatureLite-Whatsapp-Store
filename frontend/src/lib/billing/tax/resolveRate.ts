export interface TaxRateRuleLike {
  _id: string
  scope: 'hsn' | 'category' | 'item'
  hsnPrefix?: string
  categoryId?: string
  itemId?: string
  gstRate: number
  cessRate: number
  taxability: 'taxable' | 'nil' | 'exempt' | 'non_gst'
  effectiveFrom: Date | string
  effectiveTo: Date | string | null
  status: 'scheduled' | 'active' | 'expired' | 'cancelled'
}

export interface ItemDescriptor {
  _id: string
  hsnCode: string
  categoryId?: string
}

export interface RateResult {
  gstRate: number
  cessRate: number
  taxability: string
  ruleId: string
  source: 'item' | 'hsn' | 'category'
}

/**
 * Pure rate-selection algorithm (§13.3). No DB access.
 * docDate must be a business date in Asia/Kolkata (caller's responsibility).
 */
export function selectRate(
  rules: TaxRateRuleLike[],
  item: ItemDescriptor,
  docDate: Date
): RateResult | null {
  const candidates = rules.filter(r => {
    if (r.status === 'cancelled') return false
    const from = new Date(r.effectiveFrom)
    const to = r.effectiveTo ? new Date(r.effectiveTo) : null
    return from <= docDate && (to === null || docDate < to)
  })

  // Priority 1: item match
  const itemMatch = candidates.find(r => r.scope === 'item' && r.itemId === item._id)
  if (itemMatch) return { gstRate: itemMatch.gstRate, cessRate: itemMatch.cessRate, taxability: itemMatch.taxability, ruleId: itemMatch._id, source: 'item' }

  // Priority 2: HSN — longest prefix wins; tiebreak by effectiveFrom DESC
  const hsnMatches = candidates
    .filter(r => r.scope === 'hsn' && r.hsnPrefix && item.hsnCode.startsWith(r.hsnPrefix))
    .sort((a, b) => {
      const lenDiff = (b.hsnPrefix?.length ?? 0) - (a.hsnPrefix?.length ?? 0)
      if (lenDiff !== 0) return lenDiff
      return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    })
  if (hsnMatches[0]) {
    const m = hsnMatches[0]
    return { gstRate: m.gstRate, cessRate: m.cessRate, taxability: m.taxability, ruleId: m._id, source: 'hsn' }
  }

  // Priority 3: category
  const catMatch = candidates.find(r => r.scope === 'category' && r.categoryId === item.categoryId)
  if (catMatch) return { gstRate: catMatch.gstRate, cessRate: catMatch.cessRate, taxability: catMatch.taxability, ruleId: catMatch._id, source: 'category' }

  return null
}
