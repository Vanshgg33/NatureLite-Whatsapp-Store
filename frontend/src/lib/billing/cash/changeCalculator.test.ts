import { describe, it, expect } from 'vitest'
import { computeChange } from './changeCalculator'

describe('computeChange', () => {
  it('C1 – change 225; stock 500x2,200x1,20x1,5x1', () => {
    const r = computeChange(225, { '500': 2, '200': 1, '20': 1, '5': 1 })
    expect(r.feasible).toBe(true)
    expect(r.breakdown).toEqual({ '200': 1, '20': 1, '5': 1 })
    expect(r.pieces).toBe(3)
  })

  it('C2 – change 0 → feasible, empty breakdown', () => {
    const r = computeChange(0, { '100': 5 })
    expect(r.feasible).toBe(true)
    expect(r.breakdown).toEqual({})
    expect(r.pieces).toBe(0)
  })

  it('C3 – change 7; stock 5x0,2x1,1x1 → not feasible with hint', () => {
    const r = computeChange(7, { '5': 0, '2': 1, '1': 1 })
    expect(r.feasible).toBe(false)
    expect(r.hint).toBeTruthy()
  })

  it('C4 – change 30; stock 10x2 only → not feasible', () => {
    const r = computeChange(30, { '10': 2 })
    expect(r.feasible).toBe(false)
  })

  it('C5 – bug: old greedy would use more coins than available; DP respects stock', () => {
    const stock = { '1': 2, '2': 1, '5': 2, '20': 3, '50': 1, '100': 3, '500': 3 }
    const r = computeChange(116, stock)
    expect(r.feasible).toBe(true)
    // Must never use more than 2 coins of Rs 5
    expect((r.breakdown?.['5'] ?? 0)).toBeLessThanOrEqual(2)
    // Breakdown must sum to 116
    const sum = Object.entries(r.breakdown!).reduce((s, [d, q]) => s + Number(d) * q, 0)
    expect(sum).toBe(116)
    // No denomination exceeds stock
    for (const [d, q] of Object.entries(r.breakdown!)) {
      expect(q).toBeLessThanOrEqual(stock[d as keyof typeof stock])
    }
  })

  it('C6 – randomised 200 cases: breakdown sums to amount, no denom exceeds stock', () => {
    let mismatches = 0
    for (let trial = 0; trial < 200; trial++) {
      const stock: Record<string, number> = {}
      const denoms = [1, 2, 5, 10, 20, 50, 100, 200, 500]
      for (const d of denoms) stock[String(d)] = Math.floor(Math.random() * 10)
      const maxMakeable = Object.entries(stock).reduce((s, [d, q]) => s + Number(d) * q, 0)
      const amt = Math.floor(Math.random() * Math.min(maxMakeable + 50, 5000))
      const r = computeChange(amt, stock)
      if (r.feasible && r.breakdown) {
        const sum = Object.entries(r.breakdown).reduce((s, [d, q]) => s + Number(d) * q, 0)
        if (sum !== amt) mismatches++
        for (const [d, q] of Object.entries(r.breakdown)) {
          if (q > stock[d]) mismatches++
        }
      }
    }
    expect(mismatches).toBe(0)
  })
})
