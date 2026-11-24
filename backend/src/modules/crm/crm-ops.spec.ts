import { buildAlerts, digestWindows, goalStatus, medianMinutes, monthRange, needsReply } from './crm-ops.logic';

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

describe('digestWindows', () => {
  const now = new Date('2026-11-24T06:30:00Z'); // 12:00 IST
  it('day = today so far in IST vs yesterday up to the same time', () => {
    const w = digestWindows('day', now);
    expect([w.from, w.to, w.prevFrom, w.prevTo].map(d => d.toISOString())).toEqual([
      '2026-11-23T18:30:00.000Z', '2026-11-24T06:30:00.000Z', '2026-11-22T18:30:00.000Z', '2026-11-23T06:30:00.000Z']);
  });
  it('week = last 7 days vs the 7 before', () => {
    const w = digestWindows('week', now);
    expect(+w.to - +w.from).toBe(7 * 86_400_000);
    expect(+w.prevTo).toBe(+w.from);
  });
});

describe('buildAlerts', () => {
  const quiet = { overdueCallbacks: 0, goalsBehind: [], unrepliedChats: 0, highRiskCustomers: 0, lowRatedFeedback: 0, uncontactedLeads: 0, staleFeeds: [], revenue: { current: 100, previous: 100 } };
  it('nothing to act on = no alerts', () => {
    expect(buildAlerts(quiet)).toEqual([]);
  });
  it('ranks high before medium and scales severity with volume', () => {
    const a = buildAlerts({ ...quiet, overdueCallbacks: 3, uncontactedLeads: 2, unrepliedChats: 6 });
    expect(a.map(x => [x.key, x.severity])).toEqual([['leads', 'high'], ['inbox', 'high'], ['callbacks', 'medium']]);
    expect(buildAlerts({ ...quiet, overdueCallbacks: 10 })[0].severity).toBe('high');
  });
  it('revenue drop only past 30% and only with a previous period', () => {
    expect(buildAlerts({ ...quiet, revenue: { current: 71, previous: 100 } })).toEqual([]);
    expect(buildAlerts({ ...quiet, revenue: { current: 50, previous: 100 } })[0].title).toBe('Revenue down 50% vs the previous period');
    expect(buildAlerts({ ...quiet, revenue: { current: 0, previous: 0 } })).toEqual([]);
  });
  it('stale feed and behind goal', () => {
    const a = buildAlerts({ ...quiet, staleFeeds: [{ name: 'Billing (POS)', hours: null }], goalsBehind: [{ metric: 'revenue', progressPct: 20, elapsedPct: 50 }] });
    expect(a.map(x => x.title)).toEqual(['Billing (POS): no data ever', 'Goal behind: revenue']);
  });
});
