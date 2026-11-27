describe('AnalyticsService.getDashboardStats cache', () => {
  it('uses admin:analytics:dashboard key with 60s TTL', async () => {
    const redis = { cached: jest.fn().mockResolvedValue({ todayOrders: 0 }) };
    const settings = { getMockDataEnabled: jest.fn().mockResolvedValue(false) };
    const AnalyticsService = require('./analytics.service').AnalyticsService;
    // constructor: 10 repos/services + analyticsQueue + redisService
    const svc = new AnalyticsService(
      {}, {}, {}, {}, {}, {}, {}, {}, {},  // 9 repos
      settings,                             // 10 settingsService
      {},                                   // 11 analyticsQueue
      redis,                                // 12 redisService
    );
    await svc.getDashboardStats();
    expect(redis.cached).toHaveBeenCalledWith('admin:analytics:dashboard', 60, expect.any(Function));
  });
});
