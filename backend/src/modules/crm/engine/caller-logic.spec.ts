import {
  leadScore, planNextAction, dealLeads, mergeCallerConfig, computePoints, istKey, istHour, istAt,
  CALLER_MODES, modeByKey, modeOpen, LadderError, DEFAULT_CALLER_CONFIG,
} from './caller-logic';

const ist = (s: string) => new Date(`${s}+05:30`);

describe('leadScore', () => {
  it('adds the blueprint weights and explains them', () => {
    const r = leadScore({ callbackDue: true, repurchaseOverdue: true, highValue: true })!;
    expect(r.score).toBe(85);
    expect(r.reasons).toEqual(['Callback due', 'Refill overdue', 'High value']);
  });
  it('clamps to 0..100, penalises misses, rewards rollover', () => {
    expect(leadScore({ callbackDue: true, repurchaseOverdue: true, isNew: true, abandonedOrEnquiry: true })!.score).toBe(100);
    expect(leadScore({ failedInRow: 3 })!.score).toBe(0);
    expect(leadScore({ repurchaseOverdue: true, failedInRow: 2 })!.score).toBe(14);
    expect(leadScore({ rolloverCount: 2 })!.score).toBe(20);
  });
  it('excludes do-not-call', () => expect(leadScore({ doNotCall: true, callbackDue: true })).toBeNull());
});

describe('planNextAction (attempt ladder)', () => {
  const morning = ist('2026-11-23T10:00:00');
  it('first miss retries +3 h the same day', () => {
    const p = planNextAction('no_answer', { now: morning, noAnswerInRow: 1 });
    expect(p.assignment.state).toBe('retry');
    expect(+p.assignment.dueAt!).toBe(+morning + 3 * 3_600_000);
    expect(p.sendMissedWa).toBe(false);
  });
  it('first miss late in the day moves to tomorrow in the other slot', () => {
    const p = planNextAction('busy', { now: ist('2026-11-23T18:30:00'), noAnswerInRow: 1 });
    expect(p.assignment.state).toBe('done');
    expect(istKey(p.nextActionAt!)).toBe('2026-11-24');
    expect(istHour(p.nextActionAt!)).toBe(11);
  });
  it('second miss: next day in a different slot + missed-you WhatsApp', () => {
    const p = planNextAction('switched_off', { now: morning, noAnswerInRow: 2 });
    expect(istKey(p.nextActionAt!)).toBe('2026-11-24');
    expect(istHour(p.nextActionAt!)).toBe(17);
    expect(p.sendMissedWa).toBe(true);
  });
  it('day 3, day 7, then parks at the max', () => {
    expect(istKey(planNextAction('no_answer', { now: morning, noAnswerInRow: 3 }).nextActionAt!)).toBe('2026-11-26');
    expect(istKey(planNextAction('no_answer', { now: morning, noAnswerInRow: 5 }).nextActionAt!)).toBe('2026-11-30');
    const parked = planNextAction('no_answer', { now: morning, noAnswerInRow: 6 });
    expect(parked.assignment.state).toBe('parked');
  });
  it('callback needs a future time and creates a reminder at it', () => {
    expect(() => planNextAction('callback', { now: morning, noAnswerInRow: 0 })).toThrow(LadderError);
    expect(() => planNextAction('callback', { now: morning, noAnswerInRow: 0, callbackAt: ist('2026-11-23T09:00:00') })).toThrow(LadderError);
    const at = ist('2026-11-23T16:00:00');
    const p = planNextAction('callback', { now: morning, noAnswerInRow: 0, callbackAt: at });
    expect(p.assignment).toMatchObject({ state: 'retry', source: 'callback' });
    expect(p.reminder).toMatchObject({ type: 'callback', dueAt: at });
    expect(p.stats.callbackAt).toBe(at);
  });
  it('interested follows up +1, +3, +7 days', () => {
    expect(istKey(planNextAction('interested', { now: morning, noAnswerInRow: 0, interestedInRow: 1 }).nextActionAt!)).toBe('2026-11-24');
    expect(istKey(planNextAction('interested', { now: morning, noAnswerInRow: 0, interestedInRow: 2 }).nextActionAt!)).toBe('2026-11-26');
    expect(istKey(planNextAction('interested', { now: morning, noAnswerInRow: 0, interestedInRow: 3 }).nextActionAt!)).toBe('2026-11-30');
  });
  it('terminal outcomes', () => {
    expect(planNextAction('not_interested', { now: morning, noAnswerInRow: 0 }).assignment.state).toBe('parked');
    expect(planNextAction('wrong_number', { now: morning, noAnswerInRow: 0 }).stats).toMatchObject({ phoneInvalid: true, isDismissed: true });
    expect(planNextAction('complaint', { now: morning, noAnswerInRow: 0 }).alertManagers).toBeTruthy();
    expect(planNextAction('ordered', { now: morning, noAnswerInRow: 0 }).suggestWa).toBe('thank_you');
    expect(() => planNextAction('bogus', { now: morning, noAnswerInRow: 0 })).toThrow(LadderError);
  });
});

describe('dealLeads', () => {
  const leads = Array.from({ length: 500 }, (_, i) => ({ id: `l${String(i).padStart(3, '0')}`, score: 100 - (i % 100) }));
  it('500 leads, 3 callers: ~167 each, balanced hot/cold, nothing twice', () => {
    const m = dealLeads(leads, [{ id: 'A' }, { id: 'B' }, { id: 'C' }]);
    expect(m.size).toBe(500);
    const per = { A: [] as number[], B: [] as number[], C: [] as number[] };
    leads.forEach((l) => per[m.get(l.id) as 'A'].push(l.score));
    for (const s of Object.values(per)) {
      expect(s.length).toBeGreaterThanOrEqual(166);
      expect(s.length).toBeLessThanOrEqual(167);
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      expect(Math.abs(avg - 50.5)).toBeLessThan(1.5);
    }
  });
  it('keeps sticky customers with their caller and respects weights', () => {
    const m = dealLeads([{ id: 'x', score: 1, stickyCallerId: 'B' }, { id: 'y', score: 99 }], [{ id: 'A' }, { id: 'B' }]);
    expect(m.get('x')).toBe('B');
    expect(m.get('y')).toBe('A');
    const w = dealLeads(leads.slice(0, 90), [{ id: 'A', weight: 2 }, { id: 'B', weight: 1 }]);
    expect([...w.values()].filter((c) => c === 'A').length).toBe(60);
  });
  it('no callers → nothing assigned', () => expect(dealLeads(leads, []).size).toBe(0));
});

describe('config, modes, points', () => {
  it('mergeCallerConfig drops malformed admin input', () => {
    const c = mergeCallerConfig({ maxAttempts: 'x', callingHours: { from: 21, to: 9 }, weights: { callbackDue: 55, newLead: 1e9 }, shiftStartBy: '25:00' });
    expect(c.maxAttempts).toBe(DEFAULT_CALLER_CONFIG.maxAttempts);
    expect(c.callingHours).toEqual(DEFAULT_CALLER_CONFIG.callingHours);
    expect(c.weights.callbackDue).toBe(55);
    expect(c.weights.newLead).toBe(100);
    expect(c.shiftStartBy).toBe('10:30');
  });
  it('has all 11 modes with unique keys; evening slot only opens 5–8 pm', () => {
    expect(CALLER_MODES).toHaveLength(11);
    expect(new Set(CALLER_MODES.map((m) => m.key)).size).toBe(11);
    expect(modeByKey('nope').key).toBe('power_hour');
    expect(modeOpen(modeByKey('evening_slot'), ist('2026-11-23T11:00:00'))).toBe(false);
    expect(modeOpen(modeByKey('evening_slot'), ist('2026-11-23T18:00:00'))).toBe(true);
  });
  it('istAt lands on the right IST day and time', () => {
    const d = istAt(ist('2026-11-23T23:30:00'), 1, '11:00');
    expect(istKey(d)).toBe('2026-11-24');
    expect(istHour(d)).toBe(11);
  });
  it('computePoints scores calls, orders, callbacks and streaks', () => {
    const t = (m: number) => ist(`2026-11-23T09:${String(m).padStart(2, '0')}:00`);
    const logs = [
      { outcome: 'connected', durationSec: 60, startedAt: t(0), createdAt: t(1), customerId: 'c1' },
      { type: 'whatsapp', createdAt: t(2), customerId: 'c1' },
      { outcome: 'ordered', durationSec: 90, startedAt: new Date(+t(1) + 30_000), createdAt: t(4), score: 80, customerId: 'c2' },
      { outcome: 'connected', durationSec: 3, startedAt: t(30), createdAt: t(31), flagged: true, customerId: 'c3' },
    ];
    const r = computePoints(logs, [{ type: 'callback', status: 'done', keptOnTime: true, dueAt: t(0) }], { assigned: 3, remaining: 0 });
    // 3 calls + 2 connected(>30s)*3 + order 20 + hot 10 + wa 1 + callback kept 5 - flagged 5
    expect(r.points).toBe(3 + 6 + 20 + 10 + 1 + 5 - 5);
    expect(r.bestStreak).toBe(2);
    expect(r.badges).toEqual(expect.arrayContaining(['early_bird', 'callback_king', 'zero_left']));
  });
});
