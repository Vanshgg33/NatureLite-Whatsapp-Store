// "Incomplete lead" filters shared by Billing → Customers and CRM → Customers (User collection).
// Missing = absent, null, empty or whitespace-only. A lead must have a phone number to count.
export const INCOMPLETE_LEAD_KINDS = ['missing_name', 'missing_address'] as const;
export type IncompleteLead = (typeof INCOMPLETE_LEAD_KINDS)[number];

export const parseIncompleteLead = (v: unknown): IncompleteLead | undefined =>
  (INCOMPLETE_LEAD_KINDS as readonly unknown[]).includes(v) ? (v as IncompleteLead) : undefined;

const HAS_TEXT = /\S/;
// every place a customer address can live: billing addresses, or any part of a delivery address
const ADDRESS_PATHS = ['billingAddresses.line', ...['house', 'building', 'area', 'street', 'city', 'state', 'pincode'].map((f) => `addresses.${f}`)];

/** Mongo filter on User; top-level keys (phone, name, $nor) never collide with a search `$or`. */
export function incompleteLeadFilter(kind: IncompleteLead): Record<string, unknown> {
  const hasPhone = { phone: /\d/ };
  return kind === 'missing_name'
    ? { ...hasPhone, name: { $not: HAS_TEXT } }
    : { ...hasPhone, $nor: ADDRESS_PATHS.map((p) => ({ [p]: HAS_TEXT })) };
}
