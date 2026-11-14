import { BadRequestException } from '@nestjs/common';
import { LogicsService } from './logics.service';
import { DEFAULT_FORMULAS } from './formula-engine';

// findOne(...).sort(...).lean() / findOne(...).sort(...) both resolve to `doc`
const finder = (doc: any) => jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue(Object.assign(Promise.resolve(doc), { lean: () => Promise.resolve(doc) })) });

function make(opts: { latestSet?: any; prevParam?: any; locked?: boolean } = {}) {
  const setModel: any = { findOne: finder(opts.latestSet ?? null), create: jest.fn(async d => ({ ...d, _id: 'f1' })) };
  const prev = opts.prevParam ? { ...opts.prevParam, updateOne: jest.fn(), toObject: () => opts.prevParam } : null;
  const paramModel: any = { findOne: finder(prev), create: jest.fn(async d => ({ ...d, _id: 'p1', toObject: () => d })) };
  const changelog: any = { create: jest.fn() };
  const tax: any = {
    assertPeriodOpen: jest.fn(async () => { if (opts.locked) throw new BadRequestException('Books are locked'); }),
    paramOrDefault: jest.fn(),
  };
  return { svc: new LogicsService(setModel, paramModel, changelog, tax), setModel, paramModel, changelog, prev };
}

describe('LogicsService.publish', () => {
  it('publishes valid formulas as the next version and writes the change log', async () => {
    const { svc, setModel, changelog } = make({ latestSet: { version: 2, effectiveFrom: new Date('2026-01-01') } });
    await svc.publish({ ...DEFAULT_FORMULAS, taxAmt: 'floor(taxable * gstRate / 100)' }, '2026-06-01', 'floor tax', 'u1', '1.1.1.1');
    expect(setModel.create).toHaveBeenCalledWith(expect.objectContaining({ version: 3, reason: 'floor tax', createdBy: 'u1' }));
    expect(changelog.create).toHaveBeenCalledWith(expect.objectContaining({ entity: 'FormulaSet', action: 'create' }));
  });
  it('rejects a start date earlier than an existing version (it would never apply)', async () => {
    const { svc, setModel } = make({ latestSet: { version: 1, effectiveFrom: new Date('2026-08-01') } });
    await expect(svc.publish(DEFAULT_FORMULAS, '2026-07-01', 'revert', 'u', '')).rejects.toThrow(/already starts on 2026-08-01/);
    expect(setModel.create).not.toHaveBeenCalled();
  });
  it('allows republishing on the same start date', async () => {
    const { svc } = make({ latestSet: { version: 1, effectiveFrom: new Date('2026-07-01T00:00:00+05:30') } });
    await expect(svc.publish(DEFAULT_FORMULAS, '2026-07-01', 'fix', 'u', '')).resolves.toBeDefined();
  });
  it('rejects formulas that fail the checks and saves nothing', async () => {
    const { svc, setModel } = make();
    await expect(svc.publish({ ...DEFAULT_FORMULAS, taxAmt: 'round(taxable * gstRate / 50)' }, '2026-07-01', 'x', 'u', '')).rejects.toThrow(/failed the checks/);
    expect(setModel.create).not.toHaveBeenCalled();
  });
  it('rejects a filed period, a missing reason, an empty or unknown-shaped body', async () => {
    await expect(make({ locked: true }).svc.publish(DEFAULT_FORMULAS, '2026-01-01', 'x', 'u', '')).rejects.toThrow(/locked/);
    await expect(make().svc.publish(DEFAULT_FORMULAS, '2026-07-01', '   ', 'u', '')).rejects.toThrow(/reason/);
    await expect(make().svc.publish(DEFAULT_FORMULAS, '2026-07-01', undefined as any, 'u', '')).rejects.toThrow(/reason/);
    await expect(make().svc.publish({ ...DEFAULT_FORMULAS, cgst: '' }, '2026-07-01', 'x', 'u', '')).rejects.toThrow(/empty/);
    await expect(make().svc.publish(DEFAULT_FORMULAS, 'not-a-date', 'x', 'u', '')).rejects.toThrow(/valid date/);
  });
});

describe('LogicsService.publish concurrency', () => {
  const bump = { ...DEFAULT_FORMULAS, taxAmt: 'floor(taxable * gstRate / 100)' };
  it('refuses when a newer version was published since the caller loaded the page', async () => {
    const { svc, setModel } = make({ latestSet: { version: 3, effectiveFrom: new Date('2026-01-01') } });
    await expect(svc.publish(bump, '2026-06-01', 'r', 'u', '', 2)).rejects.toThrow(/Someone published a newer version/);
    expect(setModel.create).not.toHaveBeenCalled();
  });
  it('accepts the current version, or no version (older callers)', async () => {
    const { svc } = make({ latestSet: { version: 3, effectiveFrom: new Date('2026-01-01') } });
    await expect(svc.publish(bump, '2026-06-01', 'r', 'u', '', 3)).resolves.toBeDefined();
    await expect(svc.publish(bump, '2026-06-01', 'r', 'u', '')).resolves.toBeDefined();
  });
  it('treats version 0 as nothing published yet', async () => {
    const { svc } = make();
    await expect(svc.publish(bump, '2026-06-01', 'r', 'u', '', 0)).resolves.toBeDefined();
    await expect(svc.publish(bump, '2026-06-01', 'r', 'u', '', 1)).rejects.toThrow(/newer version/);
  });
});

describe('LogicsService.formulasFor', () => {
  it('returns the built-in set (version 0) when nothing is published', async () => {
    expect(await make().svc.formulasFor(new Date())).toEqual({ version: 0, formulas: DEFAULT_FORMULAS });
  });
  it('fills slots missing from an older stored version with the built-in ones', async () => {
    const r = await make({ latestSet: { version: 4, slots: { taxAmt: 'floor(taxable * gstRate / 100)' } } }).svc.formulasFor(new Date());
    expect(r.version).toBe(4);
    expect(r.formulas.taxAmt).toBe('floor(taxable * gstRate / 100)');
    expect(r.formulas.gross).toBe(DEFAULT_FORMULAS.gross);
  });
});

describe('LogicsService.setParam', () => {
  it('closes the previous value on the new start date', async () => {
    const { svc, paramModel, prev } = make({ prevParam: { key: 'b2clThreshold', effectiveFrom: new Date('2024-08-01') } });
    await svc.setParam('b2clThreshold', '5000000', '2026-07-01', 'limit changed', 'u', '');
    expect(prev!.updateOne).toHaveBeenCalledWith({ effectiveTo: new Date('2026-07-01T00:00:00+05:30') });
    expect(paramModel.create).toHaveBeenCalledWith(expect.objectContaining({ key: 'b2clThreshold', value: 5_000_000, unit: 'paise' }));
  });
  it('saves the new value before closing the old one, and leaves the old one open if saving fails', async () => {
    const a = make({ prevParam: { key: 'b2clThreshold', effectiveFrom: new Date('2024-08-01') } });
    await a.svc.setParam('b2clThreshold', '5000000', '2026-07-01', 'r', 'u', '');
    expect(a.paramModel.create.mock.invocationCallOrder[0]).toBeLessThan(a.prev!.updateOne.mock.invocationCallOrder[0]);
    const b = make({ prevParam: { key: 'b2clThreshold', effectiveFrom: new Date('2024-08-01') } });
    b.paramModel.create.mockRejectedValue(new Error('db down'));
    await expect(b.svc.setParam('b2clThreshold', '5000000', '2026-07-01', 'r', 'u', '')).rejects.toThrow('db down');
    expect(b.prev!.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a start date not after the current value, bad values, unknown keys, filed periods', async () => {
    const withPrev = () => make({ prevParam: { key: 'b2clThreshold', effectiveFrom: new Date('2026-07-01T00:00:00+05:30') } }).svc;
    await expect(withPrev().setParam('b2clThreshold', 1, '2026-07-01', 'x', 'u', '')).rejects.toThrow(/later than/);
    await expect(make().svc.setParam('b2clThreshold', -5, '2026-07-01', 'x', 'u', '')).rejects.toThrow(/whole number/);
    await expect(make().svc.setParam('gstr1FiledUntil', '2026-12-31', '2026-07-01', 'x', 'u', '')).rejects.toThrow(/cannot be edited/);
    await expect(make({ locked: true }).svc.setParam('b2clThreshold', 1, '2026-01-01', 'x', 'u', '')).rejects.toThrow(/locked/);
    await expect(make().svc.setParam('b2clThreshold', 1, '2026-07-01', '', 'u', '')).rejects.toThrow(/reason/);
  });
});
