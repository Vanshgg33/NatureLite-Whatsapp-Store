// Turns Billing bills (as returned with the CRM customer profile) into activity-timeline events.

export type BillEvent =
  | { _id: string; _type: 'bill'; createdAt: string; bill: any; paidAtBilling: number }
  | { _id: string; _type: 'payment'; createdAt: string; bill: any; amount: number; mode: string; dueAfter: number }
  | { _id: string; _type: 'cancel'; createdAt: string; bill: any };

/** One event per bill (purchase or return), one per later payment / refund paid, one per cancellation with a known time. */
export function billEvents(bills: any[]): BillEvent[] {
  const out: BillEvent[] = [];
  for (const b of bills) {
    const id = String(b._id);
    const grandP = Math.round((Number(b.grandTotal) || 0) * 100);
    const payments = [...(b.payments ?? [])].sort((x, y) => +new Date(x.at) - +new Date(y.at));
    // bills with no payments array (legacy) only know the total paid, all of it at billing
    const initialP = payments.length
      ? payments.filter(p => p.kind !== 'LATER').reduce((s, p) => s + (Number(p.amountPaise) || 0), 0)
      : Math.round((Number(b.amountPaid) || 0) * 100);
    out.push({ _id: `bill-${id}`, _type: 'bill', createdAt: b.createdAt, bill: b, paidAtBilling: initialP / 100 });

    let paidP = 0;
    payments.forEach((p, i) => {
      paidP += Number(p.amountPaise) || 0;
      if (p.kind === 'LATER') {
        out.push({ _id: `pay-${id}-${i}`, _type: 'payment', createdAt: p.at, bill: b, amount: (Number(p.amountPaise) || 0) / 100, mode: p.mode, dueAfter: Math.max(0, grandP - paidP) / 100 });
      }
    });

    if (b.status === 'cancelled' && b.cancelledAt) out.push({ _id: `cancel-${id}`, _type: 'cancel', createdAt: b.cancelledAt, bill: b });
  }
  return out;
}
