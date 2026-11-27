import { OrdersService } from './orders.service';

describe('OrdersService.findAll cache', () => {
  it('passes the query as the cache key and delegates compute to repo', async () => {
    const repo = { findAllPaginated: jest.fn().mockResolvedValue({ items: [], total: 0 }) } as any;
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn() };
    // constructor position 17 is redisService (1-indexed)
    const svc = new (OrdersService as any)(
      repo,         // 1 orderRepository
      undefined,    // 2 connection
      undefined,    // 3 cartService
      undefined,    // 4 productsService
      undefined,    // 5 usersService
      undefined,    // 6 couponsService
      undefined,    // 7 emailService
      undefined,    // 8 settingsService
      undefined,    // 9 storesService
      undefined,    // 10 storeStockService
      undefined,    // 11 storeSalesService
      undefined,    // 12 walletService
      undefined,    // 13 notificationsService
      undefined,    // 14 ucmService
      undefined,    // 15 adminService
      undefined,    // 16 mediaService
      redis,        // 17 redisService
      undefined,    // 18 crmEngine
      undefined,    // 19 inventoryService
    );
    await svc.findAll({ page: 1, limit: 20 });
    expect(redis.cached).toHaveBeenCalledWith(
      expect.stringContaining('admin:orders:list:'),
      30,
      expect.any(Function),
    );
    expect(repo.findAllPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('clearChatbotCache also clears admin:orders:*', async () => {
    const redis = { cached: jest.fn(), delPattern: jest.fn().mockResolvedValue(undefined) };
    const svc = new (OrdersService as any)(
      {}, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      redis,
      undefined, undefined,
    );
    (svc as any).clearChatbotCache();
    expect(redis.delPattern).toHaveBeenCalledWith('admin:orders:*');
  });
});
