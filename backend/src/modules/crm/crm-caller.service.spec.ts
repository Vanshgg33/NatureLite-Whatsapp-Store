import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CrmCallerService } from './crm-caller.service';
import { RolesGuard } from '../../common/guards/roles.guard';

/** chainable query mock: .select().sort().limit().populate().lean() → value */
const q = (value: unknown) => {
  const chain: any = {};
  ['select', 'sort', 'limit', 'populate', 'lean', 'setOptions'].forEach((k) => { chain[k] = () => chain; });
  chain.then = (res: any, rej: any) => Promise.resolve(value).then(res, rej);
  return chain;
};

const CUST = '64b64c3f9f1b2c0012345678';
const ME = '64b64c3f9f1b2c00aaaaaaaa';
const caller = { sub: ME, role: 'admin', name: 'Rahul', departmentType: 'crm_senior' } as any;

function make(over: Record<string, any> = {}) {
  const m = {
    shift: { findOne: jest.fn(() => q(null)), updateOne: jest.fn().mockResolvedValue({}), find: jest.fn(() => q([])) },
    asg: { findOne: jest.fn(() => q(null)), updateOne: jest.fn().mockResolvedValue({}), findOneAndUpdate: jest.fn(() => q(null)), aggregate: jest.fn().mockResolvedValue([]) },
    rem: { find: jest.fn(() => q([])), updateOne: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}), findById: jest.fn() },
    stats: { findOne: jest.fn(() => q({ consecutiveNoAnswer: 0, callAttempts: 2 })), updateOne: jest.fn().mockResolvedValue({}) },
    call: { find: jest.fn(() => q([])), countDocuments: jest.fn().mockResolvedValue(0) },
    settings: { findOne: jest.fn(() => q(null)) },
    user: { findById: jest.fn(() => q({ _id: CUST, name: 'Sharma Ji', phone: '9876543210' })) },
    crm: { logCall: jest.fn().mockResolvedValue({ _id: 'log1' }), logNudge: jest.fn().mockResolvedValue({}), logActivity: jest.fn() },
    ...over,
  };
  const svc = new CrmCallerService(
    m.shift as any, m.asg as any, m.rem as any, m.stats as any, m.call as any, m.settings as any,
    {} as any, { create: jest.fn().mockResolvedValue({}) } as any, {} as any, m.user as any, {} as any, {} as any, {} as any, m.crm as any,
  );
  return { svc, m };
}

describe('CrmCallerService.logDisposition', () => {
  afterEach(() => jest.useRealTimers());

  it('a callback is saved on the customer (Callbacks page) with a reminder at the promised time', async () => {
    const { svc, m } = make();
    const at = new Date(Date.now() + 2 * 3_600_000).toISOString();
    await svc.logDisposition(caller, { customerId: CUST, outcome: 'callback', callbackAt: at });
    const [, update] = (m.stats.updateOne.mock.calls as any[])[0];
    expect(+update.$set.callbackAt).toBe(+new Date(at));
    expect(update.$set.consecutiveNoAnswer).toBe(0);
    expect(update.$inc).toEqual({ callAttempts: 1 });
    expect(m.rem.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'callback', dueAt: new Date(at) }));
    expect(m.crm.logCall.mock.calls[0][0].extra.attemptNo).toBe(3);
  });

  it('rejects a callback without a time before writing anything', async () => {
    const { svc, m } = make();
    await expect(svc.logDisposition(caller, { customerId: CUST, outcome: 'callback' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.logDisposition(caller, { customerId: CUST, outcome: 'nonsense' })).rejects.toBeInstanceOf(BadRequestException);
    expect(m.crm.logCall).not.toHaveBeenCalled();
    expect(m.stats.updateOne).not.toHaveBeenCalled();
  });

  it('second miss in a row counts up and sends the missed-you WhatsApp', async () => {
    const { svc, m } = make({ stats: { findOne: jest.fn(() => q({ consecutiveNoAnswer: 1, callAttempts: 1 })), updateOne: jest.fn().mockResolvedValue({}) } });
    const r = await svc.logDisposition(caller, { customerId: CUST, outcome: 'no_answer' });
    expect(m.stats.updateOne.mock.calls[0][1].$set.consecutiveNoAnswer).toBe(2);
    expect(m.crm.logNudge).toHaveBeenCalledWith(expect.objectContaining({ templateName: 'missed_you', customerId: CUST }));
    expect(r.waSent).toBe(true);
  });

  it('closes the open callback and records whether it was kept on time', async () => {
    const due = new Date(Date.now() - 5 * 60_000);
    const { svc, m } = make({ rem: { find: jest.fn(() => q([{ _id: 'r1', type: 'callback', dueAt: due }])), updateOne: jest.fn().mockResolvedValue({}), create: jest.fn() } });
    await svc.logDisposition(caller, { customerId: CUST, outcome: 'ordered' });
    expect(m.rem.updateOne).toHaveBeenCalledWith({ _id: 'r1' }, { $set: expect.objectContaining({ status: 'done', keptOnTime: true }) });
  });
});

describe('CrmCallerService.next', () => {
  it('without a shift there is no lead', async () => {
    const { svc } = make();
    const r = await svc.next(caller);
    expect(r).toMatchObject({ lead: null, reason: 'no_shift' });
  });

  it('claims atomically, only my open leads, with the mode filter', async () => {
    const shift = { status: 'active', currentMode: 'hot_first' };
    const { svc, m } = make({ shift: { findOne: jest.fn(() => q(shift)) } });
    m.asg.findOne = jest.fn(() => q(null));
    await svc.next(caller);
    const [filter, update, opts] = (m.asg.findOneAndUpdate.mock.calls as any[])[0];
    expect(filter.$and[0].callerId).toEqual(new Types.ObjectId(ME));
    expect(filter.$and[1]).toEqual({ score: { $gte: 70 } });
    expect(update.$set.state).toBe('in_progress');
    expect(opts.sort.score).toBe(-1);
  });
});

describe('CrmCallerService.next sort', () => {
  it('cleanup sweeps lowest score first; callback hunter oldest promise first', async () => {
    for (const [mode, first, dir] of [['cleanup', 'score', 1], ['callback_hunter', 'dueAt', 1]] as const) {
      const { svc, m } = make({ shift: { findOne: jest.fn(() => q({ status: 'active', currentMode: mode })) } });
      await svc.next(caller);
      const opts = (m.asg.findOneAndUpdate.mock.calls as any[])[0][2];
      expect(Object.keys(opts.sort)[0]).toBe(first);
      expect(opts.sort[first]).toBe(dir);
    }
  });
});

describe('CrmCallerService guards', () => {
  afterEach(() => jest.useRealTimers());

  it('refuses do-not-call customers and the daily dial limit', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-23T11:00:00+05:30'), doNotFake: ['nextTick', 'setImmediate'] });
    const shiftDoc = { status: 'active', onCall: null, save: jest.fn(), markModified: jest.fn() };
    const a = make({ shift: { findOne: jest.fn(() => q(shiftDoc)) }, stats: { findOne: jest.fn(() => q({ doNotCall: true })) } });
    await expect(a.svc.startCall(caller, { customerId: CUST })).rejects.toThrow('asked not to be called');
    const b = make({ shift: { findOne: jest.fn(() => q(shiftDoc)) }, call: { countDocuments: jest.fn().mockResolvedValue(3) } });
    await expect(b.svc.startCall(caller, { customerId: CUST })).rejects.toThrow('limit 3');
  });

  it('refuses calls outside calling hours', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-23T22:00:00+05:30'), doNotFake: ['nextTick', 'setImmediate'] });
    const { svc } = make({ shift: { findOne: jest.fn(() => q({ status: 'active', onCall: null })) } });
    await expect(svc.startCall(caller, { customerId: CUST })).rejects.toThrow('9:00–20:00');
  });

  it("a caller cannot snooze someone else's reminder", async () => {
    const { svc, m } = make();
    m.rem.findById.mockResolvedValue({ callerId: new Types.ObjectId(), save: jest.fn() });
    await expect(svc.updateReminder(caller, CUST, { action: 'done' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('RolesGuard: CRM managers and viewers', () => {
  const ctx = (departmentType: string, cls: string, handler = 'live') => ({
    getHandler: () => ({ name: handler }), getClass: () => ({ name: cls }),
    switchToHttp: () => ({ getRequest: () => ({ user: { role: 'admin', departmentType } }) }),
  }) as any;
  const guard = new RolesGuard({ getAllAndOverride: () => ['admin', 'superadmin'] } as any);
  it('reach CRM controllers', () => {
    expect(guard.canActivate(ctx('crm_manager', 'CrmCallerController'))).toBe(true);
    expect(guard.canActivate(ctx('crm_viewer', 'CrmController'))).toBe(true);
  });
  it('still cannot reach other admin areas', () => {
    expect(() => guard.canActivate(ctx('crm_manager', 'BillingController', 'createBillV1'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx('packing', 'CrmController'))).toThrow(ForbiddenException);
  });
});
