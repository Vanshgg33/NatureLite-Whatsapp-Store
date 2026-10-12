import { GST_STATE_CODES } from '../constants/stateCodes'

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export interface GstinResult {
  valid: boolean
  stateCode?: string
  stateName?: string
  pan?: string
  error?: string
}

/** Validates GSTIN format + checksum (Appendix B). */
export function validateGstin(gstin: string): GstinResult {
  if (!gstin || gstin.length !== 15)
    return { valid: false, error: 'GSTIN must be 15 characters' }

  const g = gstin.toUpperCase()
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g))
    return { valid: false, error: 'Invalid GSTIN format' }

  const stateCode = g.slice(0, 2)
  if (!GST_STATE_CODES[stateCode])
    return { valid: false, error: `Unknown state code ${stateCode}` }

  // Checksum (Appendix B)
  let sum = 0
  for (let i = 0; i <= 13; i++) {
    const v = CHARS.indexOf(g[i])
    const p = v * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(p / 36) + (p % 36)
  }
  const check = CHARS[(36 - (sum % 36)) % 36]
  if (check !== g[14])
    return { valid: false, error: 'Checksum mismatch' }

  return { valid: true, stateCode, stateName: GST_STATE_CODES[stateCode], pan: g.slice(2, 12) }
}

/** Invoice number: 1-16 chars, letters/digits/hyphen/slash only (§3.2). */
export function validateInvoiceNo(no: string): boolean {
  return /^[A-Za-z0-9\-\/]{1,16}$/.test(no)
}

/**
 * Credit note deadline (§3.8):
 * 30 November following the end of FY, OR date of annual return filing, whichever earlier.
 * invoiceFyEndYear: the year March 31 falls on, e.g. 2027 for FY 2026-27.
 */
export function isCreditNoteLate(
  creditNoteDate: Date,
  invoiceFyEndYear: number,
  filedDate?: Date
): boolean {
  // Exclusive upper bound: Dec 1 UTC = all of Nov 30 is valid across any timezone
  const deadline = new Date(Date.UTC(invoiceFyEndYear, 11, 1)) // Dec 1 UTC
  const effective = filedDate && filedDate < deadline ? filedDate : deadline
  return creditNoteDate >= effective
}
