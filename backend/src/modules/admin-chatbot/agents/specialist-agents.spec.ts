const mockSend = jest.fn();
const mockChatsCreate = jest.fn((_cfg: any) => ({ sendMessage: mockSend }));
const mockCachesCreate = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ chats: { create: mockChatsCreate }, caches: { create: mockCachesCreate } })),
  FunctionCallingConfigMode: { AUTO: 'AUTO' },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { OpsAgent } from './ops.agent';
import { BillingCrmAgent } from './billing-crm.agent';
import { PurchaseAgent } from './purchase.agent';

const textReply = (t: string) => ({ text: t, candidates: [{ content: { parts: [{ text: t }] } }] });
const callReply = (name: string, args?: Record<string, unknown>) => ({
  text: '',
  candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
});

const OLD_ENV = process.env;
let tools: { execute: jest.Mock };

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation();
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  mockSend.mockReset();
  mockChatsCreate.mockClear();
  mockCachesCreate.mockReset().mockRejectedValue(new Error('caching unavailable'));
  tools = { execute: jest.fn().mockResolvedValue({ ok: true }) };
  process.env = { ...OLD_ENV, GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'main-model' };
});
afterAll(() => {
  process.env = OLD_ENV;
});

// Every function the model can be offered must have a handler, or the model's call comes back as "Unknown tool".
const handledTools = new Set(
  [...readFileSync(join(__dirname, '../admin-chatbot-tools.service.ts'), 'utf8').matchAll(/case '([a-z_]+)'/g)].map((m) => m[1]),
);

const agents = [
  { label: 'OpsAgent', make: () => new OpsAgent(tools as any), sampleTool: 'get_dashboard_summary', noReply: 'No ops data found.' },
  { label: 'BillingCrmAgent', make: () => new BillingCrmAgent(tools as any), sampleTool: 'get_crm_overview', noReply: 'No billing/CRM data found.' },
  { label: 'PurchaseAgent', make: () => new PurchaseAgent(tools as any), sampleTool: 'get_purchase_vendors', noReply: 'No purchase data found.' },
];

describe.each(agents)('$label', ({ make, sampleTool, noReply }) => {
  it('reports a missing API key without calling the model', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(make().run('q', [])).resolves.toBe('ERROR: GEMINI_API_KEY not set');
    expect(mockChatsCreate).not.toHaveBeenCalled();
  });

  it('uses GEMINI_MODEL, low temperature and the user history', async () => {
    mockSend.mockResolvedValue(textReply('hi'));
    await make().run('q', [{ role: 'user', text: 'earlier' }]);
    const cfg = mockChatsCreate.mock.calls[0][0];
    expect(cfg.model).toBe('main-model');
    expect(cfg.config.temperature).toBeLessThanOrEqual(0.2);
    expect(cfg.history).toEqual([{ role: 'user', parts: [{ text: 'earlier' }] }]);
  });

  it('is instructed to fetch data with tools and to format a final admin reply (answer-first, ₹)', async () => {
    mockSend.mockResolvedValue(textReply('hi'));
    await make().run('q', []);
    const prompt: string = mockChatsCreate.mock.calls[0][0].config.systemInstruction;
    expect(prompt).toMatch(/ALWAYS call a tool/);
    expect(prompt).toMatch(/Answer-first/);
    expect(prompt).toMatch(/₹/);
    expect(prompt).not.toMatch(/Do NOT format/i);
  });

  it('offers only tools that the tools service can execute', async () => {
    mockSend.mockResolvedValue(textReply('hi'));
    await make().run('q', []);
    const declared: string[] = mockChatsCreate.mock.calls[0][0].config.tools[0].functionDeclarations.map((d: any) => d.name);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((n) => !handledTools.has(n))).toEqual([]);
  });

  it('runs a tool the model asks for and returns the model\'s final text', async () => {
    mockSend.mockResolvedValueOnce(callReply(sampleTool)).mockResolvedValueOnce(textReply('Final answer'));
    await expect(make().run('q', [])).resolves.toBe('Final answer');
    expect(tools.execute).toHaveBeenCalledWith(sampleTool, {});
  });

  it('falls back to a "no data" message when the model returns nothing', async () => {
    mockSend.mockResolvedValue(textReply(''));
    await expect(make().run('q', [])).resolves.toBe(noReply);
  });
});

describe('domain tool sets', () => {
  const declaredBy = async (agent: { run(q: string, h: any[]): Promise<string> }) => {
    mockSend.mockResolvedValue(textReply('x'));
    await agent.run('q', []);
    return mockChatsCreate.mock.calls.at(-1)![0].config.tools[0].functionDeclarations.map((d: any) => d.name) as string[];
  };

  it('BillingCrmAgent offers the 7 billing and CRM tools', async () => {
    expect((await declaredBy(new BillingCrmAgent(tools as any))).sort()).toEqual([
      'get_billing_bills', 'get_billing_customers', 'get_billing_godowns',
      'get_crm_call_logs', 'get_crm_campaigns', 'get_crm_customer_detail', 'get_crm_overview',
    ]);
  });

  it('PurchaseAgent offers the 4 purchase tools', async () => {
    expect((await declaredBy(new PurchaseAgent(tools as any))).sort()).toEqual([
      'get_purchase_materials', 'get_purchase_request_detail', 'get_purchase_requests', 'get_purchase_vendors',
    ]);
  });

  it('OpsAgent keeps all 37 existing operational tools and none of the new ones', async () => {
    const names = await declaredBy(new OpsAgent(tools as any));
    expect(names).toHaveLength(37);
    expect(names).toEqual(expect.arrayContaining(['get_dashboard_summary', 'search_orders', 'send_email_report', 'get_reminders']));
    expect(names.filter((n) => /billing|crm|purchase/.test(n))).toEqual([]);
  });
});

describe('OpsAgent context cache', () => {
  const cache = () => ({ name: 'cachedContents/1', expireTime: new Date(Date.now() + 3_600_000).toISOString() });

  it('attaches the cached prompt+tools instead of sending them inline when a cache exists', async () => {
    mockCachesCreate.mockReset().mockResolvedValue(cache());
    mockSend.mockResolvedValue(textReply('hi'));
    await new OpsAgent(tools as any).run('q', []);
    const config = mockChatsCreate.mock.calls[0][0].config;
    expect(config.cachedContent).toBe('cachedContents/1');
    expect(config.systemInstruction).toBeUndefined();
    expect(config.tools).toBeUndefined();
  });

  it('creates the cache once and reuses it across requests', async () => {
    mockCachesCreate.mockReset().mockResolvedValue(cache());
    mockSend.mockResolvedValue(textReply('hi'));
    const agent = new OpsAgent(tools as any);
    await agent.run('one', []);
    await agent.run('two', []);
    expect(mockCachesCreate).toHaveBeenCalledTimes(1);
  });

  it('builds a new cache when GEMINI_MODEL changes', async () => {
    mockCachesCreate.mockReset().mockResolvedValue(cache());
    mockSend.mockResolvedValue(textReply('hi'));
    const agent = new OpsAgent(tools as any);
    await agent.run('one', []);
    process.env.GEMINI_MODEL = 'other-model';
    await agent.run('two', []);
    expect(mockCachesCreate).toHaveBeenCalledTimes(2);
    expect(mockCachesCreate.mock.calls[1][0].model).toBe('other-model');
  });

  it('falls back to an inline prompt and does not hammer the API after a cache failure', async () => {
    mockSend.mockResolvedValue(textReply('hi'));
    const agent = new OpsAgent(tools as any);
    await agent.run('one', []);
    await agent.run('two', []);
    expect(mockCachesCreate).toHaveBeenCalledTimes(1);
    expect(mockChatsCreate.mock.calls[1][0].config.systemInstruction).toEqual(expect.any(String));
  });

  it('warmUp never throws, even when caching fails', async () => {
    await expect(new OpsAgent(tools as any).warmUp()).resolves.toBeUndefined();
  });

  it('warmUp does nothing without an API key', async () => {
    delete process.env.GEMINI_API_KEY;
    await new OpsAgent(tools as any).warmUp();
    expect(mockCachesCreate).not.toHaveBeenCalled();
  });
});
