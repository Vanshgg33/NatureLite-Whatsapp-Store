// Dashboard card → Bills list "view": the title, starting filters and the total to highlight.
// Pure (no React, no aliases) so it can be unit-tested; the URL carries it, so a view survives refresh and can be shared.

export type DatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
export type Focus = 'total' | 'collected' | 'due';

export interface BillFilterState {
  search: string; status: string; channel: string; preset: DatePreset; customStart: string; customEnd: string;
  hasNotes: boolean; product: string; minQty: string; minAmount: string; maxAmount: string; customerId: string;
}

export const DEFAULT_FILTERS: BillFilterState = {
  search: '', status: '', channel: '', preset: 'all', customStart: '', customEnd: '',
  hasNotes: false, product: '', minQty: '', minAmount: '', maxAmount: '', customerId: '',
};

export interface BillView { key: string; title: string; description: string; focus: Focus; filters: Partial<BillFilterState> }

export const BILL_VIEWS: Record<string, BillView> = {
  revenue: { key: 'revenue', title: 'Total Revenue', description: 'Every active bill, all time', focus: 'total', filters: {} },
  collected: { key: 'collected', title: 'Total Collected', description: 'Money received against bills, all time', focus: 'collected', filters: {} },
  outstanding: { key: 'outstanding', title: 'Outstanding Dues', description: 'Unpaid and part-paid bills, all time', focus: 'due', filters: { status: 'due' } },
  today: { key: 'today', title: "Today's Sales", description: 'Bills dated today', focus: 'total', filters: { preset: 'today' } },
  'today-collected': { key: 'today-collected', title: 'Collected Today', description: 'Payments on bills dated today', focus: 'collected', filters: { preset: 'today' } },
  'today-pending': { key: 'today-pending', title: 'Pending Today', description: 'Unpaid and part-paid bills dated today', focus: 'due', filters: { preset: 'today', status: 'due' } },
  month: { key: 'month', title: 'Month Sales', description: 'Bills dated this month', focus: 'total', filters: { preset: 'month' } },
  'month-collected': { key: 'month-collected', title: 'Month Collected', description: 'Payments on bills dated this month', focus: 'collected', filters: { preset: 'month' } },
  'month-due': { key: 'month-due', title: 'Month Due', description: 'Unpaid and part-paid bills dated this month', focus: 'due', filters: { preset: 'month', status: 'due' } },
  channel: { key: 'channel', title: 'Sales by channel', description: 'Bills dated this month for one sales channel', focus: 'total', filters: { preset: 'month' } },
};

const PRESETS: DatePreset[] = ['all', 'today', 'yesterday', 'week', 'month', 'custom'];
const STATUSES = ['', 'paid', 'partial', 'unpaid', 'due'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUM = /^\d+(\.\d+)?$/;
const ID = /^[0-9a-fA-F]{24}$/;

// URL key ↔ state field
const KEYS: [keyof BillFilterState, string][] = [
  ['search', 'q'], ['status', 'status'], ['channel', 'channel'], ['preset', 'preset'], ['customStart', 'from'], ['customEnd', 'to'],
  ['hasNotes', 'notes'], ['product', 'product'], ['minQty', 'minQty'], ['minAmount', 'minAmount'], ['maxAmount', 'maxAmount'], ['customerId', 'customer'],
];

/** URL → view + full filter state (defaults + view's filters + explicit params). Bad values are dropped, never trusted. */
export function readBillsQuery(qs: URLSearchParams): { view: BillView | null; filters: BillFilterState; fromUrl: boolean } {
  const view = BILL_VIEWS[qs.get('view') ?? ''] ?? null;
  const f: BillFilterState = { ...DEFAULT_FILTERS, ...(view?.filters ?? {}) };
  const get = (k: string) => qs.get(k)?.trim() ?? '';
  if (get('q')) f.search = get('q').slice(0, 100);
  if (STATUSES.includes(get('status')) && qs.has('status')) f.status = get('status');
  if (get('channel')) f.channel = get('channel').slice(0, 60);
  if (PRESETS.includes(get('preset') as DatePreset)) f.preset = get('preset') as DatePreset;
  if (DATE.test(get('from'))) f.customStart = get('from');
  if (DATE.test(get('to'))) f.customEnd = get('to');
  if (get('notes') === '1') f.hasNotes = true;
  if (get('product')) f.product = get('product').slice(0, 60);
  for (const k of ['minQty', 'minAmount', 'maxAmount'] as const) if (NUM.test(get(k))) f[k] = get(k);
  if (ID.test(get('customer'))) f.customerId = get('customer');
  const fromUrl = !!view || KEYS.some(([, k]) => qs.has(k));
  return { view, filters: f, fromUrl };
}

/** state → URL (only what differs from the defaults, plus the view) */
export function writeBillsQuery(view: BillView | null, f: BillFilterState): string {
  const qs = new URLSearchParams();
  if (view) qs.set('view', view.key);
  for (const [field, k] of KEYS) {
    const v = f[field];
    if (v === DEFAULT_FILTERS[field]) continue;
    qs.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  // a filter the view set but the user cleared (e.g. Outstanding → All statuses) must stay cleared on reload
  if (view) for (const [field, k] of KEYS) {
    const vd = view.filters[field];
    if (vd !== undefined && f[field] === DEFAULT_FILTERS[field] && vd !== f[field]) qs.set(k, String(f[field]) || '');
  }
  return qs.toString();
}

/** chips for every active filter, each with what clearing it sets back */
export function activeFilters(f: BillFilterState, customerName?: string): { key: keyof BillFilterState; label: string; clear: Partial<BillFilterState> }[] {
  const out: { key: keyof BillFilterState; label: string; clear: Partial<BillFilterState> }[] = [];
  const presetLabel: Record<DatePreset, string> = { all: '', today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month', custom: 'Custom dates' };
  if (f.preset !== 'all') {
    const label = f.preset === 'custom' ? `${f.customStart || '…'} → ${f.customEnd || '…'}` : presetLabel[f.preset];
    out.push({ key: 'preset', label: `Date: ${label}`, clear: { preset: 'all', customStart: '', customEnd: '' } });
  }
  const statusLabel: Record<string, string> = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', due: 'Unpaid or partial' };
  if (f.status) out.push({ key: 'status', label: `Status: ${statusLabel[f.status] ?? f.status}`, clear: { status: '' } });
  if (f.channel) out.push({ key: 'channel', label: `Channel: ${f.channel}`, clear: { channel: '' } });
  if (f.customerId) out.push({ key: 'customerId', label: `Customer: ${customerName || 'selected'}`, clear: { customerId: '' } });
  if (f.search) out.push({ key: 'search', label: `Search: “${f.search}”`, clear: { search: '' } });
  if (f.minAmount || f.maxAmount) {
    const label = f.minAmount && f.maxAmount ? `₹${f.minAmount}–₹${f.maxAmount}` : f.minAmount ? `≥ ₹${f.minAmount}` : `≤ ₹${f.maxAmount}`;
    out.push({ key: 'minAmount', label: `Amount: ${label}`, clear: { minAmount: '', maxAmount: '' } });
  }
  if (f.product) out.push({ key: 'product', label: `Product: ${f.product}`, clear: { product: '' } });
  if (f.minQty) out.push({ key: 'minQty', label: `Qty ≥ ${f.minQty}`, clear: { minQty: '' } });
  if (f.hasNotes) out.push({ key: 'hasNotes', label: 'Has internal notes', clear: { hasNotes: false } });
  return out;
}

/** link for a dashboard card */
export const billsViewHref = (view: string, extra: Record<string, string> = {}) =>
  `/billing/bills?${new URLSearchParams({ view, ...extra }).toString()}`;
