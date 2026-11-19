import { normalisePhone, groupDuplicatePhones, CrmFoundationService } from './crm-foundation.service';

describe('crm foundation helpers', () => {
  it('normalises Indian phone formats to 10 digits', () => {
    for (const p of ['9876543210', '+91 98765-43210', '919876543210', '09876543210']) expect(normalisePhone(p)).toBe('9876543210');
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
  });

  it('groups only real duplicates', () => {
    const g = groupDuplicatePhones([
      { phone: '9876543210' }, { phone: '+919876543210' }, { phone: '9000000001' }, { phone: '' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].phone).toBe('9876543210');
    expect(g[0].users).toHaveLength(2);
  });
});

describe('CrmFoundationService.listOrders', () => {
  const make = () => {
    const find = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
    const orderModel: any = { find: jest.fn(() => find), countDocuments: jest.fn().mockResolvedValue(0) };
    return { orderModel, svc: new CrmFoundationService(orderModel, {} as any, {} as any, {} as any) };
  };

  it('escapes regex characters in search so input cannot break the query', async () => {
    const { svc, orderModel } = make();
    await svc.listOrders({ search: '.*(' });
    const re: RegExp = orderModel.find.mock.calls[0][0].$or[0].orderNumber;
    expect(re.test('ABC')).toBe(false);
    expect(re.test('x.*(')).toBe(true);
  });

  it('caps limit at 100 and rejects invalid dates without querying', async () => {
    const { svc, orderModel } = make();
    expect((await svc.listOrders({ limit: 5000 })).limit).toBe(100);
    expect((await svc.listOrders({ from: 'garbage' })).items).toEqual([]);
    expect(orderModel.find).toHaveBeenCalledTimes(1);
  });
});

describe('CrmFoundationService store bills (read live from BillingBill)', () => {
  const make = () => {
    const q = { setOptions: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
    const billModel: any = { find: jest.fn(() => q) };
    const logs = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
    const auditModel: any = { find: jest.fn(() => logs) };
    return { q, logs, auditModel, billModel, svc: new CrmFoundationService({} as any, {} as any, billModel, auditModel) };
  };
  const uid = '64b7f0c2a1b2c3d4e5f60718';

  it('customer history: links by the real customer ObjectId, keeps sales + credit notes (incl. cancelled), skips sale orders', async () => {
    const { svc, billModel, q } = make();
    await svc.customerBills(uid);
    const filter = billModel.find.mock.calls[0][0];
    expect(String(filter.customerId)).toBe(uid);
    expect(filter.customerId.constructor.name).toBe('ObjectId');
    expect(filter.docType.$in).toEqual(['SALE', 'CREDIT_NOTE', null]);
    expect(filter.status).toBeUndefined(); // cancelled bills stay in the history, flagged in the UI
    expect(q.setOptions).toHaveBeenCalledWith({ allDocTypes: true }); // else the schema hook hides credit notes
    expect(q.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(q.select.mock.calls[0][0]).toEqual(expect.stringContaining('amountDue'));
  });

  it('cancelled bills get their cancel time from the billing audit log (latest cancel wins); active bills skip the lookup', async () => {
    const { svc, q, logs, auditModel } = make();
    q.lean.mockResolvedValueOnce([{ _id: 'a', status: 'active' }]);
    await svc.customerBills(uid);
    expect(auditModel.find).not.toHaveBeenCalled();

    q.lean.mockResolvedValueOnce([{ _id: 'a', status: 'active' }, { _id: 'c', status: 'cancelled' }, { _id: 'd', status: 'cancelled' }]);
    const t1 = new Date('2026-11-01'), t2 = new Date('2026-11-05');
    logs.lean.mockResolvedValueOnce([{ docId: 'c', at: t1 }, { docId: 'c', at: t2 }]);
    const out: any[] = await svc.customerBills(uid);
    expect(auditModel.find.mock.calls[0][0]).toEqual({ targetCollection: 'BillingBill', action: 'cancel', docId: { $in: ['c', 'd'] } });
    expect(logs.sort).toHaveBeenCalledWith({ at: 1 });
    expect(out.map(b => b.cancelledAt)).toEqual([undefined, t2, null]);
  });

  it('live feed: newest first, limit clamped to 1..50', async () => {
    const { svc, q } = make();
    await svc.liveBills(500);
    await svc.liveBills(0);
    expect(q.limit.mock.calls).toEqual([[50], [1]]);
    expect(q.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(q.select.mock.calls[0][0]).toEqual(expect.stringContaining('customerId'));
  });
});
