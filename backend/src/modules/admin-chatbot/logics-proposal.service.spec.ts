import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LogicsProposalService } from './logics-proposal.service';
import { DEFAULT_FORMULAS } from '../billing/logics/formula-engine';

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      // mirrors SET key value EX ttl [NX]: with NX only the first writer gets 'OK'
      set: jest.fn(async (k: string, v: string, _ex: string, _ttl: number, nx?: string) => {
        if (nx === 'NX' && store.has(k)) return null;
        store.set(k, v);
        return 'OK';
      }),
    },
    getJson: jest.fn(async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null)),
    del: jest.fn(async (k: string) => { store.delete(k); }),
  };
}

let redis: ReturnType<typeof fakeRedis>;
let current: Record<string, string>;
let logics: any;
const make = () => new LogicsProposalService(redis as any, logics);
const proposalKeys = () => [...redis.store.keys()].filter((k) => !k.includes(':claimed:'));
const roundDown = { kind: 'choice', box: 9, choice: 'Round down to the rupee', startsOn: '2026-12-01', reason: 'supplier rule' };

beforeEach(() => {
  redis = fakeRedis();
  current = { ...DEFAULT_FORMULAS };
  logics = {
    formulasFor: jest.fn(async () => ({ version: 0, formulas: current })),
    registry: jest.fn(async () => ({
      history: [{ version: 2, slots: { taxAmt: 'floor(taxable * gstRate / 100)' } }],
      params: [{ key: 'b2clThreshold', value: 10_000_000 }, { key: 'gstr2bTolerancePaise', value: 2 }, { key: 'whatsappRetryDelaysSec', value: '60,300,1800,7200' }],
    })),
    assertFormulaStart: jest.fn(async () => new Date()),
    assertParamStart: jest.fn(async () => new Date()),
    publish: jest.fn(async () => ({ version: 3 })),
    setParam: jest.fn(async () => ({})),
  };
});

describe('preparing a change', () => {
  it('turns a ready-made choice into a card with the sample bill before and after, and stores it without applying anything', async () => {
    const r: any = await make().create('admin1', roundDown);
    expect(r.title).toBe('Round-off: Round down to the rupee');
    expect(r.startsOn).toBe('2026-12-01');
    expect(r.sample.today.billTotal).toBe('₹2,213.00');
    expect(r.sample.withChange.billTotal).toBe('₹2,212.00');
    expect(proposalKeys()).toHaveLength(1);
    expect(logics.publish).not.toHaveBeenCalled();
    expect(logics.setParam).not.toHaveBeenCalled();
  });

  it('matches a choice by id or label, ignoring case', async () => {
    expect(await make().create('a', { ...roundDown, choice: 'ROUND DOWN TO THE RUPEE' })).toHaveProperty('id');
    expect(await make().create('a', { ...roundDown, choice: 'down' })).toHaveProperty('id');
  });

  it('explains a wrong box or choice instead of guessing', async () => {
    expect(await make().create('a', { ...roundDown, box: 42 })).toHaveProperty('error', expect.stringContaining('no box 42'));
    expect(await make().create('a', { ...roundDown, choice: 'sideways' })).toHaveProperty('error', expect.stringContaining('"Nearest rupee"'));
  });

  it('refuses a change that would not change anything', async () => {
    expect(await make().create('a', { ...roundDown, choice: 'Nearest rupee' })).toHaveProperty('error', expect.stringContaining('already set'));
  });

  it('accepts a custom formula that passes the safety checks and refuses one that fails', async () => {
    const ok = { kind: 'formula', changes: [{ step: 'taxAmt', formula: 'floor(taxable * gstRate / 100)' }], startsOn: '2026-12-01', reason: 'r' };
    expect(await make().create('a', ok)).toHaveProperty('title', 'Custom formula change');
    const bad = { ...ok, changes: [{ step: 'taxAmt', formula: 'round(taxable * gstRate / 50)' }] };
    expect(await make().create('a', bad)).toHaveProperty('error', expect.stringContaining('safety checks'));
    expect(await make().create('a', { ...ok, changes: [{ step: 'nope', formula: '1' }] })).toHaveProperty('error', expect.stringContaining('Unknown step'));
  });

  it('can go back to the built-in formulas or to a published version', async () => {
    current = { ...DEFAULT_FORMULAS, taxAmt: 'floor(taxable * gstRate / 100)' };
    expect(await make().create('a', { kind: 'revert', toVersion: 0, startsOn: '2026-12-01', reason: 'undo' })).toHaveProperty('title', 'Go back to the built-in formulas');
    current = { ...DEFAULT_FORMULAS };
    expect(await make().create('a', { kind: 'revert', toVersion: 2, startsOn: '2026-12-01', reason: 'undo' })).toHaveProperty('title', 'Go back to version 2');
    expect(await make().create('a', { kind: 'revert', toVersion: 99, startsOn: '2026-12-01', reason: 'undo' })).toHaveProperty('error', expect.stringContaining('not found'));
  });

  it('prepares a setting change after validating the value', async () => {
    const s = { kind: 'setting', setting: 'B2CL invoice limit', value: '20000000', startsOn: '2026-12-01', reason: 'limit up' };
    const r: any = await make().create('a', s);
    expect(r.title).toContain('B2CL invoice limit');
    expect(JSON.parse(redis.store.get(`chat:logics-proposal:${r.id}`)!)).toMatchObject({ kind: 'setting', key: 'b2clThreshold', value: 20_000_000 });
    expect(await make().create('a', { ...s, value: '-5' })).toHaveProperty('error');
    expect(await make().create('a', { ...s, setting: 'something else' })).toHaveProperty('error', expect.stringContaining('can be changed'));
    expect(await make().create('a', { ...s, value: '10000000' })).toHaveProperty('error', expect.stringContaining('already'));
  });

  it('refuses a setting start date the page would refuse, before showing a card', async () => {
    logics.assertParamStart.mockRejectedValue(new BadRequestException("Start date must be later than the current value's start date"));
    const r = await make().create('a', { kind: 'setting', setting: 'B2CL invoice limit', value: '20000000', startsOn: '2026-01-01', reason: 'x' });
    expect(r).toHaveProperty('error', expect.stringContaining('later than'));
    expect(proposalKeys()).toHaveLength(0);
  });

  it('needs a signed-in admin, a real start date and a reason', async () => {
    expect(await make().create(undefined, roundDown)).toHaveProperty('error');
    expect(await make().create('a', { ...roundDown, startsOn: 'tomorrow' })).toHaveProperty('error', expect.stringContaining('YYYY-MM-DD'));
    expect(await make().create('a', { ...roundDown, startsOn: '2026-13-45' })).toHaveProperty('error', expect.stringContaining('YYYY-MM-DD'));
    expect(await make().create('a', { ...roundDown, reason: '  ' })).toHaveProperty('error', expect.stringContaining('reason'));
    expect(proposalKeys()).toHaveLength(0);
  });

  it('refuses a start date the Logics page would refuse (filed period, before an existing version)', async () => {
    logics.assertFormulaStart.mockRejectedValue(new BadRequestException('Books are locked until 2026-09-30'));
    expect(await make().create('a', roundDown)).toHaveProperty('error', expect.stringContaining('locked'));
    expect(proposalKeys()).toHaveLength(0);
  });
});

describe('confirming a change', () => {
  it('applies it through the same publish as the page, tagged as made via the assistant, and uses the stored change exactly', async () => {
    const svc = make();
    const card: any = await svc.create('admin1', roundDown);
    const res = await svc.confirm({ sub: 'admin1' }, card.id, '1.2.3.4');
    expect(res.message).toContain('version 3');
    const [formulas, startsOn, reason, userId, ip] = logics.publish.mock.calls[0];
    expect(formulas.grandTotal).toBe('roundOff ? floor(grandBefore / 100) * 100 : grandBefore');
    expect([startsOn, reason, userId, ip]).toEqual(['2026-12-01', 'supplier rule (via assistant)', 'admin1', '1.2.3.4']);
    expect(proposalKeys()).toHaveLength(0);
  });

  it('applies a setting change through setParam', async () => {
    const svc = make();
    const card: any = await svc.create('admin1', { kind: 'setting', setting: 'gstr2bTolerancePaise', value: 5, startsOn: '2026-12-01', reason: 'looser' });
    await svc.confirm({ sub: 'admin1' }, card.id, '');
    expect(logics.setParam).toHaveBeenCalledWith('gstr2bTolerancePaise', 5, '2026-12-01', 'looser (via assistant)', 'admin1', '');
  });

  it('does not undo a change another admin published after the proposal was prepared', async () => {
    const svc = make();
    const card: any = await svc.create('admin1', roundDown); // box 9 only
    current = { ...DEFAULT_FORMULAS, taxAmt: 'floor(taxable * gstRate / 100)' }; // someone else changes box 5 meanwhile
    await svc.confirm({ sub: 'admin1' }, card.id, '');
    const published = logics.publish.mock.calls[0][0];
    expect(published.taxAmt).toBe('floor(taxable * gstRate / 100)'); // their change survives
    expect(published.grandTotal).toBe('roundOff ? floor(grandBefore / 100) * 100 : grandBefore'); // ours is applied
  });

  it('going back to an earlier version replaces everything, whatever changed since', async () => {
    const svc = make();
    const card: any = await svc.create('admin1', { kind: 'revert', toVersion: 2, startsOn: '2026-12-01', reason: 'undo' });
    current = { ...DEFAULT_FORMULAS, grandTotal: 'roundOff ? ceil(grandBefore / 100) * 100 : grandBefore' };
    await svc.confirm({ sub: 'admin1' }, card.id, '');
    expect(logics.publish.mock.calls[0][0]).toEqual({ ...DEFAULT_FORMULAS, taxAmt: 'floor(taxable * gstRate / 100)' });
  });

  it('can be used only once, even if two confirms arrive together', async () => {
    const svc = make();
    const card: any = await svc.create('admin1', roundDown);
    const results = await Promise.allSettled([svc.confirm({ sub: 'admin1' }, card.id, ''), svc.confirm({ sub: 'admin1' }, card.id, '')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(logics.publish).toHaveBeenCalledTimes(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  it('is refused for a different admin, and nothing is applied or lost', async () => {
    const svc = make();
    const card: any = await svc.create('admin1', roundDown);
    await expect(svc.confirm({ sub: 'someone-else' }, card.id, '')).rejects.toBeInstanceOf(ForbiddenException);
    expect(logics.publish).not.toHaveBeenCalled();
    expect(proposalKeys()).toHaveLength(1);
  });

  it('is refused when it has expired or never existed', async () => {
    await expect(make().confirm({ sub: 'admin1' }, 'deadbeef', '')).rejects.toBeInstanceOf(NotFoundException);
    expect(logics.publish).not.toHaveBeenCalled();
  });

  it('passes the page\'s own error back and uses the proposal up', async () => {
    const svc = make();
    const card: any = await svc.create('admin1', roundDown);
    logics.publish.mockRejectedValue(new BadRequestException('Books are locked until 2026-12-05'));
    await expect(svc.confirm({ sub: 'admin1' }, card.id, '')).rejects.toThrow(/locked/);
    await expect(svc.confirm({ sub: 'admin1' }, card.id, '')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancelling removes it, only for the admin it belongs to', async () => {
    const svc = make();
    const card: any = await svc.create('admin1', roundDown);
    await expect(svc.cancel({ sub: 'other' }, card.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.cancel({ sub: 'admin1' }, card.id)).resolves.toEqual({ message: 'Cancelled. Nothing was changed.' });
    await expect(svc.confirm({ sub: 'admin1' }, card.id, '')).rejects.toBeInstanceOf(NotFoundException);
    expect(logics.publish).not.toHaveBeenCalled();
  });
});
