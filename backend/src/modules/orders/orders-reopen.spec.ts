import { Types } from 'mongoose';
import { OrdersService } from './orders.service';

const oid = () => new Types.ObjectId();

function build(opts: { status?: string; walletUsed?: number; couponCode?: string; walletFails?: boolean; flipReturnsNull?: boolean }) {
  const orderId = oid();
  const order: any = {
    _id: orderId,
    status: opts.status ?? 'cancelled',
    user: oid(),
    items: [{ product: oid(), quantity: 2, variantSku: 'A' }],
    walletUsed: opts.walletUsed ?? 0,
    couponCode: opts.couponCode,
  };
  const reopenedDoc: any = { timeline: [], save: async function () { return this; } };
  const calls: string[] = [];
  const svc: any = Object.create(OrdersService.prototype);
  svc.logger = { error: () => undefined, warn: () => undefined };
  svc.orderRepository = {
    findById: async () => order,
    getModel: () => ({ findOneAndUpdate: () => ({ exec: async () => (opts.flipReturnsNull ? null : reopenedDoc) }) }),
  };
  svc.storesService = { findMainStore: async () => ({ _id: oid() }) };
  svc.productsService = { findById: async () => ({ trackStock: true }) };
  svc.storeStockService = {
    getStockForStoreProduct: async () => ({}),
    decrementStock: async () => { calls.push('stock-'); },
    incrementStock: async () => { calls.push('stock+'); },
  };
  svc.walletService = {
    debit: async () => { if (opts.walletFails) throw new Error('Insufficient wallet balance'); calls.push('wallet-'); },
    credit: async () => { calls.push('wallet+'); },
  };
  svc.couponsService = { incrementUsageCount: async () => { calls.push('coupon+'); }, decrementUsageCount: async () => { calls.push('coupon-'); } };
  svc.storeSalesService = { unvoidByLinkedOrder: async () => { calls.push('unvoid'); } };
  svc.clearChatbotCache = () => undefined;
  return { svc: svc as OrdersService, orderId, calls, reopenedDoc };
}

describe('OrdersService.reopenOrder', () => {
  it('re-takes stock, wallet and coupon, then puts the order back to placed', async () => {
    const { svc, orderId, calls, reopenedDoc } = build({ walletUsed: 5000, couponCode: 'SAVE' });
    await svc.reopenOrder(orderId.toString(), 'admin1');
    expect(calls).toEqual(expect.arrayContaining(['stock-', 'wallet-', 'coupon+', 'unvoid']));
    expect(reopenedDoc.timeline[0]).toMatchObject({ status: 'placed', message: 'Order reopened by admin' });
  });

  it('refuses an order that is not cancelled', async () => {
    const { svc, orderId } = build({ status: 'delivered' });
    await expect(svc.reopenOrder(orderId.toString())).rejects.toThrow('Only cancelled orders can be reopened.');
  });

  it('rolls back stock when the wallet cannot be debited, leaving the order cancelled', async () => {
    const { svc, orderId, calls } = build({ walletUsed: 5000, walletFails: true });
    await expect(svc.reopenOrder(orderId.toString())).rejects.toThrow('Insufficient wallet balance');
    expect(calls).toEqual(['stock-', 'stock+']);
  });

  it('rolls everything back if someone else changed the order first', async () => {
    const { svc, orderId, calls } = build({ walletUsed: 5000, couponCode: 'SAVE', flipReturnsNull: true });
    await expect(svc.reopenOrder(orderId.toString())).rejects.toThrow('changed by someone else');
    expect(calls).toEqual(['stock-', 'wallet-', 'coupon+', 'coupon-', 'wallet+', 'stock+']);
  });
});
