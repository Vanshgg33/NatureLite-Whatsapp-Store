import { BillingService, billDateMatch, billsSummary } from './billing.service';

function make() {
  const chain = (v: any) => { const c: any = {}; ['setOptions', 'sort', 'skip', 'limit'].forEach((k) => { c[k] = () => c; }); c.lean = () => Promise.resolve(v); return c; };
  const agg = (v: any) => ({ option: jest.fn(() => Promise.resolve(v)) });
  const billModel: any = {
    find: jest.fn(() => chain([{ _id: 'b1' }])),
    countDocuments: jest.fn(() => ({ setOptions: () => Promise.resolve(3) })),
    aggregate: jest.fn()
      .mockReturnValueOnce(agg([{ total: 3000, collected: 1200.5, due: 1799.5, customers: ['c1', 'c2'] }]))
      .mockReturnValueOnce(agg([{ _id: 'Store Order', total: 2000, count: 2 }, { _id: null, total: 1000, count: 1 }])),
  };
  const svc = new (BillingService as any)({}, billModel) as BillingService;
  return { svc, billModel };
}

describe('Bills list filters behind the dashboard cards', () => {
  it('"due" means unpaid or partial; amount range filters the bill total', async () => {
    const { svc, billModel } = make();
    await svc.getBills({ paymentStatus: 'due', minAmount: '500', maxAmount: '2000' });
    const q = billModel.find.mock.calls[0][0];
    expect(q.paymentStatus).toEqual({ $in: ['unpaid', 'partial'] });
    expect(q.grandTotal).toEqual({ $gte: 500, $lte: 2000 });
    // the summary is computed over the same filter, not one page
    expect(billModel.aggregate.mock.calls[0][0][0]).toEqual({ $match: q });
  });

  it('ignores empty or non-numeric amounts; "0" is a real minimum', async () => {
    const a = make();
    await a.svc.getBills({ minAmount: '', maxAmount: 'abc' });
    expect(a.billModel.find.mock.calls[0][0].grandTotal).toBeUndefined();
    const b = make();
    await b.svc.getBills({ minAmount: '0' });
    expect(b.billModel.find.mock.calls[0][0].grandTotal).toEqual({ $gte: 0 });
  });

  it('returns totals, customers, average, collection rate and channel split for all matches', async () => {
    const { svc } = make();
    const r: any = await svc.getBills({ startDate: '2026-11-01T00:00:00.000Z' });
    expect(r.summary).toEqual({
      count: 3, total: 3000, collected: 1200.5, due: 1799.5, customers: 2, avgBill: 1000, collectionRate: 40,
      byChannel: [{ channel: 'Store Order', total: 2000, count: 2 }, { channel: 'No channel', total: 1000, count: 1 }],
    });
  });
});

describe('billsSummary / billDateMatch', () => {
  it('no matches → zeros, no collection rate', () => {
    expect(billsSummary(0, undefined, [])).toEqual({ count: 0, total: 0, collected: 0, due: 0, customers: 0, avgBill: 0, collectionRate: null, byChannel: [] });
  });
  it('dates by invoice date, legacy bills by createdAt (same rule as the list and reports)', () => {
    const r = { $gte: new Date('2026-11-01') };
    expect(billDateMatch(r)).toEqual({ $or: [{ invoiceDate: r }, { invoiceDate: null, createdAt: r }, { invoiceDate: { $exists: false }, createdAt: r }] });
  });
});
