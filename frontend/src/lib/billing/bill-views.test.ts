import { describe, it, expect } from 'vitest';
import { readBillsQuery, writeBillsQuery, activeFilters, billsViewHref, BILL_VIEWS, DEFAULT_FILTERS } from './bill-views';

const read = (href: string) => readBillsQuery(new URLSearchParams(href.split('?')[1] ?? ''));

describe('dashboard card → Bills list view', () => {
  it('each card opens its own title and starting filters', () => {
    expect(read(billsViewHref('outstanding'))).toMatchObject({ view: { title: 'Outstanding Dues', focus: 'due' }, filters: { status: 'due', preset: 'all' } });
    expect(read(billsViewHref('today-pending')).filters).toMatchObject({ status: 'due', preset: 'today' });
    expect(read(billsViewHref('month-collected'))).toMatchObject({ view: { focus: 'collected' }, filters: { preset: 'month', status: '' } });
    expect(read(billsViewHref('channel', { channel: 'Store Order' })).filters).toMatchObject({ channel: 'Store Order', preset: 'month' });
  });

  it('a fresh view starts from defaults, so filters left from an earlier visit never leak in', () => {
    const r = read(billsViewHref('revenue'));
    expect(r.filters).toEqual(DEFAULT_FILTERS);
    expect(r.fromUrl).toBe(true);
    expect(read('/billing/bills').fromUrl).toBe(false);
  });

  it('drops malformed values from the URL', () => {
    const f = read('/billing/bills?status=hacked&preset=yearly&from=2026-13&minAmount=-5&customer=xyz&q=' + 'a'.repeat(300)).filters;
    expect(f).toMatchObject({ status: '', preset: 'all', customStart: '', minAmount: '', customerId: '' });
    expect(f.search).toHaveLength(100);
  });

  it('round-trips through the URL, including clearing a filter the view had set', () => {
    for (const key of Object.keys(BILL_VIEWS)) {
      const { view, filters } = read(billsViewHref(key));
      const changed = { ...filters, status: '', preset: 'custom' as const, customStart: '2026-11-01', customEnd: '2026-11-14', minAmount: '500' };
      expect(read('?' + writeBillsQuery(view, changed)).filters).toEqual(changed);
    }
  });

  it('lists active filters with what each clear resets', () => {
    const chips = activeFilters({ ...DEFAULT_FILTERS, preset: 'month', status: 'due', minAmount: '500', customerId: 'a'.repeat(24) }, 'Om J');
    expect(chips.map((c) => c.label)).toEqual(['Date: This month', 'Status: Unpaid or partial', 'Customer: Om J', 'Amount: ≥ ₹500']);
    expect(chips[0].clear).toEqual({ preset: 'all', customStart: '', customEnd: '' });
    expect(activeFilters(DEFAULT_FILTERS)).toEqual([]);
  });
});
