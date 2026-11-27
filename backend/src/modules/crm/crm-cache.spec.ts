describe('CrmService.getCustomers cache', () => {
  it('calls redis.cached with admin:crm:customers key and 30s TTL', async () => {
    const redis = { cached: jest.fn().mockResolvedValue({ customers: [], total: 0 }) };
    const CrmService = require('./crm.service').CrmService;
    // 14 @InjectModel + 3 service params = 17 existing, redis at 18
    const params = [
      ...Array(14).fill({}),  // models
      {}, {}, {},              // engine, whatsapp, media
      redis,                   // 18 redisService
    ] as any[];
    const svc = new CrmService(...params);
    await svc.getCustomers({ page: 1, limit: 20 });
    expect(redis.cached).toHaveBeenCalledWith(
      expect.stringContaining('admin:crm:customers:'),
      30,
      expect.any(Function),
    );
  });
});
