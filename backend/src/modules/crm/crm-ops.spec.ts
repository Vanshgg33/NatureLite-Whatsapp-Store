import { goalStatus, medianMinutes, monthRange, needsReply } from './crm-ops.logic';

describe('goalStatus', () => {
  const mid = new Date('2026-11-15T18:30:00Z'); // exactly halfway through the 30-day IST month
  it('is on track when progress matches elapsed time', () => {
    expect(goalStatus(500, 1000, '2026-11', mid).status).toBe('on_track');
    expect(goalStatus(300, 1000, '2026-11', mid).status).toBe('behind');
    expect(goalStatus(1000, 1000, '2026-11', mid).status).toBe('done');
  });
  it('handles an unset target', () => {
    expect(goalStatus(5, 0, '2026-11', mid).progressPct).toBeNull();
  });
});

describe('monthRange', () => {
  it('uses IST boundaries and crosses the year', () => {
    expect(monthRange('2026-12').to.toISOString()).toBe('2026-12-31T18:30:00.000Z');
  });
});

describe('medianMinutes', () => {
  const t = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m));
  it('ignores leads never contacted', () => {
    expect(medianMinutes([{ createdAt: t(0), firstContactAt: t(4) }, { createdAt: t(0), firstContactAt: t(10) }, { createdAt: t(0), firstContactAt: null }])).toBe(7);
    expect(medianMinutes([])).toBeNull();
  });
});

describe('needsReply', () => {
  it('flags inbound last messages', () => {
    expect(needsReply('inbound')).toBe(true);
    expect(needsReply('outbound')).toBe(false);
  });
});

describe('CrmOpsService.bulkAddTag', () => {
  const { CrmOpsService } = require('./crm-ops.service');
  const make = () => {
    const statsModel: any = { updateMany: jest.fn().mockResolvedValue({ matchedCount: 2, modifiedCount: 1 }) };
    const svc = new CrmOpsService(...Array(4).fill({}), statsModel, ...Array(6).fill({}));
    return { svc, statsModel };
  };
  const id = '64b64c3f9f1b2c0012345678';

  it('lowercases the tag and adds it without duplicates', async () => {
    const { svc, statsModel } = make();
    expect(await svc.bulkAddTag([id], '  VIP ')).toEqual({ matched: 2, updated: 1 });
    expect(statsModel.updateMany.mock.calls[0][1]).toEqual({ $addToSet: { tags: 'vip' } });
  });

  it('rejects bad input before touching the database', async () => {
    const { svc, statsModel } = make();
    await expect(svc.bulkAddTag([id], '')).rejects.toThrow();
    await expect(svc.bulkAddTag(['nope'], 'vip')).rejects.toThrow();
    await expect(svc.bulkAddTag([], 'vip')).rejects.toThrow();
    await expect(svc.bulkAddTag('x', 'vip')).rejects.toThrow();
    expect(statsModel.updateMany).not.toHaveBeenCalled();
  });
});
