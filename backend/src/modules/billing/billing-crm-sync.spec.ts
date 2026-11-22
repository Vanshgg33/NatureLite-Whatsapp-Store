import { noDrawer } from './cash-drawer/no-drawer.stub';
import { BillingService } from './billing.service';

// Bills are read live by the CRM; only the per-customer CRM stats (segment / LTV) are derived and must be refreshed.
function make(doc: any) {
  const billModel = {
    findById: jest.fn().mockReturnValue({ setOptions: () => ({ lean: () => Promise.resolve(doc) }) }),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const userModel = { findByIdAndUpdate: jest.fn().mockResolvedValue({}) };
  const auditLogModel = { create: jest.fn().mockResolvedValue({}) };
  const crmEngine = { refreshUser: jest.fn().mockResolvedValue(undefined) };
  const taxSettings = { assertPeriodOpen: jest.fn().mockResolvedValue(undefined) };
  const svc = new (BillingService as any)(userModel, billModel, {}, {}, {}, auditLogModel, crmEngine, taxSettings, {}, {}, {}, {}, {}, noDrawer()) as BillingService;
  return { svc, crmEngine, userModel };
}

describe('Billing → CRM stats refresh', () => {
  it('cancelling a bill refreshes the customer CRM stats and reverses outstanding', async () => {
    const { svc, crmEngine, userModel } = make({ _id: 'b1', customerId: 'c1', status: 'active', docType: 'SALE', amountDue: 250, items: [] });
    await svc.cancelBill('b1', 'wrong item');
    expect(crmEngine.refreshUser).toHaveBeenCalledWith('c1');
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('c1', { $inc: { outstanding: -250 } });
  });

  it('a failed CRM refresh never fails the cancel', async () => {
    const { svc, crmEngine } = make({ _id: 'b1', customerId: 'c1', status: 'active', docType: 'SALE', amountDue: 0, items: [] });
    crmEngine.refreshUser.mockRejectedValue(new Error('db down'));
    await expect(svc.cancelBill('b1', 'x')).resolves.toEqual({ ok: true });
  });
});

describe('Returns (credit notes) cannot double-count a refund', () => {
  function make(sale: any, priorReturns: any[]) {
    const chain = (v: any) => ({ setOptions: () => ({ lean: () => Promise.resolve(v), select: () => ({ lean: () => Promise.resolve(v) }) }) });
    const billModel = { findOne: jest.fn(() => chain(sale)), find: jest.fn(() => chain(priorReturns)) };
    const svc: any = new (BillingService as any)({}, billModel);
    return { check: (paise: number, customer = 'c1') => svc.assertReturnFits('NLF-1', customer, paise), billModel };
  }
  const sale = { invoiceNo: 'NLF-1', customerId: 'c1', status: 'active', grandTotalPaise: 100000 };

  it('allows partial returns up to the invoice total, counting earlier active returns (legacy rupee totals too)', async () => {
    const { check, billModel } = make(sale, [{ grandTotalPaise: 30000 }, { grandTotalPaise: 0, grandTotal: 200 }]);
    await expect(check(50000)).resolves.toBeUndefined();          // 300 + 200 + 500 = 1000
    await expect(check(50001)).rejects.toThrow('more than what is left'); // one paisa over
    expect((billModel.find.mock.calls[0] as any[])[0]).toEqual({ refInvoiceNo: 'NLF-1', docType: 'CREDIT_NOTE', status: 'active' });
  });

  it('rejects a return against a cancelled invoice, another customer\'s invoice, or a missing one', async () => {
    await expect(make({ ...sale, status: 'cancelled' }, []).check(100)).rejects.toThrow('cancelled');
    await expect(make(sale, []).check(100, 'c2')).rejects.toThrow('another customer');
    await expect(make(null, []).check(100)).rejects.toThrow('not found');
  });
});

describe('Billing customers: one customer per phone however it is typed', () => {
  function make(existing: any = null, createImpl?: any) {
    const userModel: any = {
      findOne: jest.fn((q: any) => ({ lean: () => Promise.resolve(q.phone ? existing : null) })),
      create: jest.fn(createImpl ?? ((d: any) => Promise.resolve({ _id: 'u1', ...d }))),
      find: jest.fn(() => ({ limit: () => ({ lean: () => Promise.resolve([]) }) })),
    };
    const crmEngine = { refreshUser: jest.fn().mockResolvedValue(undefined) };
    const svc: any = new (BillingService as any)(userModel, {}, {}, {}, {}, {}, crmEngine);
    svc.mapUser = (u: any) => u;
    return { svc, userModel };
  }

  it.each(['9876543210', '09876543210', '+91 98765-43210', '919876543210'])('"%s" is stored and looked up as 919876543210', async (typed) => {
    const { svc, userModel } = make();
    await svc.createCustomer({ name: 'Asha', phone: typed });
    expect(userModel.findOne.mock.calls[0][0]).toEqual({ phone: '919876543210' });
    expect(userModel.create.mock.calls[0][0].phone).toBe('919876543210');
  });

  it('an existing customer typed with a 0 prefix is refused, not duplicated', async () => {
    const { svc, userModel } = make({ _id: 'old', phone: '919876543210' });
    await expect(svc.createCustomer({ name: 'Asha', phone: '09876543210' })).rejects.toThrow('already exists');
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('two counters creating the same number at once: the loser gets a clear conflict, not a server error', async () => {
    const { svc } = make(null, () => Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 })));
    await expect(svc.createCustomer({ name: 'Asha', phone: '9876543210' })).rejects.toThrow('already exists');
  });

  it('too-short numbers are rejected', async () => {
    await expect(make().svc.createCustomer({ name: 'Asha', phone: '12345' })).rejects.toThrow('valid phone');
  });

  it('search by a full number with 0 / +91 prefix matches on the last 10 digits', async () => {
    const { svc, userModel } = make();
    await svc.searchCustomers('09876543210');
    await svc.searchCustomers('98765');
    expect(userModel.find.mock.calls[0][0].$or[1]).toEqual({ phone: { $regex: '9876543210' } });
    expect(userModel.find.mock.calls[1][0].$or[1]).toEqual({ phone: { $regex: '98765' } });
  });
});

describe('Duplicate invoices: one bill-form save makes at most one bill (Billing page and CRM profile alike)', () => {
  const dto = (over: any = {}) => ({ customerId: 'c1', orderTag: 'Store Order', items: [{ productId: 'p1', name: 'Ghee', sku: 'G', hsnCode: '', qty: 1, rate: 100, gstRate: 5 }], clientRequestId: 'req-12345678', ...over });
  function make(existing: any) {
    const billModel = { findOne: jest.fn(() => ({ setOptions: () => ({ lean: () => Promise.resolve(existing) }) })), create: jest.fn() };
    const taxSettings = { assertPeriodOpen: jest.fn().mockRejectedValue(new Error('reached creation')) };
    const svc: any = new (BillingService as any)({}, billModel, {}, {}, {}, {}, {}, taxSettings);
    return { svc, billModel, taxSettings };
  }

  it('a repeated save returns the bill already created: no new invoice number, stock, balance or audit entry', async () => {
    const done = { _id: 'b1', invoiceNo: 'NLF-26-27/18', customerId: 'c1' };
    const { svc, billModel, taxSettings } = make(done);
    await expect(svc.createBillV1(dto())).resolves.toBe(done);
    expect((billModel.findOne.mock.calls[0] as any[])[0]).toEqual({ clientRequestId: 'req-12345678' });
    expect(taxSettings.assertPeriodOpen).not.toHaveBeenCalled();
    expect(billModel.create).not.toHaveBeenCalled();
  });

  it('the same key for a different customer is refused, never handed another customer\'s bill', async () => {
    const { svc } = make({ _id: 'b1', customerId: 'c9' });
    await expect(svc.createBillV1(dto())).rejects.toThrow('another customer');
  });

  it('a first save, or a malformed key, goes on to create the bill normally', async () => {
    await expect(make(null).svc.createBillV1(dto())).rejects.toThrow('reached creation');
    const bad = make({ _id: 'b1', customerId: 'c1' });
    await expect(bad.svc.createBillV1(dto({ clientRequestId: { $ne: null } }))).rejects.toThrow('reached creation');
    expect(bad.billModel.findOne).not.toHaveBeenCalled();
  });

  it('editing (reissue) and confirming a sale order never reuse a client key', async () => {
    const svc: any = new (BillingService as any)({}, {
      findById: () => ({ setOptions: () => ({ lean: () => Promise.resolve({ _id: 'o1', docType: 'SALE_ORDER', status: 'active', invoiceNo: 'SO-1' }) }) }),
      updateOne: jest.fn().mockResolvedValue({}),
    });
    svc.createBillV1 = jest.fn().mockResolvedValue({ _id: 'b2', invoiceNo: 'NLF-2' });
    await svc.convertOrder('o1', dto());
    expect(svc.createBillV1.mock.calls[0][0].clientRequestId).toBeUndefined();
  });
});
