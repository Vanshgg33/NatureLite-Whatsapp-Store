import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CrmLogicsService } from './crm-logics.service';
import { checkCrmValues, CRM_VALUE_DEFS } from './crm-param-defs';
import { CRM_GROUPS } from './crm-groups';
import { CRM_SLOT_KEYS, DEFAULT_CRM_FORMULAS, DEFAULT_CRM_RULES, crmSelfCheck } from '../engine/crm-formulas';

const sorted = (v: unknown) => ({ sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(v), limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(v) })) })) });
function make(opts: { sets?: any[]; settings?: any } = {}) {
  const sets = opts.sets ?? [];
  const setModel: any = {
    findOne: jest.fn(() => sorted(sets.length ? sets[sets.length - 1] : null)),
    find: jest.fn(() => sorted([...sets].reverse())),
    create: jest.fn(async (d: any) => { sets.push(d); return d; }),
  };
  const settingsModel: any = { findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(opts.settings ?? null) })), findOneAndUpdate: jest.fn(async () => ({})) };
  const logModel: any = { create: jest.fn(async () => ({})) };
  const engine: any = { refreshAll: jest.fn(async () => {}), loadRules: jest.fn(async () => DEFAULT_CRM_RULES) };
  return { svc: new CrmLogicsService(engine, settingsModel, setModel, logModel), setModel, settingsModel, logModel, engine, sets };
}

describe('value checks', () => {
  const cur = Object.fromEntries(CRM_VALUE_DEFS.map(d => [d.key, d.default])) as Record<string, number>;
  it('accepts a sensible change', () => {
    expect(checkCrmValues(cur, { atRiskAfterDays: 10, dormantAfterDays: 50, lostAfterDays: 150 })).toEqual({ values: { atRiskAfterDays: 10, dormantAfterDays: 50, lostAfterDays: 150 } });
  });
  it.each([
    [{ atRiskAfterDays: 70 }, /below/],
    [{ priorityMediumAt: 70 }, /below/],
    [{ dueSoonDays: 2.5 }, /whole/],
    [{ minOrdersForPersonal: 1 }, /between/],
    [{ dailyCallTarget: 'lots' }, /number/],
    [{ nonsense: 1 }, /Unknown/],
    [{ reorderCycles: { Ghee: 0 } }, /between/],
  ])('refuses %j', (patch, msg) => {
    const r: any = checkCrmValues(cur, patch);
    expect(r.error).toMatch(msg);
  });
  it('merges category cycles', () => {
    expect(checkCrmValues(cur, { reorderCycles: { Ghee: 40 } })).toEqual({ values: {}, cycles: { Ghee: 40 } });
  });
});

describe('boxes', () => {
  it('every ready-made choice passes the safety check and the first choice is built-in', () => {
    for (const g of CRM_GROUPS) for (const o of g.options) expect(crmSelfCheck({ ...DEFAULT_CRM_FORMULAS, ...o.set })).toEqual([]);
    for (const g of CRM_GROUPS.filter(x => x.slots.length)) expect(g.options[0].set).toEqual({ [g.slots[0]]: DEFAULT_CRM_FORMULAS[g.slots[0]] });
  });
  it('every slot and value sits in exactly one box', () => {
    for (const s of CRM_SLOT_KEYS) expect(CRM_GROUPS.filter(g => g.slots.includes(s))).toHaveLength(1);
    for (const d of [...CRM_VALUE_DEFS.map(x => x.key), 'reorderCycles']) expect(CRM_GROUPS.filter(g => g.values.includes(d))).toHaveLength(1);
  });
});

describe('registry', () => {
  it('shows built-ins at version 0', async () => {
    const r: any = await make().svc.registry();
    expect(r.latestVersion).toBe(0);
    expect(r.active.formulas).toEqual(DEFAULT_CRM_FORMULAS);
    expect(r.values.find((v: any) => v.key === 'dueSoonDays').value).toBe(7);
  });
});

describe('publishFormulas', () => {
  const good = { ...DEFAULT_CRM_FORMULAS, personalCycle: 'min(max(meanGap, 7), 120)' };
  it('needs a reason', async () => { await expect(make().svc.publishFormulas(good, ' ', 'u', 'ip')).rejects.toBeInstanceOf(BadRequestException); });
  it('refuses a formula that fails the check and saves nothing', async () => {
    const t = make();
    await expect(t.svc.publishFormulas({ ...good, priorityScore: '1 / 0' }, 'r', 'u', 'ip')).rejects.toThrow(/failed the checks/);
    expect(t.setModel.create).not.toHaveBeenCalled();
    expect(t.engine.refreshAll).not.toHaveBeenCalled();
  });
  it('refuses a missing or empty step', async () => {
    await expect(make().svc.publishFormulas({ personalCycle: 'meanGap' }, 'r', 'u', 'ip')).rejects.toThrow(/empty/);
  });
  it('creates numbered versions, logs the change and recomputes everyone', async () => {
    const t = make();
    await t.svc.publishFormulas(good, 'use average', 'u', 'ip', 0);
    await t.svc.publishFormulas(DEFAULT_CRM_FORMULAS, 'go back', 'u', 'ip', 1); // going back = publishing the older formulas as a new version
    expect(t.sets.map(s => s.version)).toEqual([1, 2]);
    expect(t.sets[1].formulas).toEqual(DEFAULT_CRM_FORMULAS);
    expect(t.logModel.create).toHaveBeenCalledTimes(2);
    expect(t.engine.refreshAll).toHaveBeenCalledWith('settings');
  });
  it('refuses when someone published in the meantime', async () => {
    const t = make({ sets: [{ version: 3, formulas: DEFAULT_CRM_FORMULAS }] });
    await expect(t.svc.publishFormulas(good, 'r', 'u', 'ip', 2)).rejects.toThrow(/newer version/);
    expect(t.setModel.create).not.toHaveBeenCalled();
  });
});

describe('setValues', () => {
  it('writes whole thresholds object so nothing is lost, logs and recomputes', async () => {
    const t = make();
    await t.svc.setValues({ atRiskAfterDays: 10 }, 'earlier alert', 'u', 'ip');
    const set = t.settingsModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.thresholds).toEqual({ atRiskAfterDays: 10, dormantAfterDays: 60, lostAfterDays: 180 });
    expect(t.logModel.create).toHaveBeenCalledWith(expect.objectContaining({ area: 'values', reason: 'earlier alert' }));
    expect(t.engine.refreshAll).toHaveBeenCalledWith('settings');
  });
  it('refuses bad values and a missing reason without writing', async () => {
    const t = make();
    await expect(t.svc.setValues({ atRiskAfterDays: 70 }, 'r', 'u', 'ip')).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.svc.setValues({ dueSoonDays: 3 }, '', 'u', 'ip')).rejects.toThrow(/reason/);
    expect(t.settingsModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('merges category cycles into the stored ones', async () => {
    const t = make({ settings: { reorderCycles: { Ghee: 50, Spices: 45 } } });
    await t.svc.setValues({ reorderCycles: { Ghee: 40 } }, 'r', 'u', 'ip');
    expect(t.settingsModel.findOneAndUpdate.mock.calls[0][1].$set.reorderCycles).toEqual({ Ghee: 40, Spices: 45 });
  });
});

describe('preview', () => {
  it('shows samples before and after and lists problems without saving', async () => {
    const t = make();
    const r: any = t.svc.preview ? await t.svc.preview({ ...DEFAULT_CRM_FORMULAS, priorityScore: 'ltvPct * 1000' }, undefined) : null;
    expect(r.problems.join(' ')).toMatch(/0 and 100/);
    expect(r.today).toHaveLength(r.withChange.length);
    expect(t.setModel.create).not.toHaveBeenCalled();
  });
});
void ForbiddenException;
