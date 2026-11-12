import { normalisePhone, groupDuplicatePhones, CrmFoundationService } from './crm-foundation.service';

describe('crm foundation helpers', () => {
  it('normalises Indian phone formats to 10 digits', () => {
    for (const p of ['9876543210', '+91 98765-43210', '919876543210', '09876543210']) expect(normalisePhone(p)).toBe('9876543210');
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
  });

  it('groups only real duplicates', () => {
    const g = groupDuplicatePhones([
      { phone: '9876543210' }, { phone: '+919876543210' }, { phone: '9000000001' }, { phone: '' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].phone).toBe('9876543210');
    expect(g[0].users).toHaveLength(2);
  });
});

describe('CrmFoundationService.listOrders', () => {
  const make = () => {
    const find = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
    const orderModel: any = { find: jest.fn(() => find), countDocuments: jest.fn().mockResolvedValue(0) };
    return { orderModel, svc: new CrmFoundationService(orderModel, {} as any, {} as any) };
  };

  it('escapes regex characters in search so input cannot break the query', async () => {
    const { svc, orderModel } = make();
    await svc.listOrders({ search: '.*(' });
    const re: RegExp = orderModel.find.mock.calls[0][0].$or[0].orderNumber;
    expect(re.test('ABC')).toBe(false);
    expect(re.test('x.*(')).toBe(true);
  });

  it('caps limit at 100 and rejects invalid dates without querying', async () => {
    const { svc, orderModel } = make();
    expect((await svc.listOrders({ limit: 5000 })).limit).toBe(100);
    expect((await svc.listOrders({ from: 'garbage' })).items).toEqual([]);
    expect(orderModel.find).toHaveBeenCalledTimes(1);
  });
});
