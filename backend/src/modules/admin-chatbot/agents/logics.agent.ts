import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, FunctionCallingConfigMode, type FunctionDeclaration } from '@google/genai';
import { ChatCtx, HistoryItem, historyToContent } from '../agent-utils';
import { FORMAT_RULES } from './format-rules';
import { runToolLoop } from './tool-loop';
import { logicsKnowledge } from './logics.knowledge';
import { inr, istDate, sampleSummary } from './logics.summary';
import { LogicsService } from '../../billing/logics/logics.service';
import { LogicsProposalService } from '../logics-proposal.service';
import { Formulas, SAMPLE_BILL, SLOT_KEYS, selfCheck } from '../../billing/logics/formula-engine';
import { NODE_GROUPS } from '../../billing/logics/formula-presets';

const MAX_TOOL_ITERATIONS = 6;
const MAX_PROPOSALS_PER_QUESTION = 3;
const S = 'STRING' as any;
const N = 'NUMBER' as any;
const O = 'OBJECT' as any;
const A = 'ARRAY' as any;

const LOGICS_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_logics_state',
    description: 'What billing is set to right now: the published version, the current choice in each numbered box, the other settings with their values, and recent published versions with what each one changed. Use for: "what is my current setting", "is round-off set to nearest", "what is the B2CL limit", "what changed recently", and to find a version to go back to.',
    parameters: { type: O, properties: {} },
  },
  {
    name: 'check_formula_change',
    description: 'Dry-run a proposed change to one or more formula steps WITHOUT saving anything. Returns whether it would pass the publish safety checks, the problems if not, and the sample bill result today versus with the change. Use it before proposing any custom formula, so the advice is verified.',
    parameters: {
      type: O,
      properties: {
        changes: {
          type: A,
          description: 'Steps to change',
          items: {
            type: O,
            properties: {
              step: { type: S, description: `Step name, one of: ${SLOT_KEYS.join(', ')}` },
              formula: { type: S, description: 'The full new formula text for that step' },
            },
            required: ['step', 'formula'],
          },
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'propose_logics_change',
    description: 'Prepare a change for the admin to confirm. This changes NOTHING by itself: it shows the admin a card with Confirm and Cancel buttons, and only their Confirm applies it. Needs a start date and a reason from the admin. Use kind "choice" for a ready-made choice in a numbered box, "formula" for a custom formula, "setting" for one of the other settings, "revert" to go back to an earlier published version.',
    parameters: {
      type: O,
      properties: {
        kind: { type: S, description: 'choice | formula | setting | revert' },
        box: { type: N, description: 'For kind "choice": the box number' },
        choice: { type: S, description: 'For kind "choice": the choice name exactly as listed for that box' },
        changes: {
          type: A,
          description: 'For kind "formula": the steps to change',
          items: { type: O, properties: { step: { type: S }, formula: { type: S } }, required: ['step', 'formula'] },
        },
        setting: { type: S, description: 'For kind "setting": the setting name, e.g. "B2CL invoice limit"' },
        value: { type: S, description: 'For kind "setting": the new value in paise (B2CL limit, tolerance) or comma-separated seconds (retry delays)' },
        toVersion: { type: N, description: 'For kind "revert": the published version number, or 0 for the built-in formulas' },
        startsOn: { type: S, description: 'Date the change starts applying to bills, YYYY-MM-DD' },
        reason: { type: S, description: 'Short reason given by the admin' },
      },
      required: ['kind', 'startsOn', 'reason'],
    },
  },
];

function systemPrompt(today: string): string {
  return `You are the NatureLite billing-logic assistant, inside the admin panel. You help a store manager change how billing calculates, using the Logics page. Today is ${today} (IST).

## What you do
- Explain, step by step, which clicks on the Logics page achieve what the admin wants.
- When the admin asks you to MAKE a change ("round tax down from today", "set the B2CL limit to 2 lakh", "go back to the earlier setting"), prepare it with propose_logics_change. That shows the admin a card with Confirm and Cancel buttons. Nothing changes until THEY press Confirm. You cannot apply, save or publish anything yourself, and you must never say or imply that you did. After proposing, say in one or two sentences what the card will do and ask them to press Confirm.
- Before proposing you need three things: what to change, the start date and a reason. If the admin did not give a start date, ask "From which date?" and suggest today (${today}). If they did not give a reason, ask for a short one. Never invent a date or a reason. "From today" or "now" means ${today}.
- Prefer a ready-made choice (kind "choice") over a custom formula. For a custom formula, call check_formula_change first and only propose it if it passes; quote the sample-bill difference.
- To answer "what is it set to now", or to find an older version to go back to, call get_logics_state. Never guess.
- Ask which one if a request is ambiguous (for example "round down" could be the tax in box 5 or the final total in box 9) instead of choosing for them.
- If the tool returns an error, explain it plainly and fix it or ask a question. Do not repeat the same failing call.
- If the request cannot be done on the Logics page (a fixed rule, or something else entirely), say so plainly and say that a developer must change it. Never invent a box, option, setting or button that is not described below.
- Mention that old bills do not change.
- If the admin message begins with "[On page /billing/logics]", they already have the page open: skip the "where to find it" step.

## Style
- Numbered steps for how-to answers, each step one action. Use the exact box numbers, names and button labels from the knowledge below.
- Keep answers short. One short intro sentence, then the steps (if any), then one line on what to expect.
- Rupee amounts as ₹ with Indian formatting.

${logicsKnowledge()}

${FORMAT_RULES}`.trim();
}

/** How the billing Logics page works, grounded in the page's own definitions, plus tools to look things up and prepare changes. */
@Injectable()
export class LogicsAgent {
  private readonly logger = new Logger(LogicsAgent.name);

  constructor(private readonly logics: LogicsService, private readonly proposals: LogicsProposalService) {}

  /** Tool handlers. Only `propose_logics_change` stores anything, and that stores a proposal that needs the admin's Confirm. */
  async execute(name: string, args: Record<string, unknown>, ctx?: ChatCtx): Promise<Record<string, unknown>> {
    if (name === 'get_logics_state') return this.state();
    if (name === 'check_formula_change') return this.check(args);
    if (name === 'propose_logics_change') return this.propose(args, ctx);
    return { error: `Unknown tool ${name}` };
  }

  private choiceOf(group: (typeof NODE_GROUPS)[number], f: Record<string, string>): string {
    return group.options.find((o) => Object.entries(o.set).every(([k, v]) => f[k] === v))?.label ?? 'Custom formula';
  }

  private async state(): Promise<Record<string, unknown>> {
    const reg = await this.logics.registry();
    const live = reg.active.formulas as unknown as Record<string, string>;
    const boxes = NODE_GROUPS.map((g, i) => ({ number: i + 1, title: g.title, currentChoice: this.choiceOf(g, live) }));
    const settings = reg.params.map((p: any) => ({
      setting: p.label,
      value: p.key === 'b2clThreshold' ? inr(Number(p.value)) : p.unit === 'paise' ? `${p.value} paise` : `${p.value} (seconds)`,
    }));
    return {
      publishedVersion: reg.active.version === 0 ? 'built-in formulas (nothing published yet)' : reg.active.version,
      boxes,
      settings,
      recentVersions: (reg.history as any[]).slice(0, 5).map((h) => {
        const f = { ...(reg.defaults as unknown as Record<string, string>), ...h.slots };
        const changed = NODE_GROUPS.filter((g) => this.choiceOf(g, f) !== g.options[0].label).map((g) => `${g.title}: ${this.choiceOf(g, f)}`);
        return { version: h.version, startsOn: istDate(h.effectiveFrom), reason: h.reason, setsBoxesAwayFromBuiltIn: changed.length ? changed : ['none (same as built-in)'] };
      }),
    };
  }

  private async check(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const changes = Array.isArray(args.changes) ? (args.changes as Array<{ step?: unknown; formula?: unknown }>) : [];
    if (changes.length === 0 || changes.length > SLOT_KEYS.length) return { error: 'Give between 1 and 13 changes, each with a step and a formula.' };
    const current = (await this.logics.formulasFor(new Date())).formulas;
    const next: Formulas = { ...current };
    for (const c of changes) {
      if (typeof c.step !== 'string' || !(SLOT_KEYS as readonly string[]).includes(c.step)) return { error: `Unknown step "${String(c.step)}". Steps are: ${SLOT_KEYS.join(', ')}.` };
      if (typeof c.formula !== 'string' || !c.formula.trim()) return { error: `The formula for "${c.step}" is empty.` };
      next[c.step as keyof Formulas] = c.formula.trim();
    }
    const problems = selfCheck(next);
    return {
      wouldPassPublishChecks: problems.length === 0,
      problems,
      sampleBill: SAMPLE_BILL.text,
      today: sampleSummary(current),
      withChange: sampleSummary(next),
    };
  }

  private async propose(args: Record<string, unknown>, ctx?: ChatCtx): Promise<Record<string, unknown>> {
    if (!ctx) return { error: 'Changes cannot be prepared in this context.' };
    // The full chat page streams plain text and has no Confirm card, so a proposal made there could never be confirmed.
    if (!ctx.canPropose) return { error: 'Changes can only be prepared from the floating assistant (the round button at the bottom-right of the admin panel). Tell the admin to open it and ask there, or to make the change on the Logics page.' };
    if (ctx.proposals.length >= MAX_PROPOSALS_PER_QUESTION) return { error: 'Enough changes are already waiting for confirmation. Ask the admin to confirm or cancel those first.' };
    const result = await this.proposals.create(ctx.adminId, args);
    if ('error' in result) return result;
    ctx.proposals.push(result);
    return { prepared: true, title: result.title, note: 'A card with Confirm and Cancel buttons is now shown to the admin. Nothing has changed yet. Ask them to press Confirm.' };
  }

  async run(query: string, history: HistoryItem[], ctx?: ChatCtx): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return 'ERROR: GEMINI_API_KEY not set';

    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: process.env.GEMINI_MODEL!,
      history: historyToContent(history),
      config: {
        systemInstruction: systemPrompt(istDate(new Date())),
        tools: [{ functionDeclarations: LOGICS_TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        temperature: 0.1,
        maxOutputTokens: 2500,
      },
    });

    return runToolLoop({
      chat,
      query,
      tools: { execute: (name, args) => this.execute(name, args, ctx) },
      logger: this.logger,
      label: 'LogicsAgent',
      maxIterations: MAX_TOOL_ITERATIONS,
      emptyReply: 'I could not work out an answer. Try asking what you want billing to do differently.',
    });
  }
}
