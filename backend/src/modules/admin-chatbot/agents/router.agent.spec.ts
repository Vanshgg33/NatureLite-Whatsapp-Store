const mockSend = jest.fn();
const mockCreate = jest.fn((_cfg: any) => ({ sendMessage: mockSend }));
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ chats: { create: mockCreate } })),
}));

import { RouterAgent } from './router.agent';

const reply = (text: string) => Promise.resolve({ text });

describe('RouterAgent.classify', () => {
  const OLD_ENV = process.env;
  let router: RouterAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'main-model' };
    delete process.env.GEMINI_ROUTER_MODEL;
    router = new RouterAgent();
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('routes a billing/CRM query to billing_crm and not ops', async () => {
    mockSend.mockReturnValue(reply('{"domains": ["billing_crm"]}'));
    await expect(router.classify('billing outstanding for at-risk customers', [])).resolves.toEqual(['billing_crm']);
  });

  it('returns every domain for a cross-domain query', async () => {
    mockSend.mockReturnValue(reply('{"domains": ["ops", "purchase"]}'));
    await expect(router.classify('low stock and pending POs', [])).resolves.toEqual(['ops', 'purchase']);
  });

  it('parses JSON wrapped in a markdown code fence', async () => {
    mockSend.mockReturnValue(reply('```json\n{"domains": ["purchase"]}\n```'));
    await expect(router.classify('pending purchase requests', [])).resolves.toEqual(['purchase']);
  });

  it('drops unknown domains and de-duplicates', async () => {
    mockSend.mockReturnValue(reply('{"domains": ["finance", "purchase", "purchase"]}'));
    await expect(router.classify('anything', [])).resolves.toEqual(['purchase']);
  });

  it('falls back to ops when no valid domain is returned', async () => {
    mockSend.mockReturnValue(reply('{"domains": ["finance"]}'));
    await expect(router.classify('anything', [])).resolves.toEqual(['ops']);
  });

  it('falls back to ops without throwing when the model returns non-JSON', async () => {
    mockSend.mockReturnValue(reply('I think this is about orders.'));
    await expect(router.classify('anything', [])).resolves.toEqual(['ops']);
  });

  it('falls back to ops when JSON is malformed', async () => {
    mockSend.mockReturnValue(reply('{"domains": ["ops"'));
    await expect(router.classify('anything', [])).resolves.toEqual(['ops']);
  });

  it('falls back to ops when every model call fails', async () => {
    mockSend.mockRejectedValue(new Error('boom'));
    await expect(router.classify('anything', [])).resolves.toEqual(['ops']);
  });

  it('skips the model entirely and returns ops when no API key is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(router.classify('anything', [])).resolves.toEqual(['ops']);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('uses gemini-2.0-flash-001 unless GEMINI_ROUTER_MODEL overrides it', async () => {
    mockSend.mockReturnValue(reply('{"domains": ["ops"]}'));
    await router.classify('x', []);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ model: 'gemini-2.0-flash-001' });

    process.env.GEMINI_ROUTER_MODEL = 'custom-router';
    await router.classify('x', []);
    expect(mockCreate.mock.calls[1][0]).toMatchObject({ model: 'custom-router' });
  });

  it('retries once on GEMINI_MODEL when the router model is unavailable instead of silently routing everything to ops', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('404 model gemini-2.0-flash-001 is no longer available'))
      .mockReturnValueOnce(reply('{"domains": ["billing_crm"]}'));
    await expect(router.classify('who owes us money', [])).resolves.toEqual(['billing_crm']);
    expect(mockCreate.mock.calls.map((c: any[]) => c[0].model)).toEqual(['gemini-2.0-flash-001', 'main-model']);
  });

  it('sends only the last 4 history items, starting on a user turn', async () => {
    mockSend.mockReturnValue(reply('{"domains": ["ops"]}'));
    const history = [
      { role: 'user' as const, text: 'u1' },
      { role: 'assistant' as const, text: 'a1' },
      { role: 'user' as const, text: 'u2' },
      { role: 'assistant' as const, text: 'a2' },
      { role: 'user' as const, text: 'u3' },
      { role: 'assistant' as const, text: 'a3' },
    ];
    await router.classify('next', history);
    const sent = (mockCreate.mock.calls[0] as any[])[0].history.map((h: any) => h.parts[0].text);
    expect(sent).toEqual(['u2', 'a2', 'u3', 'a3']);
  });
});
