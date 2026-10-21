import { Logger } from '@nestjs/common';
import { AdminChatbotService } from './admin-chatbot.service';
import { CHATBOT_JOBS, ADMIN_JOBS } from '../queues/queues.constants';

const HISTORY_MESSAGES = [
  { sender: 'user', text: 'hello' },
  { sender: 'assistant', text: 'hi there' },
];

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const sessions = {
    getByAdminId: jest.fn().mockResolvedValue({ messages: HISTORY_MESSAGES }),
    appendMessages: jest.fn().mockResolvedValue(undefined),
    clearByAdminId: jest.fn().mockResolvedValue(undefined),
  };
  const tools = {
    sanitize: jest.fn((m: string) => m.trim()),
    execute: jest.fn().mockResolvedValue({}),
  };
  const router = { classify: jest.fn().mockResolvedValue(['ops']) };
  const ops = { run: jest.fn().mockResolvedValue('OPS REPLY'), warmUp: jest.fn().mockResolvedValue(undefined) };
  const billing = { run: jest.fn().mockResolvedValue('BILLING REPLY') };
  const purchase = { run: jest.fn().mockResolvedValue('PURCHASE REPLY') };
  const synth = { synthesize: jest.fn().mockResolvedValue('SYNTHESIZED REPLY') };
  const email = { sendAdminReport: jest.fn().mockResolvedValue(undefined) };
  const adminQueue = {
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue({}),
  };
  const chatbotQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getJob: jest.fn(),
  };
  const service = new AdminChatbotService(
    sessions as any, tools as any, router as any, ops as any, billing as any,
    purchase as any, synth as any, email as any, adminQueue as any, chatbotQueue as any,
  );
  return { service, sessions, tools, router, ops, billing, purchase, synth, email, adminQueue, chatbotQueue };
}

const OLD_ENV = process.env;
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation();
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  jest.spyOn(Logger.prototype, 'error').mockImplementation();
  process.env = { ...OLD_ENV, GEMINI_API_KEY: 'test-key' };
  delete process.env.ADMIN_REPORT_EMAIL;
});
afterAll(() => {
  process.env = OLD_ENV;
});

describe('orchestration', () => {
  it('answers a single-domain query from that specialist alone, without calling the synthesizer', async () => {
    const s = setup();
    const res = await s.service.chat('show today\'s orders', [], 'admin1');
    expect(res).toEqual({ reply: 'OPS REPLY' });
    expect(s.ops.run).toHaveBeenCalledTimes(1);
    expect(s.billing.run).not.toHaveBeenCalled();
    expect(s.purchase.run).not.toHaveBeenCalled();
    expect(s.synth.synthesize).not.toHaveBeenCalled();
  });

  it('sends a billing query to the billing/CRM agent only', async () => {
    const s = setup();
    s.router.classify.mockResolvedValue(['billing_crm']);
    const res = await s.service.chat('show unpaid bills', [], 'admin1');
    expect(res.reply).toBe('BILLING REPLY');
    expect(s.ops.run).not.toHaveBeenCalled();
  });

  it('sends a purchase query to the purchase agent only', async () => {
    const s = setup();
    s.router.classify.mockResolvedValue(['purchase']);
    expect((await s.service.chat('pending purchase requests', [], 'admin1')).reply).toBe('PURCHASE REPLY');
  });

  it('runs the specialists of a cross-domain query in parallel, then merges them with the synthesizer', async () => {
    const s = setup();
    s.router.classify.mockResolvedValue(['billing_crm', 'ops']);
    const billing = deferred<string>();
    const ops = deferred<string>();
    s.billing.run.mockReturnValue(billing.promise);
    s.ops.run.mockReturnValue(ops.promise);

    const pending = s.service.chat('billing outstanding and orders for Rahul', [], 'admin1');
    await new Promise((r) => setImmediate(r));
    // Both started before either finished.
    expect(s.billing.run).toHaveBeenCalledTimes(1);
    expect(s.ops.run).toHaveBeenCalledTimes(1);

    billing.resolve('billing data');
    ops.resolve('ops data');
    await expect(pending).resolves.toEqual({ reply: 'SYNTHESIZED REPLY' });
    expect(s.synth.synthesize).toHaveBeenCalledWith(
      'billing outstanding and orders for Rahul',
      [{ domain: 'billing_crm', data: 'billing data' }, { domain: 'ops', data: 'ops data' }],
      expect.any(Array),
    );
  });

  it('still answers from the surviving specialist when the other throws, and says the answer is incomplete', async () => {
    const s = setup();
    s.router.classify.mockResolvedValue(['ops', 'billing_crm']);
    s.billing.run.mockRejectedValue(new Error('gemini_timeout'));
    const { reply } = await s.service.chat('orders and bills', [], 'admin1');
    expect(reply).toContain('OPS REPLY');
    expect(reply).toMatch(/billing\/CRM/);
    expect(reply).toMatch(/incomplete/i);
  });

  it('shows the incomplete-answer warning to the admin but does not save it into the chat history', async () => {
    const s = setup();
    s.router.classify.mockResolvedValue(['ops', 'billing_crm']);
    s.billing.run.mockRejectedValue(new Error('x'));
    const { reply } = await s.service.chat('q', [], 'admin1');
    expect(reply).toMatch(/incomplete/i);
    const saved = s.sessions.appendMessages.mock.calls[0][1];
    expect(saved[1].text).toBe('OPS REPLY');
  });

  it('merges the remaining specialists when one of three fails', async () => {
    const s = setup();
    s.router.classify.mockResolvedValue(['ops', 'billing_crm', 'purchase']);
    s.purchase.run.mockRejectedValue(new Error('boom'));
    const { reply } = await s.service.chat('everything', [], 'admin1');
    expect(s.synth.synthesize).toHaveBeenCalledWith(
      'everything',
      [{ domain: 'ops', data: 'OPS REPLY' }, { domain: 'billing_crm', data: 'BILLING REPLY' }],
      expect.any(Array),
    );
    expect(reply).toContain('SYNTHESIZED REPLY');
    expect(reply).toMatch(/purchase/);
  });

  it('treats a specialist that returns an ERROR: message as failed', async () => {
    const s = setup();
    s.ops.run.mockResolvedValue('ERROR: GEMINI_API_KEY not set');
    expect((await s.service.chat('q', [], 'admin1')).reply).toBe('⚠️ Could not fetch data. Please try again.');
  });

  it('returns a retry message when every specialist fails', async () => {
    const s = setup();
    s.router.classify.mockResolvedValue(['ops', 'purchase']);
    s.ops.run.mockRejectedValue(new Error('a'));
    s.purchase.run.mockRejectedValue(new Error('b'));
    expect((await s.service.chat('q', [], 'admin1')).reply).toBe('⚠️ Could not fetch data. Please try again.');
  });

  it('loads the session history once and hands the same history to the router and every specialist', async () => {
    const s = setup();
    s.router.classify.mockResolvedValue(['ops', 'purchase']);
    await s.service.chat('q', [], 'admin1');
    expect(s.sessions.getByAdminId).toHaveBeenCalledTimes(1);
    const history = s.router.classify.mock.calls[0][1];
    expect(history).toEqual([
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'hi there' },
    ]);
    expect(s.ops.run.mock.calls[0][1]).toBe(history);
    expect(s.purchase.run.mock.calls[0][1]).toBe(history);
  });
});

describe('chat()', () => {
  it('sanitizes the message and persists the exchange for the admin', async () => {
    const s = setup();
    await s.service.chat('  hi  ', [], 'admin1');
    expect(s.tools.sanitize).toHaveBeenCalledWith('  hi  ');
    expect(s.router.classify.mock.calls[0][0]).toBe('hi');
    const saved = s.sessions.appendMessages.mock.calls[0];
    expect(saved[0]).toBe('admin1');
    expect(saved[1].map((m: any) => [m.sender, m.text])).toEqual([['user', 'hi'], ['assistant', 'OPS REPLY']]);
  });

  it('uses the supplied history and persists nothing when there is no admin id', async () => {
    const s = setup();
    await s.service.chat('q', [{ role: 'user', text: 'from client' }], undefined);
    expect(s.sessions.getByAdminId).not.toHaveBeenCalled();
    expect(s.router.classify.mock.calls[0][1]).toEqual([{ role: 'user', text: 'from client' }]);
    expect(s.sessions.appendMessages).not.toHaveBeenCalled();
  });

  it('falls back to an empty history when the session cannot be loaded', async () => {
    const s = setup();
    s.sessions.getByAdminId.mockRejectedValue(new Error('mongo down'));
    await expect(s.service.chat('q', [], 'admin1')).resolves.toEqual({ reply: 'OPS REPLY' });
    expect(s.router.classify.mock.calls[0][1]).toEqual([]);
  });

  it('returns a friendly error instead of throwing when orchestration fails', async () => {
    const s = setup();
    s.router.classify.mockRejectedValue(new Error('unexpected'));
    await expect(s.service.chat('q', [], 'admin1')).resolves.toEqual({ reply: '⚠️ Something went wrong. Please try again.' });
  });

  it('does not fail the reply when saving the session fails', async () => {
    const s = setup();
    s.sessions.appendMessages.mockRejectedValue(new Error('write failed'));
    await expect(s.service.chat('q', [], 'admin1')).resolves.toEqual({ reply: 'OPS REPLY' });
  });
});

describe('streamChat()', () => {
  it('writes the reply as one SSE delta followed by [DONE]', async () => {
    const s = setup();
    const res = { write: jest.fn() };
    await s.service.streamChat('q', [], 'admin1', res);
    expect(res.write.mock.calls.map((c) => c[0])).toEqual([
      `data: ${JSON.stringify({ delta: 'OPS REPLY' })}\n\n`,
      'data: [DONE]\n\n',
    ]);
    expect(s.sessions.appendMessages).toHaveBeenCalled();
  });

  it('still terminates the stream with [DONE] when orchestration fails', async () => {
    const s = setup();
    s.router.classify.mockRejectedValue(new Error('x'));
    const res = { write: jest.fn() };
    await s.service.streamChat('q', [], 'admin1', res);
    const writes = res.write.mock.calls.map((c) => c[0]);
    expect(writes[0]).toContain('Something went wrong');
    expect(writes.at(-1)).toBe('data: [DONE]\n\n');
  });
});

describe('async chat jobs', () => {
  it('enqueues a chat-query job with a per-admin job id', async () => {
    const s = setup();
    const out = await s.service.enqueueChat(' hello ', [], 'admin1');
    expect(out).toEqual({ jobId: 'job-1' });
    const [name, data, opts] = s.chatbotQueue.add.mock.calls[0];
    expect(name).toBe(CHATBOT_JOBS.CHAT_QUERY);
    expect(data).toEqual({ message: 'hello', history: [], adminId: 'admin1' });
    expect(opts.jobId).toMatch(/^chat-admin1-\d+$/);
    expect(opts.attempts).toBe(2);
  });

  it('refuses to enqueue when no Gemini key is configured', async () => {
    const s = setup();
    delete process.env.GEMINI_API_KEY;
    await expect(s.service.enqueueChat('hi', [], 'admin1')).rejects.toThrow('GEMINI_API_KEY not configured');
  });

  it.each([
    ['completed', { returnvalue: { reply: 'done!' } }, { status: 'done', reply: 'done!' }],
    ['failed', { failedReason: 'boom' }, { status: 'failed', reply: 'boom' }],
    ['active', {}, { status: 'pending' }],
  ])('maps a %s job to its result', async (state, job, expected) => {
    const s = setup();
    s.chatbotQueue.getJob.mockResolvedValue({ getState: async () => state, ...job });
    await expect(s.service.getChatJobResult('j')).resolves.toEqual(expected);
  });

  it('reports an unknown job id as failed', async () => {
    const s = setup();
    s.chatbotQueue.getJob.mockResolvedValue(null);
    await expect(s.service.getChatJobResult('nope')).resolves.toEqual({ status: 'failed', reply: 'Job not found.' });
  });

  it('_executeChatQuery (the queue worker entry point) answers and persists', async () => {
    const s = setup();
    await expect(s.service._executeChatQuery({ message: 'q', history: [], adminId: 'admin1' })).resolves.toEqual({ reply: 'OPS REPLY' });
    expect(s.sessions.appendMessages).toHaveBeenCalled();
  });

  it('_executeChatQuery returns an error reply instead of throwing', async () => {
    const s = setup();
    s.router.classify.mockRejectedValue(new Error('x'));
    await expect(s.service._executeChatQuery({ message: 'q', history: [], adminId: 'a' })).resolves.toEqual({ reply: '⚠️ Something went wrong.' });
  });
});

describe('history', () => {
  it('returns the last 20 stored messages', async () => {
    const s = setup();
    s.sessions.getByAdminId.mockResolvedValue({ messages: Array.from({ length: 30 }, (_, i) => ({ text: String(i) })) });
    const out = await s.service.getHistory('admin1');
    expect(out).toHaveLength(20);
    expect(out[0].text).toBe('10');
  });

  it('clears the admin\'s session', async () => {
    const s = setup();
    await s.service.clearHistory('admin1');
    expect(s.sessions.clearByAdminId).toHaveBeenCalledWith('admin1');
  });
});

describe('getBriefing()', () => {
  it('keeps the {dashboard, orderStatus, lowStock} text shape the admin UI reads', async () => {
    const s = setup();
    s.tools.execute.mockImplementation(async (name: string) => {
      if (name === 'get_dashboard_summary') return { todayOrders: 5, monthRevenue: 1000, recent: [{ a: 1 }] };
      if (name === 'get_orders_by_status') return { pending: 2 };
      return { count: 0 };
    });
    const out = await s.service.getBriefing();
    expect(out.dashboard).toBe('**today Orders**: 5\n**month Revenue**: 1000');
    expect(out.orderStatus).toBe('**pending**: 2');
    expect(out.lowStock).toBe('No low stock products found.');
  });

  it('returns null for a section whose lookup failed', async () => {
    const s = setup();
    s.tools.execute.mockRejectedValue(new Error('x'));
    await expect(s.service.getBriefing()).resolves.toEqual({ dashboard: null, orderStatus: null, lowStock: null });
  });
});

describe('startup', () => {
  it('warms the ops agent cache in the background without blocking boot, even if warm-up fails', async () => {
    const s = setup();
    s.ops.warmUp.mockRejectedValue(new Error('no cache'));
    await expect(s.service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(s.ops.warmUp).toHaveBeenCalled();
  });

  it('does not schedule the daily briefing without ADMIN_REPORT_EMAIL', async () => {
    const s = setup();
    await s.service.onApplicationBootstrap();
    expect(s.adminQueue.add).not.toHaveBeenCalled();
  });

  it('schedules the 9 AM IST daily briefing, replacing any previous schedule', async () => {
    const s = setup();
    process.env.ADMIN_REPORT_EMAIL = 'boss@example.com';
    s.adminQueue.getRepeatableJobs.mockResolvedValue([
      { name: ADMIN_JOBS.DAILY_BRIEFING, key: 'old-key' },
      { name: 'other', key: 'keep' },
    ]);
    await s.service.onApplicationBootstrap();
    expect(s.adminQueue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(s.adminQueue.removeRepeatableByKey).toHaveBeenCalledWith('old-key');
    expect(s.adminQueue.add).toHaveBeenCalledWith(
      ADMIN_JOBS.DAILY_BRIEFING,
      { adminEmail: 'boss@example.com' },
      { repeat: { pattern: '0 9 * * *', tz: 'Asia/Kolkata' }, jobId: 'repeatable-daily-briefing' },
    );
  });

  it('_executeDailyBriefing emails the briefing to the configured admin', async () => {
    const s = setup();
    s.tools.execute.mockResolvedValue({ todayOrders: 1 });
    await s.service._executeDailyBriefing({ adminEmail: 'boss@example.com' });
    expect(s.email.sendAdminReport).toHaveBeenCalledWith(
      'boss@example.com',
      expect.stringContaining('Naturelite Daily Briefing'),
      expect.stringContaining('Naturelite Daily Briefing'),
    );
  });
});
