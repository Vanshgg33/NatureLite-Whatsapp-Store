describe('PurchaseService cache', () => {
  function makeSvc(redis: any) {
    const PurchaseService = require('./purchase.service').PurchaseService;
    const makeModel = (data: any) => ({
      find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve(data) }) })),
      create: jest.fn().mockResolvedValue({ _id: 'm1' }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: 'm1' }),
    });
    return new PurchaseService(
      makeModel([{ _id: 'm1', name: 'Groundnut', isActive: true }]),  // materialModel
      makeModel([]),  // requestModel
      makeModel([{ _id: 'v1', name: 'Vendor A', isActive: true }]),   // vendorModel
      makeModel([]),  // adminModel
      makeModel([]),  // tagModel
      {}, {}, {},    // emailService, whatsapp, settings
      redis,         // redisService
    );
  }

  it('getMaterials uses 120s TTL', async () => {
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn() };
    const svc = makeSvc(redis);
    await svc.getMaterials();
    expect(redis.cached).toHaveBeenCalledWith('admin:purchase:materials:true', 120, expect.any(Function));
  });

  it('getVendors uses 120s TTL', async () => {
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn() };
    const svc = makeSvc(redis);
    await svc.getVendors();
    expect(redis.cached).toHaveBeenCalledWith('admin:purchase:vendors:true', 120, expect.any(Function));
  });

  it('clearPurchaseCache fires on createMaterial', async () => {
    const redis = { cached: jest.fn((k, t, fn) => fn()), delPattern: jest.fn().mockResolvedValue(undefined) };
    const svc = makeSvc(redis);
    await svc.createMaterial({ name: 'New', uom: 'kg' });
    expect(redis.delPattern).toHaveBeenCalledWith('admin:purchase:*');
  });
});
