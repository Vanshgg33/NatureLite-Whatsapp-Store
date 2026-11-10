import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

const PID_A = '64b000000000000000000a01';
const PID_B = '64b000000000000000000b02';
const OID = '64b000000000000000000c03';

function build(original: any, stockStore: any = null) {
  const created: any[] = [];
  const svc: any = Object.create(OrdersService.prototype);
  svc.logger = { warn: jest.fn() };
  svc.orderRepository = {
    findById: jest.fn().mockResolvedValue(original),
    findOneByOrderNumberPrefix: jest.fn().mockResolvedValue(null),
    create: jest.fn(async (d: any) => { created.push(d); return { ...d, _id: 'new1' }; }),
  };
  svc.inventoryService = { resolveFulfilmentStore: jest.fn().mockResolvedValue(stockStore) };
  svc.storeStockService = { getStockForStoreProduct: jest.fn().mockResolvedValue({}), decrementStock: jest.fn().mockResolvedValue(undefined) };
  return { svc, created };
}

const original = () => ({
  orderNumber: 'ORD1', user: 'u1',
  shippingAddress: { city: 'Indore', toObject() { return { city: 'Indore' }; } },
  items: [
    { product: { toString: () => PID_A }, name: 'Ghee', quantity: 3, price: 500, total: 1500, gstRate: 5, gstAmount: 75, variantSku: 'G1' },
    { product: { toString: () => PID_B }, name: 'Oil', quantity: 1, price: 300, total: 300, gstRate: 5, gstAmount: 15 },
  ],
});

describe('OrdersService.createReplacementOrder', () => {
  it('re-ships everything at zero price, already paid, and not as COD', async () => {
    const { svc, created } = build(original());
    await svc.createReplacementOrder(OID, 'CMP-1', 'Asha');
    expect(created[0]).toMatchObject({
      orderType: 'replacement', source: 'replacement', status: 'placed',
      paymentMethod: 'prepaid', paymentStatus: 'paid', subtotal: 0, total: 0, gstTotal: 0,
      user: 'u1', shippingAddress: { city: 'Indore' },
    });
    expect(created[0].items.map((i: any) => [i.name, i.quantity, i.price, i.total, i.gstAmount])).toEqual([
      ['Ghee', 3, 0, 0, 0], ['Oil', 1, 0, 0, 0],
    ]);
    expect(created[0].adminNotes).toContain('CMP-1');
    expect(created[0].orderNumber).toMatch(/^ORD\d{8}0001$/);
  });

  it('sends only the selected items and never more than were originally ordered', async () => {
    const { svc, created } = build(original());
    await svc.createReplacementOrder(OID, 'CMP-1', 'Asha', [{ productId: PID_A, quantity: 99 }]);
    expect(created[0].items.map((i: any) => [i.name, i.quantity])).toEqual([['Ghee', 3]]);
  });

  it('rejects a selection that matches nothing', async () => {
    const { svc } = build(original());
    await expect(svc.createReplacementOrder(OID, 'CMP-1', 'Asha', [{ productId: 'nope', quantity: 1 }])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when the original order is missing', async () => {
    const { svc } = build(null);
    await expect(svc.createReplacementOrder(OID, 'CMP-1', 'Asha')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('takes the replacement stock from the fulfilment store, and a stock error does not lose the order', async () => {
    const { svc, created } = build(original(), { _id: { toString: () => 'store1' } });
    svc.storeStockService.decrementStock.mockRejectedValueOnce(new Error('insufficient'));
    await expect(svc.createReplacementOrder(OID, 'CMP-1', 'Asha')).resolves.toBeDefined();
    expect(created).toHaveLength(1);
    expect(svc.storeStockService.decrementStock).toHaveBeenCalledWith('store1', PID_A, 3, 'G1');
    expect(svc.logger.warn).toHaveBeenCalled();
  });
});
