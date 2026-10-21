const mockSend = jest.fn();
const mockChatsCreate = jest.fn((_cfg: any) => ({ sendMessage: mockSend }));
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ chats: { create: mockChatsCreate } })),
}));

import { Logger } from '@nestjs/common';
import { SynthesizerAgent } from './synthesizer.agent';
import type { AgentOutput } from '../agent-utils';

const outputs: AgentOutput[] = [
  { domain: 'billing_crm', data: 'Outstanding is ₹1,24,500 across 3 bills.' },
  { domain: 'ops', data: 'Rahul placed 7 orders.' },
];

const OLD_ENV = process.env;

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  mockSend.mockReset();
  mockChatsCreate.mockClear();
  process.env = { ...OLD_ENV, GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'main-model' };
});
afterAll(() => {
  process.env = OLD_ENV;
});

describe('SynthesizerAgent.synthesize', () => {
  it('sends the question and every agent\'s data to the model and returns its reply', async () => {
    mockSend.mockResolvedValue({ text: 'Merged answer' });
    await expect(new SynthesizerAgent().synthesize('how is Rahul doing?', outputs, [])).resolves.toBe('Merged answer');

    const message: string = mockSend.mock.calls[0][0].message;
    expect(message).toContain('how is Rahul doing?');
    expect(message).toContain('Outstanding is ₹1,24,500 across 3 bills.');
    expect(message).toContain('Rahul placed 7 orders.');
  });

  it('runs without tools, on GEMINI_MODEL, with the conversation history', async () => {
    mockSend.mockResolvedValue({ text: 'ok' });
    await new SynthesizerAgent().synthesize('q', outputs, [{ role: 'user', text: 'earlier' }]);
    const cfg = mockChatsCreate.mock.calls[0][0];
    expect(cfg.model).toBe('main-model');
    expect(cfg.config.tools).toBeUndefined();
    expect(cfg.config.temperature).toBe(0.2);
    expect(cfg.history).toEqual([{ role: 'user', parts: [{ text: 'earlier' }] }]);
  });

  it('instructs the model to blend domains and follow the reply-formatting rules', async () => {
    mockSend.mockResolvedValue({ text: 'ok' });
    await new SynthesizerAgent().synthesize('q', outputs, []);
    const prompt: string = mockChatsCreate.mock.calls[0][0].config.systemInstruction;
    expect(prompt).toMatch(/Answer-first/);
    expect(prompt).toMatch(/₹/);
    expect(prompt).toMatch(/ONE final answer/);
  });

  it('returns every agent\'s data unmerged when no API key is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    const reply = await new SynthesizerAgent().synthesize('q', outputs, []);
    expect(reply).toContain('Outstanding is ₹1,24,500 across 3 bills.');
    expect(reply).toContain('Rahul placed 7 orders.');
    expect(mockChatsCreate).not.toHaveBeenCalled();
  });

  it('keeps all agents\' data when the model call fails instead of dropping every domain but the first', async () => {
    mockSend.mockRejectedValue(new Error('gemini_timeout'));
    const reply = await new SynthesizerAgent().synthesize('q', outputs, []);
    expect(reply).toContain('Outstanding is ₹1,24,500 across 3 bills.');
    expect(reply).toContain('Rahul placed 7 orders.');
  });

  it('reports a generation failure when the model returns no text', async () => {
    mockSend.mockResolvedValue({ text: '' });
    await expect(new SynthesizerAgent().synthesize('q', outputs, [])).resolves.toMatch(/Could not generate a response/);
  });
});
