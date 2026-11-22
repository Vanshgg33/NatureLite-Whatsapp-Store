import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { noDrawer } from './cash-drawer/no-drawer.stub';
import { BillingService } from './billing.service';

const BILL = new Types.ObjectId();
const CUST = new Types.ObjectId();
const P1 = new Types.ObjectId();
const P2 = new Types.ObjectId();
const STORE = new Types.ObjectId();

const oldBill = (over: any = {}) => ({
  _id: BILL, invoiceNo: 'NIF-26-27/17', docType: 'SALE', status: 'active', customerId: CUST, storeId: STORE,
  invoiceDate: new Date('2026-11-14T13:32:00Z'), createdAt: new Date('2026-11-14T13:32:00Z'), updatedAt: new Date('2026-11-14T13:32:00Z'),
  items: [{ productId: P1, name: 'A2 GHEE', qty: 1, rate: 1459, total: 145900, gstRate: 5 }],
  payments: [], grandTotalPaise: 145900, amountPaidPaise: 0, amountDue: 1459, amountDuePaise: 145900, notes: 'testingasd', orderTag: 'Store Order',
  customerName: 'Om J', placeOfSupply: '22', storeName: 'Main Store', paymentTerm: 'credit', paymentMode: 'credit',
  ...over,
});
const dto = (over: any = {}) => ({
  customerId: String(CUST), orderTag: 'Store Order', storeId: String(STORE), invoiceDate: '2026-11-14', notes: 'deliver after 5',
  items: [{ productId: String(P1), name: 'A2 GHEE', qty: 2, rate: 1459, gstRate: 5 }, { productId: String(P2), name: 'Oil', qty: 1, rate: 450, gstRate: 5 }],
  payments: [{ mode: 'cash', amountRupees: 1000 }, { mode: 'upi', amountRupees: 0 }],
  ...over,
});

function make(bill: any, updateResult = { matchedCount: 1 }) {
  const billModel: any = {
    findById: jest.fn(() => ({ setOptions: () => ({ lean: () => Promise.resolve(bill) }) })),
    updateOne: jest.fn(() => ({ setOptions: () => Promise.resolve(updateResult) })),
  };
  const userModel: any = { findByIdAndUpdate: jest.fn().mockResolvedValue({}) };
  const auditLogModel: any = { create: jest.fn().mockResolvedValue({}) };
  const crmEngine: any = { refreshUser: jest.fn().mockResolvedValue(undefined) };
  const taxSettings: any = { assertPeriodOpen: jest.fn().mockResolvedValue(undefined) };
  const storeStock: any = {
    getStockMapForStoreProducts: jest.fn().mockResolvedValue(new Map([[String(P1), { stock: 50 }], [String(P2), { stock: 50 }]])),
    decrementStock: jest.fn().mockResolvedValue({}), incrementStock: jest.fn().mockResolvedValue({}),
  };
  const stores: any = { findAll: jest.fn().mockResolvedValue([{ _id: STORE, name: 'Main Store' }]) };
  const svc: any = new (BillingService as any)(userModel, billModel, {}, {}, {}, auditLogModel, crmEngine, taxSettings, {}, {}, {}, storeStock, stores, noDrawer());
  // pricing is createBillV1's own (priceBill); stubbed here to test what an edit does around it
  jest.spyOn(svc, 'priceBill').mockImplementation(async (d: any) => ({
    customer: { name: 'Om J', tags: [] }, pos: '22', isInterState: false, customerPhone: '9561883384', defaultBillingLine: '',
    lines: d.items.map((i: any) => ({ ...i, productId: new Types.ObjectId(i.productId), total: Math.round(i.qty * i.rate * 100) })),
    billDiscountPct: 0, billDiscAmtPaise: 0, chargesPaise: [], roundOffPaise: 0, cgstTotalPaise: 0, sgstTotalPaise: 0, igstTotalPaise: 0,
    grandTotalPaise: d.items.reduce((s: number, i: any) => s + Math.round(i.qty * i.rate * 100), 0), formulaVersion: 1, taxableTotalPaise: 0, gstr1Section: 'B2CS',
  }));
  return { svc, billModel, userModel, auditLogModel, storeStock };
}

describe('BillingService.updateBill: edit in place', () => {
  it('updates the same bill (no new invoice), moves only the stock difference and the change in balance', async () => {
    const { svc, billModel, userModel, auditLogModel, storeStock } = make(oldBill());
    await svc.updateBill(String(BILL), dto(), 'admin1', '', false, 'Rahul');

    const [filter, update] = billModel.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: BILL, status: 'active', updatedAt: oldBill().updatedAt });
    expect(update.$set.invoiceNo).toBeUndefined();                   // number never changes
    expect(update.$set.invoiceDate).toEqual(oldBill().invoiceDate);  // same day keeps the original time
    expect(update.$set.grandTotalPaise).toBe(336800);                // 2×1459 + 450
    expect(update.$set.amountDuePaise).toBe(236800);
    // stock: +1 ghee, +1 oil taken; nothing returned
    expect(storeStock.decrementStock.mock.calls).toEqual([[String(STORE), String(P1), 1, undefined], [String(STORE), String(P2), 1, undefined]]);
    expect(storeStock.incrementStock).not.toHaveBeenCalled();
    // outstanding: 1459 → 2368
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(String(CUST), { $inc: { outstanding: 909 } });
    // history: who, which bill, what changed
    const h = auditLogModel.create.mock.calls[0][0];
    expect(h).toMatchObject({ docId: BILL, action: 'update', userId: 'admin1', userName: 'Rahul', after: { invoiceNo: 'NIF-26-27/17' } });
    expect(h.after.changes.map((c: any) => c.label)).toEqual(expect.arrayContaining(['Notes', 'Item: A2 GHEE', 'Item added: Oil', 'Grand total', 'Amount paid', 'Balance due']));
  });

  it('returns stock for reduced quantities', async () => {
    const { svc, storeStock } = make(oldBill({ items: [{ productId: P1, name: 'A2 GHEE', qty: 3, rate: 1459, total: 437700 }] }));
    await svc.updateBill(String(BILL), dto({ items: [{ productId: String(P1), name: 'A2 GHEE', qty: 1, rate: 1459, gstRate: 5 }], payments: [] }), 'admin1');
    expect(storeStock.decrementStock).not.toHaveBeenCalled();
    expect(storeStock.incrementStock).toHaveBeenCalledWith(String(STORE), String(P1), 2, undefined);
  });

  it('a save that loses a race writes no history and puts the stock back', async () => {
    const { svc, auditLogModel, storeStock, userModel } = make(oldBill(), { matchedCount: 0 });
    await expect(svc.updateBill(String(BILL), dto(), 'admin1')).rejects.toBeInstanceOf(ConflictException);
    expect(auditLogModel.create).not.toHaveBeenCalled();
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(storeStock.incrementStock.mock.calls).toEqual([[String(STORE), String(P1), 1, undefined], [String(STORE), String(P2), 1, undefined]]);
  });

  it('refuses invalid edits before touching anything', async () => {
    const cases: [any, any, string][] = [
      [oldBill({ status: 'cancelled' }), dto(), 'can no longer be edited'],
      [oldBill({ docType: 'CREDIT_NOTE' }), dto(), 'Only sale invoices'],
      [oldBill(), dto({ invoiceNo: 'NIF-99' }), 'cannot be changed'],
      [oldBill(), dto({ items: [] }), 'at least one item'],
      [oldBill(), dto({ payments: [{ mode: 'cash', amountRupees: 99999 }] }), 'more than the new bill total'],
      [oldBill({ payments: [{ mode: 'upi', amountPaise: 50000, kind: 'LATER' }] }), dto({ payments: [{ mode: 'upi', amountRupees: 100 }] }), 'after billing'],
    ];
    for (const [bill, d, msg] of cases) {
      const { svc, billModel, auditLogModel, storeStock } = make(bill);
      await expect(svc.updateBill(String(BILL), d, 'admin1')).rejects.toThrow(msg);
      expect(billModel.updateOne).not.toHaveBeenCalled();
      expect(auditLogModel.create).not.toHaveBeenCalled();
      expect(storeStock.decrementStock).not.toHaveBeenCalled();
    }
    await expect(make(oldBill()).svc.updateBill('nope', dto(), 'a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps payments recorded later and only re-states the payment at billing', async () => {
    const later = { mode: 'upi', amountPaise: 50000, kind: 'LATER', at: new Date() };
    const { svc, billModel } = make(oldBill({ payments: [later] }));
    await svc.updateBill(String(BILL), dto({ payments: [{ mode: 'cash', amountRupees: 200 }, { mode: 'upi', amountRupees: 500 }] }), 'admin1');
    const set = billModel.updateOne.mock.calls[0][1].$set;
    expect(set.payments).toEqual([expect.objectContaining({ mode: 'cash', amountPaise: 20000, kind: 'INITIAL' }), later]);
    expect(set.amountPaidPaise).toBe(70000);
  });

  it('nothing changed → saved, but no history entry', async () => {
    const same = oldBill();
    const { svc, auditLogModel } = make(same);
    await svc.updateBill(String(BILL), dto({ notes: 'testingasd', items: [{ productId: String(P1), name: 'A2 GHEE', qty: 1, rate: 1459, gstRate: 5 }], payments: [] }), 'admin1');
    expect(auditLogModel.create).not.toHaveBeenCalled();
  });
});
