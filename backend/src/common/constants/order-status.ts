/**
 * Canonical order fulfilment statuses (Phase 1).
 * For a single source of truth across repos, prefer OpenAPI-generated types or a shared `packages/` module.
 * Replaces legacy `pending` → `placed`, `processing` → `preparing`.
 * No separate `shipped` — flow is store/delivery: … → preparing → out_for_delivery → delivered.
 */
export const ORDER_STATUS_VALUES = [
  'placed',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

/** Dashboards / analytics: order is not yet out with delivery. */
export const ORDER_STATUSES_PENDING_FULFILLMENT: readonly OrderStatus[] = [
  'placed',
  'confirmed',
  'preparing',
] as const;

export function isOrderStatusPendingFulfillment(status: string): boolean {
  return (ORDER_STATUSES_PENDING_FULFILLMENT as readonly string[]).includes(status);
}
