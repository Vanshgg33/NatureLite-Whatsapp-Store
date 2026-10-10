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
