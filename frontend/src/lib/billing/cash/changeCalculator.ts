export interface ChangeResult {
  feasible: boolean
  breakdown?: Record<string, number>   // denom (string) → count
  pieces?: number
  reason?: string
  hint?: string   // nearest feasible when infeasible
}

const MAX_CHANGE = 50_000 // rupees; above this suggest UPI

/**
 * Corrected DP change engine (blueprint §14.5).
 * changeAmount: whole rupees (integer).
 * stock: denom (string rupee value) → count available.
 */
export function computeChange(
  changeAmount: number,
  stock: Record<string, number>
): ChangeResult {
  if (!Number.isInteger(changeAmount) || changeAmount < 0)
    return { feasible: false, reason: 'Change must be a whole non-negative rupee amount' }
  if (changeAmount === 0) return { feasible: true, breakdown: {}, pieces: 0 }
  if (changeAmount > MAX_CHANGE)
    return { feasible: false, reason: 'Use UPI/bank for large change amounts above Rs 50,000' }

  const denoms = Object.keys(stock)
    .map(Number)
    .filter(d => stock[d] > 0 && d <= changeAmount)
    .sort((a, b) => b - a)

  if (denoms.length === 0)
    return { feasible: false, reason: 'No usable denominations in drawer', ...findHint(changeAmount, stock) }

  // DP: prev[amt] = min pieces to make amt using denoms processed so far
  // choice[i][amt] = how many of denoms[i] used
  let prev = new Array(changeAmount + 1).fill(Infinity)
  prev[0] = 0
  const choice: Uint16Array[] = []

  for (let i = 0; i < denoms.length; i++) {
    const d = denoms[i]
    const q = stock[d]
    const cur = prev.slice()
    const ch = new Uint16Array(changeAmount + 1)

    for (let amt = d; amt <= changeAmount; amt++) {
      for (let k = 1; k <= q && k * d <= amt; k++) {
        const prev_val = prev[amt - k * d]
        if (prev_val !== Infinity && prev_val + k < cur[amt]) {
          cur[amt] = prev_val + k
          ch[amt] = k
        }
      }
    }
    choice.push(ch)
    prev = cur
  }

  if (prev[changeAmount] === Infinity)
    return { feasible: false, reason: 'Drawer does not have enough notes/coins to make exact change.', ...findHint(changeAmount, stock) }

  // Backtrack to find breakdown
  const breakdown: Record<string, number> = {}
  let amt = changeAmount
  for (let i = denoms.length - 1; i >= 0; i--) {
    const k = choice[i][amt]
    if (k) { breakdown[String(denoms[i])] = k; amt -= k * denoms[i] }
  }

  return { feasible: true, breakdown, pieces: prev[changeAmount] }
}

function findHint(changeAmount: number, stock: Record<string, number>): { hint: string } {
  for (let delta = 1; delta <= 100; delta++) {
    const up = changeAmount + delta
    const ru = computeChangeRaw(up, stock)
    if (ru !== null) return { hint: `Ask customer for Rs ${delta} more (exact change Rs ${up})` }

    const down = changeAmount - delta
    if (down >= 0) {
      const rd = computeChangeRaw(down, stock)
      if (rd !== null) return { hint: `Exact change possible for Rs ${down} (Rs ${delta} less)` }
    }
  }
  return { hint: 'No feasible change found within Rs 100. Use UPI.' }
}

/** Lightweight inner call that skips hint to avoid infinite recursion. Returns null if infeasible. */
function computeChangeRaw(changeAmount: number, stock: Record<string, number>): Record<string, number> | null {
  if (changeAmount <= 0 || changeAmount > MAX_CHANGE) return changeAmount === 0 ? {} : null
  const denoms = Object.keys(stock).map(Number).filter(d => stock[d] > 0 && d <= changeAmount).sort((a, b) => b - a)
  if (denoms.length === 0) return null
  let prev = new Array(changeAmount + 1).fill(Infinity); prev[0] = 0
  const choice: Uint16Array[] = []
  for (const d of denoms) {
    const q = stock[d]; const cur = prev.slice(); const ch = new Uint16Array(changeAmount + 1)
    for (let amt = d; amt <= changeAmount; amt++)
      for (let k = 1; k <= q && k * d <= amt; k++) {
        const pv = prev[amt - k * d]
        if (pv !== Infinity && pv + k < cur[amt]) { cur[amt] = pv + k; ch[amt] = k }
      }
    choice.push(ch); prev = cur
  }
  if (prev[changeAmount] === Infinity) return null
  const bd: Record<string, number> = {}; let amt = changeAmount
  for (let i = denoms.length - 1; i >= 0; i--) { const k = choice[i][amt]; if (k) { bd[String(denoms[i])] = k; amt -= k * denoms[i] } }
  return bd
}
