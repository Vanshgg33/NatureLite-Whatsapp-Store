export function formatINR(n: number): string {
  return '₹' + (n ?? 0).toLocaleString('en-IN');
}

export function formatINRCompact(n: number): string {
  if (!n) return '₹0';
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return formatINR(n);
}

export function displayName(name?: string, phone?: string): string {
  if (name?.trim()) return name.trim();
  if (phone) return phone;
  return '—';
}

export function formatPhone(phone?: string): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return phone;
}

export function initial(name?: string, phone?: string): string {
  return ((name?.trim() || phone?.trim() || '?')[0]).toUpperCase();
}

const SEGMENT_LABEL: Record<string, string> = {
  new: 'New', active: 'Active', due_soon: 'Due Soon', due_today: 'Due Today',
  overdue: 'Overdue', at_risk: 'At Risk', dormant: 'Dormant', lost: 'Lost', no_orders: 'No Orders',
};
export function segmentLabel(seg: string): string {
  return SEGMENT_LABEL[seg] ?? seg;
}

/** CRM Segments by AOV; keys match the backend's engine/aov-segments. */
export const AOV_SEGMENTS = [
  { key: 'aov_below_1000', name: 'Below ₹1,000' },
  { key: 'aov_1000_1999', name: '₹1,000–₹1,998.99' },
  { key: 'aov_1999_2999', name: '₹1,999–₹2,998.99' },
  { key: 'aov_2999_3999', name: '₹2,999–₹3,998.99' },
  { key: 'aov_3999_plus', name: '₹3,999 and above' },
] as const;
