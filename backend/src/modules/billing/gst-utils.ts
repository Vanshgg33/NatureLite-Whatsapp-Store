const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTIN pattern plus the mod-36 check character. */
export function isValidGstin(raw: string | null | undefined): boolean {
  const g = (raw ?? '').trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const f = (i % 2 === 0 ? 1 : 2) * CH.indexOf(g[i]);
    sum += Math.floor(f / 36) + (f % 36);
  }
  return CH[(36 - (sum % 36)) % 36] === g[14];
}

/** Indian FY (1 Apr to 31 Mar) of an instant, in IST: label "2026-27" and short "26-27". */
export function fyOf(date: Date = new Date()): { label: string; short: string } {
  const ist = new Date(date.getTime() + 5.5 * 3_600_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  const end = String((y + 1) % 100).padStart(2, '0');
  return { label: `${y}-${end}`, short: `${String(y % 100).padStart(2, '0')}-${end}` };
}
