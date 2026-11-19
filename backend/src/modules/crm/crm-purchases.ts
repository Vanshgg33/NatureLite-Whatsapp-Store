// The one definition of an online purchase for the CRM: LTV, Purchase History and LTV-based reports all use it,
// so a customer's LTV always equals the purchases their profile lists. Store bills come from Billing (see crm-engine).
import type { Model } from 'mongoose';

/** Delivered orders, plus delivered orders refunded afterwards (they count net of the refund). Replacements are free re-sends. */
export const PURCHASE_ORDER_MATCH = {
  orderType: { $ne: 'replacement' },
  $or: [
    { status: 'delivered' },
    { status: 'refunded', $or: [{ deliveredAt: { $ne: null } }, { 'timeline.status': 'delivered' }] },
  ],
};

export interface RefundPayment { amount?: number; refundAmount?: number }

/** Rupees refunded on an order (a full refund also returns the wallet part, so it refunds the whole order total). */
export function refundedAmount(order: { total?: number }, refunds: RefundPayment[]): number {
  const total = Number(order.total) || 0;
  if (!refunds.length) return 0;
  const full = refunds.some(p => p.refundAmount == null || p.refundAmount >= (Number(p.amount) || 0));
  const sum = refunds.reduce((s, p) => s + (Number(p.refundAmount ?? p.amount) || 0), 0);
  return full ? total : Math.min(total, Math.round(sum * 100) / 100);
}

/** Adds refundedAmount / netTotal to each order (refunded payments looked up in one query). */
export async function withNetTotals<T extends { _id: any; status?: string; total?: number }>(paymentModel: Model<any>, orders: T[]) {
  const refundedIds = orders.filter(o => o.status === 'refunded').map(o => o._id);
  const pays: any[] = refundedIds.length
    ? await paymentModel.find({ order: { $in: refundedIds }, status: 'refunded' }).select('order amount refundAmount').lean()
    : [];
  const byOrder = new Map<string, RefundPayment[]>();
  for (const p of pays) byOrder.set(String(p.order), [...(byOrder.get(String(p.order)) ?? []), p]);
  return orders.map(o => {
    // refunded with no refund payment on record: the order status is the only evidence, treat as fully refunded
    const r = o.status === 'refunded' ? (byOrder.has(String(o._id)) ? refundedAmount(o, byOrder.get(String(o._id))!) : Number(o.total) || 0) : 0;
    return { ...o, refundedAmount: r, netTotal: Math.round(((Number(o.total) || 0) - r) * 100) / 100 };
  });
}
