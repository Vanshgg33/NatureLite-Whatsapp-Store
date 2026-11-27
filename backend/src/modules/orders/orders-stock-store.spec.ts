import { Types } from 'mongoose';
import { OrdersService } from './orders.service';

// An order takes stock from the delivery city's store when it has everything, else from a store that does —
// not fail with "0 at Raipur" while the main store holds the stock.
const raipur = { _id: new Types.ObjectId(), name: 'Raipur' };
const main = { _id: new Types.ObjectId(), name: 'Main' };
const pid = new Types.ObjectId();
const item = (quantity: number) => ({ product: pid, variantSku: '2', variantName: '250gm', name: 'Dry fruit Fun', quantity });

function svc(stock: Record<string, number | null>) {
  const s = Object.create(OrdersService.prototype) as any;
  s.inventoryService = { storesByPreference: jest.fn().mockResolvedValue([raipur, main]) };
  s.storeStockService = {
    getStockForStoreProduct: jest.fn(async (storeId: string) => {
      const n = stock[storeId];
      return n === null ? null : { stock: 0, variantStocks: [{ variantSku: '2', stock: n }] };
    }),
  };
  return s;
}

describe('order stock store', () => {
  it('uses the city store when it has the stock', async () => {
    expect(await svc({ [String(raipur._id)]: 5, [String(main._id)]: 5 }).pickStockStore('Raipur', [item(1)])).toBe(raipur);
  });

  it('falls back to a store that has it when the city store is short', async () => {
    expect(await svc({ [String(raipur._id)]: 0, [String(main._id)]: 3 }).pickStockStore('Raipur', [item(1)])).toBe(main);
  });

  it('no store has it: says what each store has', async () => {
    await expect(svc({ [String(raipur._id)]: 0, [String(main._id)]: 1 }).pickStockStore('Raipur', [item(2)])).rejects.toThrow(
      'Not enough stock for "Dry fruit Fun · 250gm": need 2 (Raipur 0, Main 1)',
    );
  });

  it('a store with no stock row for the product is not held against it (decrement skips it too)', async () => {
    expect(await svc({ [String(raipur._id)]: null, [String(main._id)]: 0 }).pickStockStore('Raipur', [item(1)])).toBe(raipur);
  });

  it('cancel/edit go back to the store the order took from; older orders to the main store', async () => {
    const s = svc({});
    s.storesService = { findMainStore: jest.fn().mockResolvedValue(main) };
    expect(await s.orderStockStoreId({ stockStoreId: raipur._id })).toBe(String(raipur._id));
    expect(await s.orderStockStoreId({})).toBe(String(main._id));
  });
});
