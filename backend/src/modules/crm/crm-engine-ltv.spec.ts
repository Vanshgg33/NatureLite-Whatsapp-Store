import { CrmEngineService, netLtv } from './crm-engine.service';

describe('netLtv', () => {
  it('purchases minus returns, exact to the paisa, never negative', () => {
    expect(netLtv([{ total: 1000.1 }, { total: 0.2 }], [{ grandTotal: 300.1 }])).toBe(700.2);
    expect(netLtv([{ total: 100 }], [{ grandTotal: 250 }])).toBe(0);
    expect(netLtv([], [])).toBe(0);
    expect(netLtv([{ total: undefined }, { total: 50 }], [{ grandTotal: undefined }])).toBe(50);
  });
});

describe('CrmEngineService.refreshUser LTV', () => {
  const lean = (v: any) => ({ lean: () => Promise.resolve(v) });
  function make(orders: any[], sales: any[], creditNotes: any[], refundPayments: any[] = []) {
    const cnQuery = { setOptions: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(creditNotes) };
    const billModel = { aggregate: jest.fn().mockResolvedValue(sales), find: jest.fn(() => cnQuery) };
    const statsModel = { findOne: () => ({ select: () => lean(null) }), findOneAndUpdate: jest.fn().mockResolvedValue({}) };
    const settingsModel = { findOne: () => lean(null) };
    const logicSetModel = { findOne: () => ({ sort: () => lean(null) }) };
    const userModel = { findById: () => ({ select: () => lean({ name: 'Asha', phone: '919876543210' }) }) };
    const orderModel = { aggregate: jest.fn().mockResolvedValue(orders) };
    const paymentModel = { find: jest.fn(() => ({ select: () => lean(refundPayments) })) };
    const svc = new (CrmEngineService as any)(statsModel, settingsModel, {}, orderModel, userModel, billModel, logicSetModel, paymentModel) as CrmEngineService;
    return { svc, billModel, cnQuery, statsModel, orderModel };
  }
  const uid = '64b7f0c2a1b2c3d4e5f60718';
  const day = (d: number) => new Date(Date.UTC(2026, 10, d));

  it('online orders + store bills, minus active credit notes (returns/refunds)', async () => {
    const { svc, billModel, cnQuery, statsModel } = make(
      [{ createdAt: day(1), total: 500, items: [] }],
      [{ createdAt: day(5), total: 1200, items: [] }, { createdAt: day(9), total: 800, items: [] }],
      [{ grandTotal: 300 }, { grandTotal: 200 }],
    );
    await svc.refreshUser(uid);
    // credit notes: only this customer's, only active (a cancelled return no longer reduces LTV), opted past the sales-only hook
    expect(String((billModel.find.mock.calls[0] as any[])[0].customerId)).toBe(uid);
    expect((billModel.find.mock.calls[0] as any[])[0]).toMatchObject({ status: 'active', docType: 'CREDIT_NOTE' });
    expect(cnQuery.setOptions).toHaveBeenCalledWith({ allDocTypes: true });
    // sales: only active bills count (cancelled excluded)
    expect(billModel.aggregate.mock.calls[0][0][0].$match).toMatchObject({ status: 'active' });
    const set = statsModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.ltv).toBe(2000); // 500 + 1200 + 800 - 300 - 200
    expect(set.aov).toBe(667);  // net LTV over 3 purchases
  });

  it('refreshing twice gives the same LTV (recomputed from source, never accumulated)', async () => {
    const { svc, statsModel } = make([], [{ createdAt: day(5), total: 1000, items: [] }], [{ grandTotal: 250 }]);
    await svc.refreshUser(uid);
    await svc.refreshUser(uid);
    const [a, b] = statsModel.findOneAndUpdate.mock.calls.map((c: any) => c[1].$set.ltv);
    expect([a, b]).toEqual([750, 750]);
  });

  it('a partly refunded online order counts net of the refund; a fully refunded one drops out entirely', async () => {
    const { svc, statsModel, orderModel } = make(
      [
        { _id: 'o1', status: 'refunded', createdAt: day(2), total: 1000, items: [] },
        { _id: 'o2', status: 'refunded', createdAt: day(3), total: 600, items: [] },
        { _id: 'o3', status: 'delivered', createdAt: day(4), total: 400, items: [] },
      ],
      [], [],
      [{ order: 'o1', amount: 1000, refundAmount: 150 }, { order: 'o2', amount: 600, refundAmount: 600 }],
    );
    await svc.refreshUser(uid);
    const set = statsModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.ltv).toBe(1250); // 1000 - 150 + 400; o2 fully refunded
    expect(set.aov).toBe(625);  // over the 2 orders that still count
    const pipeline = orderModel.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.$or).toBeDefined(); // shared purchase definition, not just 'delivered'
    // orders / bills with no line items are still counted (the history lists them)
    expect(pipeline.find((st: any) => st.$unwind && (st.$unwind.path ?? st.$unwind) === '$items').$unwind.preserveNullAndEmptyArrays).toBe(true);
  });
});
