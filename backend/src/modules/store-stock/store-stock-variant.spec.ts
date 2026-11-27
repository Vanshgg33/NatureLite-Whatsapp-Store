import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { StoreStockRepository } from './repositories/store-stock.repository';
import { StoreStockService } from './store-stock.service';

// Variant stock must be found by its current variant _id as well as its SKU: IMS writes by _id and
// the stored SKU goes stale, which made orders fail with "Insufficient store stock" while IMS showed stock.
const store = new Types.ObjectId().toString();
const product = new Types.ObjectId().toString();
const vid = new Types.ObjectId();

function repoWith(updateResults: Array<{ modifiedCount?: number; matchedCount?: number }>, row?: any) {
  const model = {
    updateOne: jest.fn(() => ({ exec: () => Promise.resolve(updateResults.shift() ?? { modifiedCount: 1, matchedCount: 1 }) })),
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(row) })),
  };
  return { repo: new StoreStockRepository(model as any), model };
}
const inventory = (storeName = 'Main') => ({
  variantContext: jest.fn().mockResolvedValue({ variantId: vid, storeName }),
  currentVariantSkus: jest.fn().mockResolvedValue(new Map([[String(vid), '2']])),
  refreshProductCache: jest.fn().mockResolvedValue(undefined),
});
const svc = (repo: StoreStockRepository, inv = inventory()) => new StoreStockService(repo, {} as any, {} as any, inv as any);

describe('variant stock decrement / increment', () => {
  it('matches the entry by id or SKU, with the stock check on the same entry, and refreshes the stale SKU', async () => {
    const { repo, model } = repoWith([{ modifiedCount: 1 }]);
    await svc(repo).decrementStock(store, product, 3, '2');
    const [filter, update] = (model.updateOne.mock.calls[0] as any[]);
    expect(filter.variantStocks.$elemMatch).toEqual({ $or: [{ variantId: vid }, { variantSku: '2' }], stock: { $gte: 3 } });
    expect(update).toEqual({ $inc: { 'variantStocks.$.stock': -3 }, $set: { 'variantStocks.$.variantSku': '2' } });
  });

  it('a real shortage says how much the store has', async () => {
    const { repo } = repoWith([{ modifiedCount: 0 }], { variantStocks: [{ variantId: vid, variantSku: 'old', stock: 1 }] });
    await expect(svc(repo).decrementStock(store, product, 3, '2')).rejects.toThrow(
      new BadRequestException('Insufficient store stock for variant 2: 1 at Main, 3 needed'),
    );
  });

  it('returning stock for a variant with no entry creates the entry instead of losing it', async () => {
    const { repo, model } = repoWith([{ matchedCount: 0, modifiedCount: 0 }, { matchedCount: 1 }]);
    await svc(repo).incrementStock(store, product, 2, '2');
    const [, push, opts] = (model.updateOne.mock.calls[1] as any[]);
    expect(push.$push).toEqual({ variantStocks: { variantId: vid, variantSku: '2', stock: 2 } });
    expect(opts).toEqual({ upsert: true });
  });

  it('reads show entries under the current SKU, fullest duplicate first', async () => {
    const row = {
      product,
      variantStocks: [
        { variantId: vid, variantSku: '2', stock: 0 },
        { variantId: new Types.ObjectId(), variantSku: '2', stock: 9 },
        { variantId: vid, variantSku: 'renamed-away', stock: 4 },
      ],
    };
    const repo = { findOneByStoreAndProduct: jest.fn().mockResolvedValue(row) } as any;
    const out: any = await svc(repo).getStockForStoreProduct(store, product);
    expect(out.variantStocks.map((v: any) => [v.variantSku, v.stock])).toEqual([['2', 9], ['2', 4], ['2', 0]]);
  });
});
