import { ProductsService } from './products.service';

function makeRedis(hit: any = null) {
  return {
    cached: jest.fn((_, __, fn) => (hit !== null ? Promise.resolve(hit) : fn())),
    delPattern: jest.fn().mockResolvedValue(undefined),
  };
}

function makeRepo(items: any[] = []) {
  return {
    findAllPaginated: jest.fn().mockResolvedValue({ items, total: items.length, page: 1, limit: 20 }),
  } as any;
}

describe('ProductsService.findAll cache', () => {
  it('calls the repo on cache miss', async () => {
    const repo = makeRepo([{ _id: 'p1', stock: 5, variants: [] }]);
    const redis = makeRedis();
    const storeStock = { aggregateStockByProducts: jest.fn().mockResolvedValue(new Map()) };
    const svc = new (ProductsService as any)(repo, {}, {}, {}, redis, {}, storeStock);
    await svc.findAll({ page: 1 });
    expect(repo.findAllPaginated).toHaveBeenCalledTimes(1);
    expect(redis.cached).toHaveBeenCalledWith(expect.stringContaining('admin:products:list:'), 30, expect.any(Function));
  });

  it('skips the repo on cache hit', async () => {
    const repo = makeRepo();
    const hit = { items: [{ _id: 'p2', stock: 0, variants: [] }], total: 1, page: 1, limit: 20 };
    const redis = makeRedis(hit);
    const svc = new (ProductsService as any)(repo, {}, {}, {}, redis, {}, { aggregateStockByProducts: jest.fn() });
    const result = await svc.findAll({ page: 1 });
    expect(repo.findAllPaginated).not.toHaveBeenCalled();
    expect(result).toBe(hit);
  });

  it('clearProductCache calls delPattern with admin:products:*', async () => {
    const redis = makeRedis();
    const svc = new (ProductsService as any)(makeRepo(), {}, {}, {}, redis, {}, { aggregateStockByProducts: jest.fn() });
    (svc as any).clearProductCache();
    expect(redis.delPattern).toHaveBeenCalledWith('admin:products:*');
  });
});
