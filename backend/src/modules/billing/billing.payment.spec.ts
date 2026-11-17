import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingService } from './billing.service';

const bill = (over: any = {}) => ({
  _id: 'b1', customerId: 'c1', status: 'active', paymentMode: 'credit',
  grandTotal: 1000.5, grandTotalPaise: 100050, amountPaid: 0, payments: [], createdAt: new Date('2026-01-01'), ...over,
});

function make(doc: any, updateResult: any = { ok: true }) {
  const billModel = {
    findById: jest.fn().mockReturnValue({ lean: () => Promise.resolve(doc) }),
    findOneAndUpdate: jest.fn().mockResolvedValue(updateResult),
  };
  const userModel = { findByIdAndUpdate: jest.fn().mockResolvedValue({}), findOne: jest.fn() };
  const svc = new (BillingService as any)(userModel, billModel) as BillingService;
  return { svc, billModel, userModel };
}

describe('BillingService.recordPayment', () => {
  it('records a partial UPI payment in exact paise and reduces outstanding by the same amount', async () => {
    const { svc, billModel, userModel } = make(bill());
    await svc.recordPayment('b1', 400.25, 'UPI');
    const [filter, update] = billModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ _id: 'b1', amountPaid: 0 });
    expect(update.$set).toEqual({ amountPaid: 400.25, amountDue: 600.25, amountPaidPaise: 40025, amountDuePaise: 60025, paymentStatus: 'partial' });
    expect(update.$push.payments.$each).toEqual([expect.objectContaining({ mode: 'upi', amountPaise: 40025, kind: 'LATER' })]);
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('c1', { $inc: { outstanding: -400.25 } });
  });

  it('marks the bill paid when the full due is received (0.1 + 0.2 style float sums stay exact)', async () => {
    const { svc, billModel } = make(bill({ grandTotal: 0.3, grandTotalPaise: 30, amountPaid: 0.1, payments: [{ mode: 'cash', amountPaise: 10, kind: 'INITIAL' }] }));
    await svc.recordPayment('b1', 0.2, 'cash');
    expect(billModel.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ amountDuePaise: 0, paymentStatus: 'paid' });
  });

  it('keeps a legacy bill\'s creation payment as INITIAL before the new one', async () => {
    const { svc, billModel } = make(bill({ grandTotalPaise: 0, grandTotal: 500, amountPaid: 100, payments: [], paymentMode: 'cash' }));
    await svc.recordPayment('b1', 50, 'cash');
    const pushed = billModel.findOneAndUpdate.mock.calls[0][1].$push.payments.$each;
    expect(pushed.map((p: any) => [p.kind, p.amountPaise])).toEqual([['INITIAL', 10000], ['LATER', 5000]]);
  });

  it.each([
    [0, 'cash'], [-10, 'cash'], [NaN, 'cash'], [10, 'cheque'], [10, 'bitcoin'],
  ])('rejects amount %p / mode %p', async (amount, mode) => {
    const { svc, billModel } = make(bill());
    await expect(svc.recordPayment('b1', amount as number, mode as string)).rejects.toThrow(BadRequestException);
    expect(billModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects overpayment instead of silently clamping it', async () => {
    const { svc } = make(bill());
    await expect(svc.recordPayment('b1', 1000.51, 'cash')).rejects.toThrow(/more than the amount due/);
  });

  it('rejects payment on a fully paid or cancelled bill', async () => {
    await expect(make(bill({ amountPaid: 1000.5 })).svc.recordPayment('b1', 1, 'cash')).rejects.toThrow(/already fully paid/);
    await expect(make(bill({ status: 'cancelled' })).svc.recordPayment('b1', 1, 'cash')).rejects.toThrow(/cancelled/);
  });

  it('refuses a concurrent duplicate (bill changed since it was read) and leaves outstanding alone', async () => {
    const { svc, userModel } = make(bill(), null);
    await expect(svc.recordPayment('b1', 100, 'cash')).rejects.toThrow(ConflictException);
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('BillingService search escaping', () => {
  it('treats regex characters in a customer search literally', async () => {
    const find = jest.fn().mockReturnValue({ limit: () => ({ lean: () => Promise.resolve([]) }) });
    const svc = new (BillingService as any)({ find }) as BillingService;
    await svc.searchCustomers('Om (Herbal+');
    const rx = find.mock.calls[0][0].$or[0].name.$regex;
    expect(() => new RegExp(rx)).not.toThrow();
    expect(new RegExp(rx, 'i').test('om (herbal+ store')).toBe(true);
  });
});
