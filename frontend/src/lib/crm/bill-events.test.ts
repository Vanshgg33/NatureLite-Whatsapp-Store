import { describe, it, expect } from 'vitest';
import { billEvents } from './bill-events';

const bill = (over: any = {}) => ({
  _id: 'b1', invoiceNo: 'NLF-1', createdAt: '2026-11-01T10:00:00Z', status: 'active', docType: 'SALE',
  grandTotal: 1000.5, amountPaid: 0, amountDue: 1000.5, payments: [], ...over,
});

describe('billEvents', () => {
  it('unpaid bill: one purchase event, nothing paid at billing', () => {
    const ev = billEvents([bill()]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ _type: 'bill', _id: 'bill-b1', paidAtBilling: 0 });
  });

  it('partial then full payment: later payments become events with the balance left after each (exact paise)', () => {
    const ev = billEvents([bill({
      amountPaid: 1000.5, amountDue: 0, paymentStatus: 'paid',
      payments: [
        { kind: 'LATER', mode: 'cash', amountPaise: 50000, at: '2026-11-05T10:00:00Z' }, // out of order on purpose
        { kind: 'INITIAL', mode: 'upi', amountPaise: 20000, at: '2026-11-01T10:00:00Z' },
        { kind: 'LATER', mode: 'upi', amountPaise: 30050, at: '2026-11-09T10:00:00Z' },
      ],
    })]);
    expect(ev[0]).toMatchObject({ _type: 'bill', paidAtBilling: 200 });
    const pays = ev.filter(e => e._type === 'payment') as any[];
    expect(pays.map(p => [p.amount, p.mode, p.dueAfter])).toEqual([[500, 'cash', 300.5], [300.5, 'upi', 0]]);
    expect(new Set(ev.map(e => e._id)).size).toBe(ev.length); // stable, unique React keys
  });

  it('legacy bill without a payments array: everything paid counts as paid at billing, no payment events', () => {
    const ev = billEvents([bill({ amountPaid: 400, payments: undefined })]);
    expect(ev).toEqual([expect.objectContaining({ _type: 'bill', paidAtBilling: 400 })]);
  });

  it('cancelled bill adds a cancellation event at its audit time; without one, only the (flagged) bill shows', () => {
    const ev = billEvents([bill({ status: 'cancelled', cancelledAt: '2026-11-02T08:00:00Z', cancelReason: 'wrong item' })]);
    expect(ev.map(e => e._type)).toEqual(['bill', 'cancel']);
    expect(ev[1].createdAt).toBe('2026-11-02T08:00:00Z');
    expect(billEvents([bill({ status: 'cancelled', cancelledAt: null })]).map(e => e._type)).toEqual(['bill']);
  });

  it('several bills including a credit note: each bill produces its own events', () => {
    const ev = billEvents([bill(), bill({ _id: 'b2', docType: 'CREDIT_NOTE', grandTotal: 200, refInvoiceNo: 'NLF-1' })]);
    expect(ev.map(e => e._id)).toEqual(['bill-b1', 'bill-b2']);
    expect(ev[1].bill.docType).toBe('CREDIT_NOTE');
  });
});
