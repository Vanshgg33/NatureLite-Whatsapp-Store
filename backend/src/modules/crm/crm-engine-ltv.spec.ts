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
    expect(set.aov).toBe(666.67);  // net LTV over 3 purchases, to the paisa
    expect(set.validOrders).toBe(3);
    expect(set.aovSegment).toBe('aov_below_1000');
  });

  it('a store bill fully returned by its credit notes is no longer a valid order; a partly returned one still is', async () => {
    const { svc, statsModel } = make(
      [],
      [
        { invoiceNo: 'NLF-1', createdAt: day(5), total: 3000, items: [] }, // fully returned in two credit notes
        { invoiceNo: 'NLF-2', createdAt: day(6), total: 2500, items: [] }, // partly returned
        { invoiceNo: 'NLF-3', createdAt: day(7), total: 1500, items: [] },
      ],
      [{ grandTotal: 1000, refInvoiceNo: 'NLF-1' }, { grandTotal: 2000, refInvoiceNo: 'NLF-1' }, { grandTotal: 500, refInvoiceNo: 'NLF-2' }, { grandTotal: 100 }],
    );
    await svc.refreshUser(uid);
    const set = statsModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.ltv).toBe(3400);         // 7000 - 3000 - 500 - 100: each credit note subtracted exactly once
    expect(set.validOrders).toBe(2);    // NLF-2 and NLF-3
    expect(set.aov).toBe(1700);
    expect(set.aovSegment).toBe('aov_1000_1999');
  });

  it('every purchase returned or refunded: no valid orders, so no AOV segment', async () => {
    const { svc, statsModel } = make([], [{ invoiceNo: 'NLF-9', createdAt: day(5), total: 999.5, items: [] }], [{ grandTotal: 999.5, refInvoiceNo: 'NLF-9' }]);
    await svc.refreshUser(uid);
    const set = statsModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set).toMatchObject({ segment: 'no_orders', ltv: 0, validOrders: 0, aovSegment: null });
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
    expect(set.validOrders).toBe(2);
    const pipeline = orderModel.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.$or).toBeDefined(); // shared purchase definition, not just 'delivered'
    // orders / bills with no line items are still counted (the history lists them)
    expect(pipeline.find((st: any) => st.$unwind && (st.$unwind.path ?? st.$unwind) === '$items').$unwind.preserveNullAndEmptyArrays).toBe(true);
  });
});

describe('CrmEngineService.refreshAll (historical recalculation)', () => {
  const lean = (v: any) => ({ lean: () => Promise.resolve(v) });
  it('recalculates every customer in batches of at most 50, and zeroes the rank of customers whose LTV fell to 0', async () => {
    const users = Array.from({ length: 120 }, (_, i) => ({ _id: `u${i}` }));
    const statsModel = {
      find: () => ({ select: () => lean([]) }),
      updateOne: jest.fn(), updateMany: jest.fn().mockResolvedValue({}), aggregate: jest.fn().mockResolvedValue([]),
    };
    const runModel = { create: jest.fn().mockResolvedValue({ _id: 'r1' }), updateOne: jest.fn().mockResolvedValue({}) };
    const svc: any = new (CrmEngineService as any)(statsModel, { findOne: () => lean(null) }, runModel, {}, { find: () => ({ select: () => lean(users) }) }, {}, { findOne: () => ({ sort: () => lean(null) }) }, {});
    let running = 0, peak = 0; const done: string[] = [];
    svc.refreshUser = jest.fn(async (id: string) => { running++; peak = Math.max(peak, running); await new Promise(r => setImmediate(r)); running--; done.push(id); });
    await svc.refreshAll('manual');
    expect(done).toHaveLength(120);
    expect(peak).toBeLessThanOrEqual(50);
    expect(statsModel.updateMany).toHaveBeenCalledWith({ ltv: { $lte: 0 }, ltvPct: { $ne: 0 } }, { $set: { ltvPct: 0 } });
    expect(runModel.updateOne.mock.calls[0][1].$set.customersProcessed).toBe(120);
  });
});

describe('CrmEngineService.needsCatchUp (missed 2 AM run)', () => {
  const H = 3_600_000, now = Date.UTC(2026, 10, 20, 12);
  const make = (count: number, last: any, unsegmented = false) => new (CrmEngineService as any)(
    { countDocuments: () => Promise.resolve(count), exists: () => Promise.resolve(unsegmented ? { _id: 'x' } : null) }, {},
    { findOne: () => ({ sort: () => ({ select: () => ({ lean: () => Promise.resolve(last) }) }) }) },
  ) as CrmEngineService;

  it.each([
    ['no stats yet', 0, { startedAt: now - H, finishedAt: now - H }, true],
    ['never ran', 10, null, true],
    ['last full run 3 days ago (server asleep at 2 AM)', 10, { startedAt: now - 72 * H, finishedAt: now - 72 * H }, true],
    ['ran last night', 10, { startedAt: now - 10 * H, finishedAt: now - 10 * H }, false],
    ['a run started 10 min ago is still going: do not start another', 10, { startedAt: now - H / 6 }, false],
    ['a run started 5h ago never finished (crashed)', 10, { startedAt: now - 5 * H }, true],
  ])('%s', async (_label, count, last, want) => {
    expect(await make(count as number, last).needsCatchUp(now)).toBe(want);
  });

  it('ran last night but some customers have no AOV segment yet (first deploy): backfill now', async () => {
    expect(await make(10, { startedAt: now - 10 * H, finishedAt: now - 10 * H }, true).needsCatchUp(now)).toBe(true);
    expect(await make(10, { startedAt: now - H / 6 }, true).needsCatchUp(now)).toBe(false); // never start a second concurrent run
  });
});
