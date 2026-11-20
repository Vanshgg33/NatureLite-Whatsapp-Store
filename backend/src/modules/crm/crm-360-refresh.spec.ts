import { NotFoundException } from '@nestjs/common';
import { CrmService } from './crm.service';

// Opening a customer profile recomputes that customer's CRM stats before reading them,
// so LTV can never sit stale next to the live purchase history.
describe('CrmService.getCustomer360 refresh-on-open', () => {
  const uid = '6aa1800aead3b2fd88a4d9f8';
  function make(exists: boolean, refreshFails = false) {
    const order: string[] = [];
    const chain = (v: any) => { const q: any = { sort: () => q, limit: () => q, populate: () => q, select: () => q, lean: () => Promise.resolve(v) }; return q; };
    const svc: any = Object.create(CrmService.prototype);
    svc.userModel = { exists: jest.fn().mockResolvedValue(exists ? { _id: uid } : null), findById: () => chain({ _id: uid, name: 'Reji' }) };
    svc.statsModel = { findOne: jest.fn(() => { order.push('read-stats'); return chain({ ltv: 27313 }); }) };
    svc.callLogModel = { find: () => chain([]) };
    svc.orderModel = { find: () => chain([]) };
    svc.paymentModel = { find: jest.fn() };
    svc.engine = { refreshUser: jest.fn(async () => { order.push('refresh'); if (refreshFails) throw new Error('db busy'); }) };
    return { svc, order };
  }

  it('recomputes first, then reads the fresh stats', async () => {
    const { svc, order } = make(true);
    const r = await svc.getCustomer360(uid);
    expect(String(svc.engine.refreshUser.mock.calls[0][0])).toBe(uid);
    expect(order).toEqual(['refresh', 'read-stats']);
    expect(r.stats.ltv).toBe(27313);
  });

  it('a failed recompute still opens the profile with the last saved stats', async () => {
    await expect(make(true, true).svc.getCustomer360(uid)).resolves.toMatchObject({ stats: { ltv: 27313 } });
  });

  it('unknown customer: 404 and no stats row is created for it', async () => {
    const { svc } = make(false);
    await expect(svc.getCustomer360(uid)).rejects.toBeInstanceOf(NotFoundException);
    expect(svc.engine.refreshUser).not.toHaveBeenCalled();
  });
});
