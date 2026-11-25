import { Types } from 'mongoose';
import { CashDrawerService, DrawerError } from './cash-drawer.service';
import { DEFAULT_DENOMS } from './cash-drawer.schema';

// chainable query stub: .session().lean().select().sort().limit() all resolve to v
const q = (v: any): any => {
  const p: any = Promise.resolve(v);
  for (const k of ['session', 'lean', 'select', 'sort', 'limit', 'setOptions']) p[k] = () => q(v);
  return p;
};
const STORE = new Types.ObjectId().toString();
const denoms = DEFAULT_DENOMS.map(d => ({ ...d }));
const drawerDoc = (over: any = {}) => ({
  _id: new Types.ObjectId(), storeId: new Types.ObjectId(STORE), mode: 'SOFT', denoms, initialisedAt: new Date(), version: 3,
  counts: { N500: 4, N200: 3, N100: 10, N50: 10, N20: 10, N10: 10, C10: 20, C5: 20, C2: 20, C1: 20 }, ...over,
});

function make(drawer: any = drawerDoc(), opts: { fresh?: any; updated?: any; dup?: any; txnRows?: any[] } = {}) {
  const drawers: any = {
    findOne: jest.fn(() => q(drawer)),
    findById: jest.fn(() => q(opts.fresh ?? drawer)),
    findOneAndUpdate: jest.fn(() => q(opts.updated === undefined ? { ...drawer, version: drawer.version + 1 } : opts.updated)),
    updateOne: jest.fn(() => q({})),
  };
  const txns: any = {
    findOne: jest.fn(() => q(opts.dup ?? null)),
    create: jest.fn(async (rows: any[]) => rows.map(r => ({ _id: 't1', ...r }))),
    find: jest.fn(() => q(opts.txnRows ?? [])),
    exists: jest.fn(async () => null),
    countDocuments: jest.fn(async () => 0),
  };
  const conn: any = { transaction: jest.fn(async (fn: any) => fn('SESSION')) };
  const svc = new CashDrawerService(drawers, txns, { create: jest.fn(async () => ({})) } as any, conn);
  return { svc, drawers, txns, conn };
}
const code = async (p: Promise<any>) => p.then(() => 'OK', (e: any) => (e instanceof DrawerError ? e.code : e.message));

describe('CashDrawerService.planSale (server authority)', () => {
  const base = { storeId: STORE, docType: 'SALE', upiPaise: 0, grandTotalPaise: 318000 };

  it('Om scenario: 5x500 + 10x100 for 3180, change 200+100+20 -> BILL_SALE', async () => {
    const { svc } = make();
    const plan = await svc.planSale({ ...base, cashPaise: 318000, cash: { received: { N500: 5, N100: 10 }, returned: { N200: 1, N100: 1, N20: 1 } } });
    // 3500 in, 320 back = 3180 due; bill total and cash due go on the ledger row
    expect(plan).toEqual({ type: 'BILL_SALE', received: { N500: 5, N100: 10 }, returned: { N200: 1, N100: 1, N20: 1 }, billTotalRupees: 3180, cashDueRupees: 3180 });
  });

  it('drawer off / missing / sale order / pure UPI: no drawer step', async () => {
    expect(await make(null).svc.planSale({ ...base, cashPaise: 318000, cash: undefined })).toBeNull();
    expect(await make().svc.planSale({ ...base, docType: 'SALE_ORDER', cashPaise: 318000, cash: undefined })).toBeNull();
    expect(await make().svc.planSale({ ...base, upiPaise: 318000, cashPaise: 0, cash: undefined })).toBeNull();
    expect(await make().svc.planSale({ ...base, storeId: undefined, cashPaise: 100, cash: undefined })).toBeNull();
  });

  it.each([
    ['CASH_BLOCK_REQUIRED', { cashPaise: 318000, cash: undefined }],
    ['CASH_PAYMENT_MISMATCH', { cashPaise: 350000, cash: { received: { N500: 5, N100: 10 }, returned: { N200: 1, N100: 1, N20: 1 } } }],
    ['CHANGE_MISMATCH', { cashPaise: 318000, cash: { received: { N500: 5, N100: 10 }, returned: { N200: 1 } } }],
    ['BAD_COUNTS', { cashPaise: 318000, cash: { received: { N500: -5 }, returned: {} } }],
    ['BAD_COUNTS', { cashPaise: 318000, cash: { received: 'x', returned: {} } }],
    ['INACTIVE_DENOMINATION', { cashPaise: 318000, cash: { received: { N2000: 2 }, returned: { N500: 1, N200: 1, N100: 1, N20: 1 } } }],
    ['SKIP_REASON_REQUIRED', { cashPaise: 318000, cash: { skip: { reason: '  ' } } }],
    ['UPI_EXCEEDS_TOTAL', { upiPaise: 400000, cashPaise: 0, cash: { received: {}, returned: {} } }],
  ])('%s', async (c, over: any) => {
    expect(await code(make().svc.planSale({ ...base, ...over }))).toBe(c);
  });

  it('change the drawer does not hold -> 409 with fresh counts', async () => {
    const { svc } = make(drawerDoc({ counts: { N500: 4 } }));
    const err: any = await svc.planSale({ ...base, cashPaise: 318000, cash: { received: { N500: 5, N100: 10 }, returned: { N200: 1, N100: 1, N20: 1 } } }).catch(e => e);
    expect([err.code, err.getStatus(), err.details.counts]).toEqual(['DRAWER_STOCK_INSUFFICIENT', 409, { N500: 4 }]);
  });

  it('SOFT skip with reason -> UNCOUNTED_SALE; HARD refuses the skip', async () => {
    expect(await make().svc.planSale({ ...base, cashPaise: 318000, cash: { skip: { reason: 'rush' } } })).toEqual({ type: 'UNCOUNTED_SALE', reason: 'rush', billTotalRupees: 3180 });
    expect(await code(make(drawerDoc({ mode: 'HARD' })).svc.planSale({ ...base, cashPaise: 318000, cash: { skip: { reason: 'rush' } } }))).toBe('COUNTING_REQUIRED');
  });

  it('short cash: applied = received, rest stays due', async () => {
    const plan = await make().svc.planSale({ ...base, cashPaise: 100000, cash: { received: { N500: 2 }, returned: {} } });
    expect(plan?.type).toBe('BILL_SALE');
  });

  it('paise bill: counter works on whole rupees (318040 paise -> 3180 due)', async () => {
    const plan = await make().svc.planSale({ ...base, grandTotalPaise: 318040, cashPaise: 318000, cash: { received: { N500: 5, N100: 10 }, returned: { N200: 1, N100: 1, N20: 1 } } });
    expect(plan?.type).toBe('BILL_SALE');
  });

  it('credit note with cash is refused while the drawer is on', async () => {
    expect(await code(make().svc.planSale({ ...base, docType: 'CREDIT_NOTE', cashPaise: 100, cash: undefined }))).toBe('CREDIT_NOTE_CASH_BLOCKED');
  });
});

describe('CashDrawerService.applyCashTxn', () => {
  it('guards every denomination that goes down with $gte and writes the ledger row', async () => {
    const d = drawerDoc();
    const { svc, drawers, txns } = make(d);
    await svc.applyCashTxn('S' as any, { storeId: STORE, type: 'BILL_SALE', received: { N500: 5, N100: 10 }, returned: { N200: 1, N100: 1, N20: 1 }, clientRequestId: 'req-12345678', user: { userId: 'u1' } });
    const [filter, update] = drawers.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: d._id, 'counts.N200': { $gte: 1 }, 'counts.N20': { $gte: 1 } });
    expect(update.$inc).toEqual({ version: 1, 'counts.N500': 5, 'counts.N100': 9, 'counts.N200': -1, 'counts.N20': -1 });
    const row = txns.create.mock.calls[0][0][0];
    expect([row.type, row.seq, row.netRupees, row.delta]).toEqual(['BILL_SALE', 4, 3180, { N500: 5, N100: 9, N200: -1, N20: -1 }]);
  });

  it('guard miss -> 409 DRAWER_STOCK_INSUFFICIENT with fresh counts, nothing written', async () => {
    const { svc, txns } = make(drawerDoc(), { updated: null, fresh: { counts: { N200: 0 } } });
    const err: any = await svc.applyCashTxn('S' as any, { storeId: STORE, type: 'BILL_SALE', received: {}, returned: { N200: 1 }, user: { userId: 'u1' } }).catch(e => e);
    expect([err.code, err.details]).toEqual(['DRAWER_STOCK_INSUFFICIENT', { counts: { N200: 0 } }]);
    expect(txns.create).not.toHaveBeenCalled();
  });

  it('replayed request id returns the first row and does not touch the counts', async () => {
    const { svc, drawers } = make(drawerDoc(), { dup: { _id: 'old' } });
    const r = await svc.applyCashTxn('S' as any, { storeId: STORE, type: 'BILL_SALE', received: { N500: 1 }, clientRequestId: 'req-12345678', user: { userId: 'u1' } });
    expect(r.replayed).toBe(true);
    expect(drawers.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses an uninitialised drawer', async () => {
    expect(await code(make(drawerDoc({ initialisedAt: null })).svc.applyCashTxn('S' as any, { storeId: STORE, type: 'BILL_SALE', user: { userId: 'u' } }))).toBe('DRAWER_NOT_INITIALISED');
  });
});

describe('CashDrawerService.withCash', () => {
  it('runs the work and the drawer step in one transaction; a drawer failure fails the whole thing', async () => {
    const { svc, conn } = make(drawerDoc(), { updated: null });
    const work = jest.fn(async () => 'bill');
    const plan = { type: 'BILL_SALE' as const, returned: { N200: 1 } };
    await expect(svc.withCash(plan, { storeId: STORE, billId: new Types.ObjectId(), user: { userId: 'u' } }, work)).rejects.toBeInstanceOf(DrawerError);
    expect(conn.transaction).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith('SESSION');
  });
  it('no plan: plain call, no transaction (drawer off = today)', async () => {
    const { svc, conn } = make();
    expect(await svc.withCash(null, {} as any, async s => s ?? 'none')).toBe('none');
    expect(conn.transaction).not.toHaveBeenCalled();
  });
});

describe('CashDrawerService.planRefund / planPayment', () => {
  it('cancel of a counted bill needs the exact refund in notes', async () => {
    const { svc } = make(drawerDoc(), { txnRows: [{ netRupees: 3180 }, { netRupees: 200 }] });
    const billId = new Types.ObjectId();
    expect(await code(svc.planRefund({ storeId: STORE, billId, cash: undefined }))).toBe('CASH_REFUND_REQUIRED');
    expect(await code(svc.planRefund({ storeId: STORE, billId, cash: { returned: { N500: 6 } } }))).toBe('REFUND_MISMATCH');
    expect(await svc.planRefund({ storeId: STORE, billId, cash: { returned: { N500: 6, N200: 1, N100: 1, N50: 1, N20: 1, N10: 1 } } }))
      .toEqual({ type: 'BILL_REFUND', returned: { N500: 6, N200: 1, N100: 1, N50: 1, N20: 1, N10: 1 } });
  });
  it('a bill with no counted cash cancels as today', async () => {
    expect(await make(drawerDoc(), { txnRows: [] }).svc.planRefund({ storeId: STORE, billId: new Types.ObjectId(), cash: undefined })).toBeNull();
  });
  it('payment: change from a 500 for a 120 due', async () => {
    const { svc } = make();
    expect(await svc.planPayment({ storeId: STORE, amountPaise: 12000, mode: 'cash', cash: { received: { N500: 1 }, returned: { N200: 1, N100: 1, N50: 1, N20: 1, N10: 1 } } }))
      .toMatchObject({ type: 'BILL_PAYMENT' });
    expect(await svc.planPayment({ storeId: STORE, amountPaise: 12000, mode: 'upi', cash: undefined })).toBeNull();
  });
});

describe('Cash received / change returned record', () => {
  it('split payment: only the cash part must be covered; the row keeps bill total, cash due and both sides', async () => {
    // 3180 bill, 1180 by UPI -> 2000 cash due; customer gives 5x500, gets one 500 back
    const plan = await make().svc.planSale({ storeId: STORE, docType: 'SALE', grandTotalPaise: 318000, upiPaise: 118000, cashPaise: 200000, cash: { received: { N500: 5 }, returned: { N500: 1 } } });
    expect(plan).toEqual({ type: 'BILL_SALE', received: { N500: 5 }, returned: { N500: 1 }, billTotalRupees: 3180, cashDueRupees: 2000 });
    const { svc, txns } = make();
    await svc.applyCashTxn('S' as any, { ...plan!, storeId: STORE, invoiceNo: 'NLF-1', user: { userId: 'u1' } });
    const row = txns.create.mock.calls[0][0][0];
    expect([row.received, row.returned, row.netRupees, row.billTotalRupees, row.cashDueRupees, row.invoiceNo]).toEqual([{ N500: 5 }, { N500: 1 }, 2000, 3180, 2000, 'NLF-1']);
  });

  it('change that does not add up to what is due back is refused before anything is written', async () => {
    const { svc, txns } = make();
    expect(await code(svc.planSale({ storeId: STORE, docType: 'SALE', grandTotalPaise: 318000, upiPaise: 0, cashPaise: 318000, cash: { received: { N500: 7 }, returned: { N100: 1 } } }))).toBe('CHANGE_MISMATCH');
    expect(txns.create).not.toHaveBeenCalled();
  });

  it('ledger rows are timestamped by the server (createdAt, never updated)', () => {
    const { CashDrawerTxnSchema } = jest.requireActual('./cash-drawer.schema');
    expect(CashDrawerTxnSchema.get('timestamps')).toEqual({ createdAt: true, updatedAt: false });
  });
});

describe('CashDrawerService.listTxns filters', () => {
  const userId = new Types.ObjectId().toString();
  const rows = [
    { seq: 2, type: 'BILL_SALE', invoiceNo: 'NLF-26-27/5', received: { N500: 1 }, returned: { N100: 1 }, balanceAfter: { N500: 9, N100: 3, N200: 20 }, createdBy: { userId }, createdAt: new Date() },
  ];
  function mk() {
    const m = make(drawerDoc(), { txnRows: rows });
    const adminFind = jest.fn(() => q([{ _id: userId, name: 'Asha' }]));
    m.conn.models = { AdminUser: { find: adminFind } };
    return { ...m, adminFind };
  }

  it('low filter: any active denomination at or below its Min in the balance after (missing count = 0)', async () => {
    const { svc, txns } = mk();
    const res: any = await svc.listTxns(STORE, { low: '1' });
    const f = txns.find.mock.calls[0][0];
    expect(f.$and[0].$or).toContainEqual({ 'balanceAfter.N100': { $not: { $gt: 10 } } });
    expect(f.$and[0].$or).not.toContainEqual(expect.objectContaining({ 'balanceAfter.N2000': expect.anything() })); // inactive
    // which ones exactly: N100 (3 <= 10) and every active one not in the drawer at all; N500 9 > 2 and N200 20 > 2 are fine
    expect(res.rows[0].lowAfter).toEqual(expect.arrayContaining(['N100', 'N50', 'C1']));
    expect(res.rows[0].lowAfter).not.toContain('N500');
    expect(res.rows[0].lowAfter).not.toContain('N200');
  });

  it('shows cash received, change returned and the operator name', async () => {
    const res: any = await mk().svc.listTxns(STORE, {});
    expect(res.rows[0]).toMatchObject({ receivedRupees: 500, returnedRupees: 100, operator: 'Asha' });
  });

  it('bill reference and user filters are literal (regex characters escaped)', async () => {
    const { svc, txns, adminFind } = mk();
    await svc.listTxns(STORE, { ref: 'NLF-26-27/5 (', user: 'As.a' });
    const f = txns.find.mock.calls[0][0];
    expect(f.invoiceNo).toEqual({ $regex: 'NLF-26-27/5 \\(', $options: 'i' });
    expect((adminFind.mock.calls[0] as any[])[0].$or[0].name.$regex).toBe('As\\.a');
    expect(f.$and[0].$or[1]).toEqual({ 'createdBy.userId': { $in: ['As.a', userId] } });
  });

  it('CSV carries bill total, cash due, received, change and low denominations', async () => {
    const csv: any = await mk().svc.listTxns(STORE, { format: 'csv' });
    expect(csv.split('\n')[0]).toContain('bill_total,cash_due,cash_received,change_returned');
    expect(csv.split('\n')[1]).toContain('Asha');
  });
});

describe('CashDrawerService.verify', () => {
  it('rebuilds counts from the ledger and finds gaps', async () => {
    const d = drawerDoc({ counts: { N500: 5 }, version: 3 });
    const ok = await make(d, { txnRows: [{ seq: 1, delta: { N500: 4 } }, { seq: 2, delta: { N500: 2 } }, { seq: 3, delta: { N500: -1 } }] }).svc.verify(STORE);
    expect(ok.ok).toBe(true);
    const bad = await make(d, { txnRows: [{ seq: 1, delta: { N500: 4 } }, { seq: 3, delta: { N500: 2 } }] }).svc.verify(STORE);
    expect([bad.ok, bad.gaps, bad.mismatches]).toEqual([false, [3], ['N500']]);
  });
});
