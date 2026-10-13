/** Format integer paise as Indian-grouped rupees. E.g. 12345678 → "₹1,23,456.78" */
export function formatINR(paise: number, opts?: { symbol?: string }): string {
  const symbol = opts?.symbol ?? '₹'
  const negative = paise < 0
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const paiseStr = String(abs % 100).padStart(2, '0')

  // Indian grouping: last 3 digits, then groups of 2
  const s = String(rupees)
  let grouped: string
  if (s.length <= 3) {
    grouped = s
  } else {
    const last3 = s.slice(-3)
    const rest = s.slice(0, -3)
    const parts: string[] = []
    for (let i = rest.length; i > 0; i -= 2) parts.unshift(rest.slice(Math.max(0, i - 2), i))
    grouped = parts.join(',') + ',' + last3
  }

  const formatted = `${symbol}${grouped}.${paiseStr}`
  return negative ? `-${formatted}` : formatted
}
