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
  const svc = new (BillingService as any)(userModel, billModel, {}, {}, {}, auditLogModel, crmEngine, taxSettings) as BillingService;
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
