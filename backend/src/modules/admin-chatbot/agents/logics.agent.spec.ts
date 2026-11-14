const mockSend = jest.fn();
const mockChatsCreate = jest.fn((_cfg: any) => ({ sendMessage: mockSend }));
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ chats: { create: mockChatsCreate } })),
  FunctionCallingConfigMode: { AUTO: 'AUTO' },
}));

import { Logger } from '@nestjs/common';
import { LogicsAgent } from './logics.agent';
import { logicsKnowledge } from './logics.knowledge';
import { DEFAULT_FORMULAS, SLOT_KEYS, SLOT_META } from '../../billing/logics/formula-engine';
import { NODE_GROUPS } from '../../billing/logics/formula-presets';
import { PARAM_DEFS } from '../../billing/logics/param-defs';

const textReply = (t: string) => ({ text: t, candidates: [{ content: { parts: [{ text: t }] } }] });
const callReply = (name: string, args?: Record<string, unknown>) => ({ text: '', candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] });

const OLD_ENV = process.env;
let formulas: Record<string, string>;
let registryParams: any[];
let logics: { registry: jest.Mock; formulasFor: jest.Mock };
let proposals: { create: jest.Mock };
const make = () => new LogicsAgent(logics as any, proposals as any);

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation();
  mockSend.mockReset();
  mockChatsCreate.mockClear();
  formulas = { ...DEFAULT_FORMULAS };
  registryParams = PARAM_DEFS.map((d) => ({ ...d, value: d.default, lastChange: null }));
  logics = {
    registry: jest.fn(async () => ({ active: { version: 0, formulas }, history: [], params: registryParams })),
    formulasFor: jest.fn(async () => ({ version: 0, formulas })),
  };
  proposals = { create: jest.fn() };
  process.env = { ...OLD_ENV, GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'main-model' };
});
afterAll(() => { process.env = OLD_ENV; });

describe('the guide knowledge cannot drift from the page', () => {
  const k = logicsKnowledge();
  it('names every box, every ready-made choice, every setting and every step with its built-in formula', () => {
    for (const [i, g] of NODE_GROUPS.entries()) {
      expect(k).toContain(`Box ${i + 1}: "${g.title}"`);
      for (const o of g.options) expect(k).toContain(`"${o.label}"`);
    }
    for (const p of PARAM_DEFS) expect(k).toContain(`"${p.label}"`);
    for (const key of SLOT_KEYS) expect(k).toContain(`step "${key}") = ${DEFAULT_FORMULAS[key]}`);
    for (const s of SLOT_META) expect(k).toContain(s.label);
  });
  it('uses the real button and panel labels from the page', () => {
    for (const label of ['Build it with blocks', 'Or start from a ready-made choice', 'Advanced: type the formula', 'Try it on a sample bill', 'Applies to bills from', 'Discard changes', 'Fixed rules', 'Other settings']) {
      expect(k).toContain(label);
    }
  });
});

describe('LogicsAgent.run', () => {
  it('reports a missing API key without calling the model', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(make().run('q', [])).resolves.toBe('ERROR: GEMINI_API_KEY not set');
    expect(mockChatsCreate).not.toHaveBeenCalled();
  });

  it('offers the lookup tools and the propose tool, and grounds the prompt in the page knowledge', async () => {
    mockSend.mockResolvedValue(textReply('ok'));
    await make().run('q', []);
    const cfg = mockChatsCreate.mock.calls[0][0];
    expect(cfg.model).toBe('main-model');
    expect(cfg.config.tools[0].functionDeclarations.map((d: any) => d.name)).toEqual(['get_logics_state', 'check_formula_change', 'propose_logics_change']);
    expect(cfg.config.systemInstruction).toContain('You cannot apply, save or publish anything yourself');
    expect(cfg.config.systemInstruction).toMatch(/Today is \d{4}-\d{2}-\d{2} \(IST\)/);
    expect(cfg.config.systemInstruction).toContain('Box 5: "Tax amount"');
  });

  it('runs a requested tool and answers from the result', async () => {
    mockSend.mockResolvedValueOnce(callReply('get_logics_state')).mockResolvedValueOnce(textReply('Round-off is Nearest rupee.'));
    await expect(make().run('what is round-off set to', [])).resolves.toBe('Round-off is Nearest rupee.');
    expect(logics.registry).toHaveBeenCalled();
  });
});

describe('get_logics_state', () => {
  it('lists each numbered box with its current choice and the settings', async () => {
    const s: any = await make().execute('get_logics_state', {});
    expect(s.publishedVersion).toMatch(/built-in/);
    expect(s.boxes).toHaveLength(NODE_GROUPS.length);
    expect(s.boxes[8]).toEqual({ number: 9, title: 'Round-off', currentChoice: 'Nearest rupee' });
    expect(s.settings.find((x: any) => x.setting === 'B2CL invoice limit').value).toBe('₹1,00,000.00');
  });
  it('shows a published choice by name and calls an unmatched formula custom', async () => {
    formulas = { ...DEFAULT_FORMULAS, grandTotal: 'roundOff ? floor(grandBefore / 100) * 100 : grandBefore', taxAmt: 'round(taxable * gstRate / 99)' };
    const s: any = await make().execute('get_logics_state', {});
    expect(s.boxes.find((b: any) => b.title === 'Round-off').currentChoice).toBe('Round down to the rupee');
    expect(s.boxes.find((b: any) => b.title === 'Tax amount').currentChoice).toBe('Custom formula');
  });
});

describe('check_formula_change', () => {
  it('passes a valid change and shows the sample bill before and after', async () => {
    const r: any = await make().execute('check_formula_change', { changes: [{ step: 'grandTotal', formula: 'roundOff ? floor(grandBefore / 100) * 100 : grandBefore' }] });
    expect(r.wouldPassPublishChecks).toBe(true);
    expect(r.today.billTotal).toBe('₹2,213.00');
    expect(r.withChange.billTotal).toBe('₹2,212.00');
  });
  it('rejects a change that breaks the checks and says why', async () => {
    const r: any = await make().execute('check_formula_change', { changes: [{ step: 'taxAmt', formula: 'round(taxable * gstRate / 50)' }] });
    expect(r.wouldPassPublishChecks).toBe(false);
    expect(r.problems.join(' ')).toMatch(/not .*% of the taxable/);
  });
  it('reports syntax problems and unknown names as problems, not crashes', async () => {
    const r: any = await make().execute('check_formula_change', { changes: [{ step: 'gross', formula: 'ratePaise *' }] });
    expect(r.wouldPassPublishChecks).toBe(false);
    expect(r.today.billTotal).toBe('₹2,213.00');
    expect(r.withChange.error).toMatch(/gross/);
  });
  it('refuses bad input', async () => {
    const agent = make();
    expect(await agent.execute('check_formula_change', {})).toHaveProperty('error');
    expect(await agent.execute('check_formula_change', { changes: [{ step: 'nonsense', formula: '1' }] })).toHaveProperty('error');
    expect(await agent.execute('check_formula_change', { changes: [{ step: 'gross', formula: '  ' }] })).toHaveProperty('error');
    expect(await agent.execute('save_everything', {})).toHaveProperty('error');
  });
  it('never writes anything', async () => {
    await make().execute('check_formula_change', { changes: [{ step: 'gross', formula: 'floor(ratePaise * qty)' }] });
    expect(Object.keys(logics)).toEqual(['registry', 'formulasFor']);
  });
});

describe('propose_logics_change', () => {
  const args = { kind: 'choice', box: 9, choice: 'Round down to the rupee', startsOn: '2026-12-01', reason: 'r' };
  const card = { id: 'p1', title: 'Round-off: Round down to the rupee', lines: [], startsOn: '2026-12-01', reason: 'r', expiresAt: '' };

  it('stores the prepared change as a card for the admin and tells the model nothing has changed yet', async () => {
    proposals.create.mockResolvedValue(card);
    const ctx = { adminId: 'admin1', proposals: [] as any[], canPropose: true };
    const r: any = await make().execute('propose_logics_change', args, ctx);
    expect(proposals.create).toHaveBeenCalledWith('admin1', args);
    expect(ctx.proposals).toEqual([card]);
    expect(r.prepared).toBe(true);
    expect(r.note).toMatch(/Nothing has changed yet/);
  });

  it('passes a refusal back to the model and shows no card', async () => {
    proposals.create.mockResolvedValue({ error: 'A reason is required.' });
    const ctx = { adminId: 'admin1', proposals: [] as any[], canPropose: true };
    expect(await make().execute('propose_logics_change', args, ctx)).toEqual({ error: 'A reason is required.' });
    expect(ctx.proposals).toEqual([]);
  });

  it('stops after three cards in one question and refuses without a request context', async () => {
    proposals.create.mockResolvedValue(card);
    const ctx = { adminId: 'admin1', proposals: [card, card, card] as any[], canPropose: true };
    expect(await make().execute('propose_logics_change', args, ctx)).toHaveProperty('error');
    expect(proposals.create).not.toHaveBeenCalled();
    expect(await make().execute('propose_logics_change', args)).toHaveProperty('error');
  });

  it('hands the request context to the tool while the model runs', async () => {
    proposals.create.mockResolvedValue(card);
    mockSend.mockResolvedValueOnce(callReply('propose_logics_change', args)).mockResolvedValueOnce(textReply('Press Confirm.'));
    const ctx = { adminId: 'admin1', proposals: [] as any[], canPropose: true };
    await expect(make().run('round down from 1 Dec, reason r', [], ctx)).resolves.toBe('Press Confirm.');
    expect(ctx.proposals).toHaveLength(1);
  });

  it('refuses to prepare a change where no Confirm card can be shown (the full chat page)', async () => {
    proposals.create.mockResolvedValue(card);
    const ctx = { adminId: 'admin1', proposals: [] as any[] };
    const r: any = await make().execute('propose_logics_change', args, ctx);
    expect(r.error).toMatch(/floating assistant/);
    expect(proposals.create).not.toHaveBeenCalled();
    expect(ctx.proposals).toEqual([]);
  });

  it('lists what each recent version changed, so the model can find one to go back to', async () => {
    const reg = await logics.registry();
    logics.registry.mockResolvedValue({ ...reg, defaults: DEFAULT_FORMULAS, history: [{ version: 2, effectiveFrom: new Date('2026-08-01'), reason: 'x', slots: { ...DEFAULT_FORMULAS, grandTotal: 'roundOff ? floor(grandBefore / 100) * 100 : grandBefore' } }] });
    const s: any = await make().execute('get_logics_state', {});
    expect(s.recentVersions[0]).toMatchObject({ version: 2, startsOn: '2026-08-01', setsBoxesAwayFromBuiltIn: ['Round-off: Round down to the rupee'] });
  });
});
