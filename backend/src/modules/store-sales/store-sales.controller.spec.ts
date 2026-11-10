import { ForbiddenException } from '@nestjs/common';
import { StoreSalesController } from './store-sales.controller';

describe('StoreSalesController store scoping', () => {
  const sale = { store: { _id: 's1', name: 'Store 1' } };
  const service = {
    findById: jest.fn().mockResolvedValue(sale),
    sendSaleInvoiceToCustomer: jest.fn().mockResolvedValue({ sent: true }),
    findAll: jest.fn().mockResolvedValue([]),
  };
  const ctrl = new StoreSalesController(service as any);
  const user = (o: object) => o as any;

  it('lets a store admin read their own sale but not another store\'s', async () => {
    await expect(ctrl.findById('x', user({ role: 'admin', storeId: 's1' }))).resolves.toBe(sale);
    await expect(ctrl.findById('x', user({ role: 'admin', storeId: 's2' }))).rejects.toThrow(ForbiddenException);
  });

  it('blocks send-invoice across stores', async () => {
    await expect(ctrl.sendInvoice('x', user({ role: 'admin', storeId: 's2' }))).rejects.toThrow(ForbiddenException);
    expect(service.sendSaleInvoiceToCustomer).not.toHaveBeenCalled();
  });

  it('allows superadmin and un-scoped admins everywhere, blocks store-scoped admins from all-stores views', async () => {
    await expect(ctrl.findById('x', user({ role: 'superadmin' }))).resolves.toBe(sale);
    await expect(ctrl.findAll({} as any, user({ role: 'admin' }))).resolves.toEqual([]);
    await expect(ctrl.findAll({} as any, user({ role: 'admin', storeId: 's1' }))).rejects.toThrow(ForbiddenException);
  });
});
