import { CategoriesService } from './categories.service';

function makeRedis(hit: any = null) {
  return {
    cached: jest.fn((_, __, fn) => (hit ? Promise.resolve(hit) : fn())),
    delPattern: jest.fn().mockResolvedValue(undefined),
  };
}

describe('CategoriesService cache', () => {
  it('getCategoryTree uses Redis with 300s TTL', async () => {
    const repo = { findActiveLean: jest.fn().mockResolvedValue([]) } as any;
    const redis = makeRedis();
    const svc = new CategoriesService(repo, redis as any);
    await svc.getCategoryTree();
    expect(redis.cached).toHaveBeenCalledWith('admin:categories:tree', 300, expect.any(Function));
  });

  it('findActiveCategories uses Redis with 300s TTL', async () => {
    const repo = { findActiveSorted: jest.fn().mockResolvedValue([]) } as any;
    const redis = makeRedis();
    const svc = new CategoriesService(repo, redis as any);
    await svc.findActiveCategories();
    expect(redis.cached).toHaveBeenCalledWith('admin:categories:active', 300, expect.any(Function));
  });

  it('clearCategoryCache fires on create', async () => {
    const repo = {
      findOneBySlug: jest.fn().mockResolvedValue(null),
      createOne: jest.fn().mockResolvedValue({ _id: 'c1', name: 'Test', slug: 'test' }),
    } as any;
    const redis = makeRedis();
    const svc = new CategoriesService(repo, redis as any);
    await svc.create({ name: 'Test', slug: 'test' } as any);
    expect(redis.delPattern).toHaveBeenCalledWith('admin:categories:*');
  });
});
