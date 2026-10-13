import { describe, it, expect } from 'vitest'
import { validateGstin, validateInvoiceNo, isCreditNoteLate } from './validate'

describe('validateGstin (T9)', () => {
  it('valid GSTIN – state 22, correct checksum', () => {
    const r = validateGstin('22ABCDE1234F1ZA')
    expect(r.valid).toBe(true)
    expect(r.stateCode).toBe('22')
    expect(r.pan).toBe('ABCDE1234F')
  })

  it('invalid checksum', () => {
    const r = validateGstin('22ABCDE1234F1ZB')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/checksum/i)
  })
})

describe('validateInvoiceNo (T10)', () => {
  it('rejects 17-char invoice number', () => {
    expect(validateInvoiceNo('NLF-26-27/1234567')).toBe(false) // 17 chars
  })

  it('accepts 16-char invoice number', () => {
    expect(validateInvoiceNo('NLF-26-27/123456')).toBe(true) // 16 chars
  })
})

describe('isCreditNoteLate (T12)', () => {
  it('1 Dec 2027 against FY 2026-27 → late (deadline 30 Nov 2027)', () => {
    expect(isCreditNoteLate(new Date('2027-12-01'), 2027)).toBe(true)
  })

  it('30 Nov 2027 → not late', () => {
    expect(isCreditNoteLate(new Date('2027-11-30'), 2027)).toBe(false)
  })

  it('filing date earlier than 30 Nov overrides deadline', () => {
    // filed 1 Oct 2027; credit note 2 Oct 2027 → late
    expect(isCreditNoteLate(new Date('2027-10-02'), 2027, new Date('2027-10-01'))).toBe(true)
  })
})
