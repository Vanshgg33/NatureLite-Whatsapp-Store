import { diffBill } from './bill-edit-diff';

const ghee = { productId: 'p1', name: 'A2 GHEE', qty: 1, rate: 1459, discountPct: 0, gstRate: 5, total: 145900 };
const oil = { productId: 'p2', name: 'Groundnut Oil', qty: 2, rate: 450, discountPct: 0, gstRate: 5, total: 90000 };
const base = {
  invoiceDate: '2026-11-14T13:32:00Z', customerName: 'Om J', orderTag: 'Store Order', notes: 'testingasd',
  items: [ghee], charges: [], grandTotalPaise: 145900, amountPaidPaise: 0, amountDuePaise: 145900, roundOffPaise: 0,
};

describe('diffBill', () => {
  it('no change → nothing recorded', () => expect(diffBill(base, { ...base })).toEqual([]));

  it('lists changed fields with before and after', () => {
    const after = {
      ...base, notes: 'call before delivery', items: [{ ...ghee, qty: 2, total: 291800 }, oil],
      grandTotalPaise: 381800, amountPaidPaise: 100000, amountDuePaise: 281800,
    };
    const c = diffBill(base, after);
    expect(c).toEqual(expect.arrayContaining([
      { field: 'notes', label: 'Notes', from: 'testingasd', to: 'call before delivery' },
      { field: 'items', label: 'Item: A2 GHEE', from: '1 × ₹1459.00 = ₹1459.00, GST 5%', to: '2 × ₹1459.00 = ₹2918.00, GST 5%' },
      { field: 'items', label: 'Item added: Groundnut Oil', from: '—', to: '2 × ₹450.00 = ₹900.00' },
      { field: 'grandTotalPaise', label: 'Grand total', from: '₹1459.00', to: '₹3818.00' },
      { field: 'amountPaidPaise', label: 'Amount paid', from: '₹0.00', to: '₹1000.00' },
    ]));
    expect(c.find((x) => x.field === 'customerName')).toBeUndefined();
  });

  it('records removed items and blank ↔ text as a change, whitespace as blank', () => {
    const c = diffBill({ ...base, items: [ghee, oil], terms: '  ' }, { ...base, terms: '' });
    expect(c).toEqual([{ field: 'items', label: 'Item removed: Groundnut Oil', from: '2 × ₹450.00 = ₹900.00', to: '—' }]);
  });
});
