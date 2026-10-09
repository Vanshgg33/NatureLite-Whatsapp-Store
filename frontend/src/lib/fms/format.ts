export function fmtQty(qty: number, uom: string): string {
  return `${qty.toLocaleString('en-IN')} ${uom}`;
}

export function fmtINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

// ms → "today" | "5 h" | "8 d"
export function fmtWait(ms: number): string {
  if (ms <= 0) return 'today';
  const h = ms / 3_600_000;
  if (h < 24) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

// ms of overdue duration → "Overdue 9 d" / "Overdue 5 h"
export function fmtOverdue(ms: number): string {
  const h = Math.abs(ms) / 3_600_000;
  if (h < 24) return `Overdue ${Math.round(h)} h`;
  return `Overdue ${Math.round(h / 24)} d`;
}

export function fmtDate(d: string | Date): string {
  const date = new Date(d);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// "PR-2026-0019" → "PR-0019"
export function shortPr(reqNo: string): string {
  const m = reqNo.match(/PR-\d{4}-(\d{4})/);
  return m ? `PR-${m[1]}` : reqNo;
}
