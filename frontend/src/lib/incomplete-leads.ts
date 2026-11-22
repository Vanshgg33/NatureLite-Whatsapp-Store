// One-click "incomplete lead" filters shared by Billing → Customers and CRM → Customers (server: incomplete-lead.util.ts).
export const INCOMPLETE_FILTERS = [
  { key: 'missing_name', label: 'Missing Name', hint: 'Has a phone number but no name' },
  { key: 'missing_address', label: 'Missing Address', hint: 'Has a phone number but no address' },
] as const;
export type IncompleteFilter = (typeof INCOMPLETE_FILTERS)[number]['key'] | '';
