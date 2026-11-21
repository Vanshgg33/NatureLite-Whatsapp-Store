// Caller Command Center: pure decision logic (no DB). Scoring, attempt ladder, distribution, modes, points.
// All day boundaries and slots are Asia/Kolkata regardless of the server's TZ.

export const NO_ANSWER_OUTCOMES = ['no_answer', 'busy', 'switched_off', 'call_dropped'] as const;
export const CONNECTED_OUTCOMES = ['connected', 'interested', 'ordered', 'callback', 'not_interested', 'complaint'] as const;
export const CALL_OUTCOMES = [...CONNECTED_OUTCOMES, ...NO_ANSWER_OUTCOMES, 'wrong_number'] as const;
export type CallOutcomeKey = (typeof CALL_OUTCOMES)[number];
export const isNoAnswer = (o: string | null | undefined) => (NO_ANSWER_OUTCOMES as readonly string[]).includes(o ?? '');
export const isConnected = (o: string | null | undefined) => (CONNECTED_OUTCOMES as readonly string[]).includes(o ?? '');

// ─── IST helpers ─────────────────────────────────────────────────────────────

const TZ = 'Asia/Kolkata';
export const istKey = (d: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
export const istHour = (d: Date = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
export const istMinutes = (d: Date = new Date()) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).split(':').map(Number);
  return h * 60 + m;
};
/** `HH:MM` IST on the IST day `daysAhead` after `from` */
export function istAt(from: Date, daysAhead: number, hhmm: string): Date {
  const day = new Date(new Date(`${istKey(from)}T12:00:00+05:30`).getTime() + daysAhead * 86_400_000);
  return new Date(`${istKey(day)}T${hhmm}:00+05:30`);
}
export const slotOf = (d: Date): 'morning' | 'afternoon' | 'evening' => {
  const h = istHour(d);
  return h < 13 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};

// ─── Settings ────────────────────────────────────────────────────────────────

export interface CallerConfig {
  weights: {
    callbackDue: number; repurchaseOverdue: number; abandonedOrEnquiry: number; newLead: number;
    waEngaged: number; highValue: number; atRisk: number; failedAttempt: number; notInterested: number; rollover: number;
  };
  maxAttempts: number;        // no-answer attempts before a lead is parked
  maxDialsPerDay: number;     // per lead, per day
  callingHours: { from: number; to: number }; // IST hours, [from, to)
  shortCallSec: number;       // connected calls shorter than this are flagged
  callbackGraceMin: number;   // kept-on-time window and red badge
  callbackEscalateMin: number;
  targetCalls: number;        // per caller per day
  idleNudgeMin: number;
  idleAlertMin: number;
  shiftStartBy: string;       // "HH:MM" IST
  dayEndAlertAt: string;      // "HH:MM" IST: unworked-leads alert
  hotScore: number;
  leadsPerCaller: number;   // daily list size per checked-in caller
}

export const DEFAULT_CALLER_CONFIG: CallerConfig = {
  weights: {
    callbackDue: 40, repurchaseOverdue: 30, abandonedOrEnquiry: 25, newLead: 25,
    waEngaged: 20, highValue: 15, atRisk: 20, failedAttempt: -8, notInterested: -40, rollover: 10,
  },
  maxAttempts: 6,
  maxDialsPerDay: 3,
  callingHours: { from: 9, to: 20 },
  shortCallSec: 5,
  callbackGraceMin: 15,
  callbackEscalateMin: 30,
  targetCalls: 120,
  idleNudgeMin: 5,
  idleAlertMin: 15,
  shiftStartBy: '10:30',
  dayEndAlertAt: '17:00',
  hotScore: 70,
  leadsPerCaller: 170,
};

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const hhmm = (v: unknown, fallback: string) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback);

/** Saved settings merged over defaults; anything malformed falls back to the default (trust boundary: admin input). */
export function mergeCallerConfig(saved?: any): CallerConfig {
  const d = DEFAULT_CALLER_CONFIG;
  const s = saved && typeof saved === 'object' ? saved : {};
  const w = s.weights && typeof s.weights === 'object' ? s.weights : {};
  const weights = Object.fromEntries(
    Object.entries(d.weights).map(([k, v]) => [k, num(w[k], v, -100, 100)]),
  ) as CallerConfig['weights'];
  const from = num(s.callingHours?.from, d.callingHours.from, 0, 23);
  const to = num(s.callingHours?.to, d.callingHours.to, 1, 24);
  return {
    weights,
    maxAttempts: num(s.maxAttempts, d.maxAttempts, 1, 20),
    maxDialsPerDay: num(s.maxDialsPerDay, d.maxDialsPerDay, 1, 20),
    callingHours: to > from ? { from, to } : d.callingHours,
    shortCallSec: num(s.shortCallSec, d.shortCallSec, 0, 120),
    callbackGraceMin: num(s.callbackGraceMin, d.callbackGraceMin, 1, 240),
    callbackEscalateMin: num(s.callbackEscalateMin, d.callbackEscalateMin, 1, 480),
    targetCalls: num(s.targetCalls, d.targetCalls, 1, 1000),
    idleNudgeMin: num(s.idleNudgeMin, d.idleNudgeMin, 1, 120),
    idleAlertMin: num(s.idleAlertMin, d.idleAlertMin, 1, 240),
    shiftStartBy: hhmm(s.shiftStartBy, d.shiftStartBy),
    dayEndAlertAt: hhmm(s.dayEndAlertAt, d.dayEndAlertAt),
    hotScore: num(s.hotScore, d.hotScore, 1, 100),
    leadsPerCaller: num(s.leadsPerCaller, d.leadsPerCaller, 10, 2000),
  };
}

export const withinCallingHours = (d: Date, cfg: CallerConfig) => {
  const h = istHour(d);
  return h >= cfg.callingHours.from && h < cfg.callingHours.to;
};

// ─── Lead score (blueprint 4.1) ──────────────────────────────────────────────

export interface ScoreSignals {
  callbackDue?: boolean; repurchaseOverdue?: boolean; abandonedOrEnquiry?: boolean; isNew?: boolean;
  waEngaged?: boolean; highValue?: boolean; atRisk?: boolean; failedInRow?: number;
  notInterestedRecently?: boolean; doNotCall?: boolean; rolloverCount?: number;
}

/** 0–100 with the reasons that produced it; null = never call (do-not-call). */
export function leadScore(s: ScoreSignals, w: CallerConfig['weights'] = DEFAULT_CALLER_CONFIG.weights): { score: number; reasons: string[] } | null {
  if (s.doNotCall) return null;
  let score = 0;
  const reasons: string[] = [];
  const add = (cond: boolean | undefined, pts: number, reason: string) => { if (cond) { score += pts; reasons.push(reason); } };
  add(s.callbackDue, w.callbackDue, 'Callback due');
  add(s.repurchaseOverdue, w.repurchaseOverdue, 'Refill overdue');
  add(s.abandonedOrEnquiry, w.abandonedOrEnquiry, 'Abandoned cart');
  add(s.isNew, w.newLead, 'New lead');
  add(s.waEngaged, w.waEngaged, 'WhatsApp active');
  add(s.highValue, w.highValue, 'High value');
  add(s.atRisk, w.atRisk, 'At risk');
  add(s.notInterestedRecently, w.notInterested, 'Said not interested');
  const failed = Math.max(0, s.failedInRow ?? 0);
  if (failed) { score += failed * w.failedAttempt; reasons.push(`${failed} missed in a row`); }
  const roll = Math.max(0, s.rolloverCount ?? 0);
  if (roll) { score += roll * w.rollover; reasons.push(roll > 1 ? `Rolled over ×${roll}` : 'Rolled over'); }
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

// ─── Attempt ladder (blueprint 4.2) ──────────────────────────────────────────

export interface LadderContext {
  now: Date;
  /** no-answer outcomes in a row INCLUDING this call */
  noAnswerInRow: number;
  /** interested outcomes in a row INCLUDING this call */
  interestedInRow?: number;
  callbackAt?: Date | null;
}

export interface LadderPlan {
  assignment: { state: 'retry' | 'done' | 'parked'; dueAt?: Date | null; parkedReason?: string; source?: string };
  stats: Record<string, unknown>;
  reminder?: { type: 'callback' | 'followup' | 'retry'; dueAt: Date; text: string };
  sendMissedWa?: boolean;
  suggestWa?: 'thank_you' | 'catalogue' | 'missed_you';
  alertManagers?: string;
  nextActionAt: Date | null;
}

export class LadderError extends Error {}

/** What happens after a call: every outcome produces a dated next action (or a deliberate park/removal). */
export function planNextAction(outcome: string, ctx: LadderContext, cfg: CallerConfig = DEFAULT_CALLER_CONFIG): LadderPlan {
  const { now } = ctx;
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
  // alternate the slot so a customer who never answers mornings gets tried in the evening
  const otherSlot = slotOf(now) === 'evening' ? '11:00' : '17:30';

  if (isNoAnswer(outcome)) {
    const n = Math.max(1, ctx.noAnswerInRow);
    if (n >= cfg.maxAttempts) {
      const until = days(60);
      return {
        assignment: { state: 'parked', parkedReason: `No answer after ${n} attempts` },
        stats: { snoozedUntil: until, callbackAt: null },
        nextActionAt: until,
      };
    }
    let at: Date;
    if (n === 1) {
      at = new Date(now.getTime() + 3 * 3_600_000);
      if (istKey(at) !== istKey(now) || !withinCallingHours(at, cfg)) at = istAt(now, 1, otherSlot);
    } else if (n === 2) at = istAt(now, 1, otherSlot);
    else if (n === 3) at = istAt(now, 3, otherSlot);
    else at = istAt(now, 7, otherSlot);
    const sameDay = istKey(at) === istKey(now);
    return {
      assignment: sameDay ? { state: 'retry', dueAt: at } : { state: 'done' },
      stats: { snoozedUntil: at, callbackAt: null },
      reminder: sameDay ? { type: 'retry', dueAt: at, text: `Retry call (attempt ${n + 1})` } : undefined,
      sendMissedWa: n === 2,
      suggestWa: 'missed_you',
      nextActionAt: at,
    };
  }

  switch (outcome) {
    case 'callback': {
      const at = ctx.callbackAt;
      if (!at || Number.isNaN(+at)) throw new LadderError('Pick the callback time');
      if (+at <= +now) throw new LadderError('Callback time must be in the future');
      if (+at > +days(90)) throw new LadderError('Callback must be within 90 days');
      const sameDay = istKey(at) === istKey(now);
      return {
        assignment: sameDay ? { state: 'retry', dueAt: at, source: 'callback' } : { state: 'done' },
        stats: { callbackAt: at, snoozedUntil: at },
        reminder: { type: 'callback', dueAt: at, text: 'Promised callback' },
        nextActionAt: at,
      };
    }
    case 'interested': {
      const step = Math.max(1, ctx.interestedInRow ?? 1);
      const gap = step === 1 ? 1 : step === 2 ? 3 : 7;
      const at = istAt(now, gap, '11:00');
      return {
        assignment: { state: 'done' },
        stats: { snoozedUntil: at, callbackAt: null },
        reminder: { type: 'followup', dueAt: at, text: `Follow up: interested (+${gap}d)` },
        suggestWa: 'catalogue',
        nextActionAt: at,
      };
    }
    case 'connected': {
      const at = istAt(now, 1, '11:00');
      return {
        assignment: { state: 'done' },
        stats: { snoozedUntil: at, callbackAt: null },
        reminder: { type: 'followup', dueAt: at, text: 'Follow up after first contact' },
        nextActionAt: at,
      };
    }
    case 'ordered':
      // the engine moves them to Active and dates the next refill from the order itself
      return { assignment: { state: 'done' }, stats: { snoozedUntil: null, callbackAt: null }, suggestWa: 'thank_you', nextActionAt: null };
    case 'not_interested': {
      const until = days(60);
      return {
        assignment: { state: 'parked', parkedReason: 'Not interested' },
        stats: { snoozedUntil: until, callbackAt: null },
        nextActionAt: until,
      };
    }
    case 'wrong_number':
      return {
        assignment: { state: 'parked', parkedReason: 'Wrong number' },
        stats: { phoneInvalid: true, isDismissed: true, callbackAt: null },
        nextActionAt: null,
      };
    case 'complaint':
      return {
        assignment: { state: 'done' },
        stats: { isEscalated: true, callbackAt: null },
        alertManagers: 'Complaint raised on a call',
        nextActionAt: null,
      };
    default:
      throw new LadderError(`Unknown outcome: ${outcome}`);
  }
}

// ─── Distribution (blueprint 4.3) ────────────────────────────────────────────

export interface DealLead { id: string; score: number; stickyCallerId?: string | null }
export interface DealCaller { id: string; weight?: number }

/** Quotas proportional to weight (shift hours), sticky leads to their caller first, the rest dealt in snake order by score. */
export function dealLeads(leads: DealLead[], callers: DealCaller[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!callers.length || !leads.length) return out;
  const totalW = callers.reduce((s, c) => s + Math.max(0.1, c.weight ?? 1), 0);
  const quota = new Map<string, number>();
  let given = 0;
  callers.forEach((c) => { const q = Math.floor((leads.length * Math.max(0.1, c.weight ?? 1)) / totalW); quota.set(c.id, q); given += q; });
  for (let i = 0; given < leads.length; i = (i + 1) % callers.length, given++) quota.set(callers[i].id, quota.get(callers[i].id)! + 1);

  const sorted = [...leads].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const rest: DealLead[] = [];
  for (const l of sorted) {
    const s = l.stickyCallerId;
    if (s && (quota.get(s) ?? 0) > 0) { out.set(l.id, s); quota.set(s, quota.get(s)! - 1); } else rest.push(l);
  }
  const order = [...callers.map((c) => c.id), ...callers.map((c) => c.id).reverse()];
  let p = 0;
  for (const l of rest) {
    for (let tries = 0; tries < order.length; tries++) {
      const c = order[p % order.length];
      p++;
      if ((quota.get(c) ?? 0) > 0) { out.set(l.id, c); quota.set(c, quota.get(c)! - 1); break; }
    }
  }
  return out;
}

// ─── Caller modes (blueprint 3) ──────────────────────────────────────────────

export interface CallerMode {
  key: string; label: string; emoji: string; description: string;
  /** extra Mongo filter on CrmLeadAssignment */
  filter: (ctx: { now: Date; cfg: CallerConfig }) => Record<string, unknown>;
  sort: Record<string, 1 | -1>;
  timer?: { minutes: number; breakAfter?: number };
  target?: { calls?: number; connected?: number };
  timeWindow?: { from: number; to: number };
  shared?: boolean; // duel: pool of both duelling callers
  hint?: string;
}

const NA = [...NO_ANSWER_OUTCOMES];
export const CALLER_MODES: CallerMode[] = [
  { key: 'power_hour', label: 'Power Hour', emoji: '⚡', description: '50-minute sprint on your best leads', filter: () => ({}), sort: { score: -1 }, timer: { minutes: 50, breakAfter: 10 }, target: { calls: 40 } },
  { key: 'hot_first', label: 'Hot Lead First', emoji: '🔥', description: 'Score 70+ only', filter: ({ cfg }) => ({ score: { $gte: cfg.hotScore } }), sort: { score: -1 }, hint: 'Not connected? Send the WhatsApp offer.' },
  { key: 'callback_hunter', label: 'Callback Hunter', emoji: '🎯', description: 'Callbacks due now or overdue, oldest first', filter: ({ now }) => ({ source: 'callback', $or: [{ dueAt: null }, { dueAt: { $lte: now } }] }), sort: { dueAt: 1 } },
  { key: 'repurchase_rush', label: 'Repurchase Rush', emoji: '🛒', description: 'Refills due today or overdue', filter: () => ({ source: { $in: ['due', 'overdue'] } }), sort: { score: -1 }, hint: 'Suggest the refill pack.' },
  { key: 'new_lead_blitz', label: 'New Lead Blitz', emoji: '🚀', description: 'Customers who arrived in the last 24 h', filter: () => ({ source: 'new' }), sort: { arrivedAt: 1 }, hint: 'Goal: first call within 15 minutes.' },
  { key: 'winback', label: 'Win-back Dormant', emoji: '💤', description: 'No order for 60+ days', filter: () => ({ source: 'dormant' }), sort: { score: -1 }, hint: 'Lead with their favourite product and a win-back offer.' },
  { key: 'double_dial', label: 'Double Dial', emoji: '🔁', description: 'Last attempt was no answer / busy / switched off', filter: () => ({ lastOutcome: { $in: NA } }), sort: { lastAttemptAt: 1 } },
  { key: 'wa_warmup', label: 'WhatsApp Warm-up', emoji: '💬', description: 'Message 20 cold leads, call the ones who reply first', filter: () => ({ source: { $in: ['dormant', 'at_risk'] } }), sort: { waReplied: -1, waSentAt: -1, score: -1 } },
  { key: 'evening_slot', label: 'Evening Slot', emoji: '🌆', description: 'Customers who pick up in the evening (5–8 pm)', filter: () => ({ bestSlot: 'evening' }), sort: { score: -1 }, timeWindow: { from: 17, to: 20 } },
  { key: 'cleanup', label: 'Cleanup (Exhaust)', emoji: '🧹', description: 'Everything left in your list, any score', filter: () => ({}), sort: { score: 1 } },
  { key: 'duel', label: 'Duel', emoji: '⚔️', description: 'Shared pool, 60-minute head-to-head on connected calls', filter: () => ({}), sort: { score: -1 }, timer: { minutes: 60 }, shared: true },
];
export const modeByKey = (k: string | null | undefined) => CALLER_MODES.find((m) => m.key === k) ?? CALLER_MODES[0];
export const modeOpen = (m: CallerMode, now: Date) => !m.timeWindow || (istHour(now) >= m.timeWindow.from && istHour(now) < m.timeWindow.to);

// ─── Points, streaks, badges (blueprint 11) ──────────────────────────────────

export const POINTS = { call: 1, connected30: 3, callbackKept: 5, waAfterConnected: 1, order: 20, hotConverted: 10, overdueCleared: 3, flagged: -5 } as const;

export interface PointsCall { type?: string; outcome?: string | null; durationSec?: number; startedAt?: Date | null; createdAt: Date; score?: number; flagged?: boolean; customerId?: string }
export interface PointsReminder { type: string; keptOnTime?: boolean | null; status: string; dueAt: Date; doneAt?: Date | null }

export function computePoints(
  logs: PointsCall[], reminders: PointsReminder[], opts: { hotScore?: number; assigned?: number; remaining?: number } = {},
) {
  const hot = opts.hotScore ?? DEFAULT_CALLER_CONFIG.hotScore;
  const calls = logs.filter((l) => l.type !== 'whatsapp').sort((a, b) => +a.createdAt - +b.createdAt);
  const was = logs.filter((l) => l.type === 'whatsapp');
  const b = { calls: 0, connected: 0, orders: 0, hot: 0, callbacksKept: 0, overdueCleared: 0, wa: 0, flagged: 0 };
  for (const c of calls) {
    if (c.outcome === 'unlogged') continue;
    b.calls++;
    if (isConnected(c.outcome) && (c.durationSec ?? 0) > 30) b.connected++;
    if (c.outcome === 'ordered') { b.orders++; if ((c.score ?? 0) >= hot) b.hot++; }
    if (c.flagged) b.flagged++;
  }
  for (const w of was) {
    const after = calls.some((c) => c.customerId && c.customerId === w.customerId && isConnected(c.outcome)
      && +w.createdAt >= +c.createdAt && +w.createdAt - +c.createdAt <= 15 * 60_000);
    if (after) b.wa++;
  }
  const callbacks = reminders.filter((r) => r.type === 'callback');
  for (const r of callbacks) {
    if (r.keptOnTime === true) b.callbacksKept++;
    else if (r.status === 'done' && r.keptOnTime === false) b.overdueCleared++;
  }
  const points = b.calls * POINTS.call + b.connected * POINTS.connected30 + b.callbacksKept * POINTS.callbackKept
    + b.wa * POINTS.waAfterConnected + b.orders * POINTS.order + b.hot * POINTS.hotConverted
    + b.overdueCleared * POINTS.overdueCleared + b.flagged * POINTS.flagged;

  // streak: consecutive calls with at most 45 s between hanging up one and dialling the next
  let streak = calls.length ? 1 : 0;
  let best = streak;
  for (let i = 1; i < calls.length; i++) {
    const start = calls[i].startedAt ?? calls[i].createdAt;
    streak = +start - +calls[i - 1].createdAt <= 45_000 ? streak + 1 : 1;
    best = Math.max(best, streak);
  }
  const badges: string[] = [];
  if (calls.length && istHour(calls[0].startedAt ?? calls[0].createdAt) < 10) badges.push('early_bird');
  if (b.orders >= 3) badges.push('closer');
  const dueCallbacks = callbacks.filter((r) => r.status === 'done' || +r.dueAt <= Date.now());
  if (dueCallbacks.length && dueCallbacks.every((r) => r.keptOnTime === true)) badges.push('callback_king');
  if ((opts.assigned ?? 0) > 0 && opts.remaining === 0) badges.push('zero_left');
  if (best >= 10) badges.push('streak_10');
  return { points, streak, bestStreak: best, badges, breakdown: b };
}

export const BADGE_LABELS: Record<string, string> = {
  early_bird: 'Early Bird', closer: 'Closer', callback_king: 'Callback King', zero_left: 'Zero Left', streak_10: 'Streak 10',
};
