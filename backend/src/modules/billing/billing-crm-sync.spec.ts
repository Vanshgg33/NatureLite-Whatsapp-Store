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
