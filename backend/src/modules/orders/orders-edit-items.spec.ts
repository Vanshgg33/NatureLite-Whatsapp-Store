import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OrdersService } from './orders.service';

const oid = () => new Types.ObjectId();
const P1 = oid();
const P2 = oid();

interface Opts {
  status?: string;
  stock?: Record<string, number>; // productId -> stock; a missing key means "no StoreStock row"
  products?: Record<string, any>;
  saveError?: Error;
}

function build(opts: Opts = {}) {
  const stock: Record<string, number> = { [P1.toString()]: 10, [P2.toString()]: 10, ...(opts.stock ?? {}) };
  const log: string[] = [];
  const order: any = {
    _id: oid(),
    status: opts.status ?? 'placed',
    subtotal: 1400,
    discount: 0,
    shippingCharge: 0,
    total: 1400,
    timeline: [],
    items: [{ product: P1, name: 'Ghee', price: 700, quantity: 2, total: 1400, gstRate: 5, gstAmount: 70 }],
    saves: 0,
    increment() { log.push('increment'); },
    async save() {
      if (opts.saveError) throw opts.saveError;
      order.saves += 1;
      return order;
    },
  };
  const products: Record<string, any> = {
    [P1.toString()]: { _id: P1, name: 'Ghee', price: 700, isActive: true, variants: [], category: { gstPercentage: 5 } },
    [P2.toString()]: { _id: P2, name: 'Honey', price: 300, isActive: true, variants: [], category: { gstPercentage: 12 } },
    ...(opts.products ?? {}),
  };
  const svc: any = Object.create(OrdersService.prototype);
  svc.logger = { error: () => undefined, warn: () => undefined };
  svc.orderRepository = { findById: async () => order };
  svc.storesService = { findMainStore: async () => ({ _id: oid() }) };
  svc.productsService = {
    findById: async (id: string) => {
      log.push(`lookup:${id}`);
      if (!products[id]) throw new Error('Product not found');
      return products[id];
    },
  };
  svc.storeStockService = {
    getStockForStoreProduct: async (_s: string, pid: string) => (pid in stock ? { stock: stock[pid] } : null),
    decrementStock: async (_s: string, pid: string, qty: number) => {
      if (stock[pid] < qty) throw new BadRequestException('Insufficient store stock for this product');
      stock[pid] -= qty;
      log.push(`-${qty}`);
    },
    incrementStock: async (_s: string, pid: string, qty: number) => {
      stock[pid] += qty;
      log.push(`+${qty}`);
    },
  };
  svc.crmEngine = { refreshUser: async () => undefined };
  return { svc: svc as OrdersService, order, stock, log };
}

const item = (productId: Types.ObjectId, quantity: number, variantSku?: string) => ({ productId: productId.toString(), quantity, variantSku });

describe('OrdersService.updateOrder — item edits', () => {
  it('raising a quantity takes only the extra stock and recomputes totals at the sold price', async () => {
    const { svc, order, stock } = build();
    await svc.updateOrder(order._id.toString(), { items: [item(P1, 5)] } as any);
    expect(stock[P1.toString()]).toBe(7); // 10 - (5 - 2)
    expect(order.items[0]).toMatchObject({ quantity: 5, price: 700, total: 3500, gstRate: 5, gstAmount: 175 });
    expect(order.subtotal).toBe(3500);
    expect(order.total).toBe(3500);
    expect(order.repackRequired).toBe(true);
    expect(order.saves).toBe(1);
  });

  it('lowering a quantity returns the difference', async () => {
    const { svc, order, stock } = build();
    await svc.updateOrder(order._id.toString(), { items: [item(P1, 1)] } as any);
    expect(stock[P1.toString()]).toBe(11);
    expect(order.total).toBe(700);
  });

  it('adds a different product at its own price and takes its stock', async () => {
    const { svc, order, stock } = build();
    await svc.updateOrder(order._id.toString(), { items: [item(P1, 2), item(P2, 3)] } as any);
    expect(order.items).toHaveLength(2);
    expect(order.items[1]).toMatchObject({ name: 'Honey', price: 300, quantity: 3, total: 900, gstAmount: 108 });
    expect(stock[P2.toString()]).toBe(7);
    expect(stock[P1.toString()]).toBe(10); // untouched line
    expect(order.subtotal).toBe(2300);
  });

  it('removing a line returns its stock', async () => {
    const { svc, order, stock } = build();
    await svc.updateOrder(order._id.toString(), { items: [item(P2, 1)] } as any);
    expect(stock[P1.toString()]).toBe(12);
    expect(stock[P2.toString()]).toBe(9);
    expect(order.items.map((i: any) => i.name)).toEqual(['Honey']);
  });

  it('merges repeated lines for the same product instead of double counting', async () => {
    const { svc, order, stock } = build();
    await svc.updateOrder(order._id.toString(), { items: [item(P1, 2), item(P2, 1), item(P2, 2)] } as any);
    expect(order.items).toHaveLength(2);
    expect(order.items[1].quantity).toBe(3);
    expect(stock[P2.toString()]).toBe(7);
  });

  it('an unchanged item list does no product lookups or stock moves, even if a product has since been deleted', async () => {
    const { svc, order, log } = build();
    (svc as any).productsService.findById = async () => { throw new Error('should not be called'); };
    await svc.updateOrder(order._id.toString(), { items: [item(P1, 2)], notes: 'call first' } as any);
    expect(order.notes).toBe('call first');
    expect(log).toEqual([]);
    expect(order.saves).toBe(1);
  });

  it('a discount saved with unchanged items still recomputes the total', async () => {
    const { svc, order } = build();
    await svc.updateOrder(order._id.toString(), { items: [item(P1, 2)], discount: 100 } as any);
    expect(order.discount).toBe(100);
    expect(order.total).toBe(1300);
  });

  it('refuses more than is in stock, names the product, and leaves nothing half-applied', async () => {
    const { svc, order, stock } = build({ stock: { [P2.toString()]: 1 } });
    // line order: P1 returns stock first (removed), then P2 fails
    await expect(svc.updateOrder(order._id.toString(), { items: [item(P2, 4)] } as any)).rejects.toThrow('Not enough stock for "Honey"');
    expect(stock[P1.toString()]).toBe(10); // the returned stock was undone
    expect(order.saves).toBe(0);
    expect(order.items[0].quantity).toBe(2);
  });

  it('puts the stock back when the order save fails', async () => {
    const { svc, order, stock } = build({ saveError: new Error('db down') });
    await expect(svc.updateOrder(order._id.toString(), { items: [item(P1, 6)] } as any)).rejects.toThrow('db down');
    expect(stock[P1.toString()]).toBe(10);
  });

  it('turns a concurrent edit into a conflict and puts the stock back', async () => {
    const err = Object.assign(new Error('No matching document'), { name: 'VersionError' });
    const { svc, order, stock } = build({ saveError: err });
    await expect(svc.updateOrder(order._id.toString(), { items: [item(P1, 6)] } as any)).rejects.toThrow('changed by someone else');
    expect(stock[P1.toString()]).toBe(10);
  });

  it('does not create stock rows for products without one, or touch products that do not track stock', async () => {
    const { svc, order, log } = build();
    (svc as any).storeStockService.getStockForStoreProduct = async (_s: string, pid: string) => (pid === P2.toString() ? { stock: 5 } : null);
    await svc.updateOrder(order._id.toString(), { items: [item(P2, 1)] } as any); // P1 removed but has no row
    expect(log.filter((l) => l.startsWith('+'))).toEqual([]);
  });

  it('rejects item changes on a cancelled order', async () => {
    const { svc, order, log } = build({ status: 'cancelled' });
    await expect(svc.updateOrder(order._id.toString(), { items: [item(P1, 3)] } as any)).rejects.toThrow('cancelled or refunded');
    expect(log).toEqual([]);
  });

  it('rejects an unavailable new product before touching stock', async () => {
    const { svc, order, stock } = build({ products: { [P2.toString()]: { _id: P2, name: 'Honey', price: 300, isActive: false, variants: [] } } });
    await expect(svc.updateOrder(order._id.toString(), { items: [item(P1, 2), item(P2, 1)] } as any)).rejects.toThrow('no longer available');
    expect(stock[P2.toString()]).toBe(10);
  });

  it('rejects a variant that does not exist', async () => {
    const { svc, order } = build();
    await expect(svc.updateOrder(order._id.toString(), { items: [item(P1, 2), item(P2, 1, 'NOPE')] } as any)).rejects.toThrow('variant');
  });
});
