import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { LogicsService } from '../billing/logics/logics.service';
import { DEFAULT_FORMULAS, Formulas, SAMPLE_BILL, SLOT_KEYS, SLOT_META, selfCheck } from '../billing/logics/formula-engine';
import { NODE_GROUPS } from '../billing/logics/formula-presets';
import { PARAM_DEFS, checkParamValue } from '../billing/logics/param-defs';
import { ChatProposal } from './agent-utils';
import { sampleSummary } from './agents/logics.summary';

const TTL_SECONDS = 600;
const key = (id: string) => `chat:logics-proposal:${id}`;
const claimKey = (id: string) => `chat:logics-proposal:claimed:${id}`;

type Stored =
  | { adminId: string; kind: 'formulas'; patch?: Partial<Formulas>; replace?: Formulas; startsOn: string; reason: string; view: ChatProposal }
  | { adminId: string; kind: 'setting'; key: string; value: number | string; startsOn: string; reason: string; view: ChatProposal };

type Built =
  | { error: string }
  | { stored: { kind: 'formulas'; patch?: Partial<Formulas>; replace?: Formulas } | { kind: 'setting'; key: string; value: number | string }; view: Pick<ChatProposal, 'title' | 'lines' | 'sample'> };

export interface ProposeArgs {
  kind?: unknown; box?: unknown; choice?: unknown; changes?: unknown; setting?: unknown; value?: unknown;
  toVersion?: unknown; startsOn?: unknown; reason?: unknown;
}

/**
 * Turns an assistant suggestion into a stored proposal and, only when the admin presses Confirm, applies it through the
 * same LogicsService calls as the Logics page. The model can create proposals but can never apply one.
 */
@Injectable()
export class LogicsProposalService {
  private readonly logger = new Logger(LogicsProposalService.name);

  constructor(private readonly redis: RedisService, private readonly logics: LogicsService) {}

  /** Validate and store a proposal. Returns the card to show, or an `error` the assistant should explain. */
  async create(adminId: string | undefined, a: ProposeArgs): Promise<ChatProposal | { error: string }> {
    if (!adminId) return { error: 'Changes can only be prepared for a signed-in admin.' };
    const startsOn = String(a.startsOn ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || isNaN(new Date(`${startsOn}T00:00:00+05:30`).getTime())) return { error: 'The start date must be a real date written as YYYY-MM-DD. Ask the admin for it.' };
    const reason = String(a.reason ?? '').trim().slice(0, 200);
    if (!reason) return { error: 'A reason is required. Ask the admin for a short reason.' };

    try {
      const built = a.kind === 'setting' ? await this.buildSetting(a, startsOn) : await this.buildFormulas(a, startsOn);
      if ('error' in built) return built;
      const id = randomBytes(12).toString('hex');
      const view: ChatProposal = { id, startsOn, reason, expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(), ...built.view };
      const stored: Stored = { adminId, startsOn, reason, view, ...built.stored } as Stored;
      await this.redis.client.set(key(id), JSON.stringify(stored), 'EX', TTL_SECONDS);
      return view;
    } catch (e: any) {
      if (e instanceof BadRequestException) return { error: e.message };
      this.logger.warn(`propose failed: ${e?.message}`);
      return { error: 'I could not prepare that change right now. Please try again.' };
    }
  }

  private async buildFormulas(a: ProposeArgs, startsOn: string): Promise<Built> {
    // `base` = what is in force when this change starts; `today` = what is in force now (they differ if a future version exists).
    // Only the requested change is stored (a patch), and it is re-applied to the newest formulas at Confirm time, so it can never undo
    // something another admin published in the meantime.
    const base = (await this.logics.formulasFor(new Date(`${startsOn}T00:00:00+05:30`))).formulas;
    const today = (await this.logics.formulasFor(new Date())).formulas;
    let patch: Partial<Formulas> | undefined;
    let replace: Formulas | undefined;
    let title: string;
    let lines: string[];

    if (a.kind === 'choice') {
      const group = NODE_GROUPS[Number(a.box) - 1];
      if (!group) return { error: `There is no box ${String(a.box)}. Boxes are numbered 1 to ${NODE_GROUPS.length}.` };
      const want = String(a.choice ?? '').trim().toLowerCase();
      const option = group.options.find((o) => o.id.toLowerCase() === want || o.label.toLowerCase() === want);
      if (!option) return { error: `Box ${a.box} "${group.title}" has these choices: ${group.options.map((o) => `"${o.label}"`).join(', ')}.` };
      patch = { ...option.set };
      title = `${group.title}: ${option.label}`;
      lines = [`Box ${a.box} "${group.title}" will be set to "${option.label}": ${option.desc}`];
    } else if (a.kind === 'formula') {
      const changes = Array.isArray(a.changes) ? (a.changes as Array<{ step?: unknown; formula?: unknown }>) : [];
      if (!changes.length || changes.length > SLOT_KEYS.length) return { error: 'Give between 1 and 13 changes, each with a step and a formula.' };
      patch = {};
      lines = [];
      for (const c of changes) {
        if (typeof c.step !== 'string' || !(SLOT_KEYS as readonly string[]).includes(c.step)) return { error: `Unknown step "${String(c.step)}". Steps are: ${SLOT_KEYS.join(', ')}.` };
        if (typeof c.formula !== 'string' || !c.formula.trim()) return { error: `The formula for "${c.step}" is empty.` };
        patch[c.step as keyof Formulas] = c.formula.trim();
        lines.push(`${SLOT_META.find((s) => s.key === c.step)?.label ?? c.step} = ${c.formula.trim()}`);
      }
      title = 'Custom formula change';
    } else if (a.kind === 'revert') {
      const v = Number(a.toVersion);
      if (!Number.isInteger(v) || v < 0) return { error: 'toVersion must be a published version number, or 0 for the built-in formulas.' };
      if (v === 0) {
        replace = { ...DEFAULT_FORMULAS };
      } else {
        const reg = await this.logics.registry();
        const found = (reg.history as any[]).find((h) => h.version === v);
        if (!found) return { error: `Version ${v} was not found among the recent versions.` };
        replace = { ...DEFAULT_FORMULAS, ...found.slots };
      }
      title = v === 0 ? 'Go back to the built-in formulas' : `Go back to version ${v}`;
      lines = [title + '.'];
    } else {
      return { error: 'kind must be "choice", "formula", "setting" or "revert".' };
    }

    const next: Formulas = replace ?? { ...base, ...patch };
    if (SLOT_KEYS.every((k) => next[k] === base[k])) return { error: 'Billing is already set exactly like this, so there is nothing to change.' };
    try { await this.logics.assertFormulaStart(startsOn); } catch (e: any) { return { error: e.message }; }
    const problems = selfCheck(next);
    if (problems.length) return { error: `This would fail the publish safety checks: ${problems.join('; ')}` };

    return {
      stored: { kind: 'formulas' as const, patch, replace },
      view: { title, lines, sample: { text: SAMPLE_BILL.text, today: sampleSummary(today), withChange: sampleSummary(next) } },
    };
  }

  private async buildSetting(a: ProposeArgs, startsOn: string): Promise<Built> {
    const want = String(a.setting ?? '').trim().toLowerCase();
    const def = PARAM_DEFS.find((p) => p.key.toLowerCase() === want || p.label.toLowerCase() === want);
    if (!def) return { error: `Settings that can be changed: ${PARAM_DEFS.map((p) => `"${p.label}"`).join(', ')}.` };
    const checked = checkParamValue(def, a.value);
    if ('error' in checked) return { error: checked.error };
    const reg = await this.logics.registry();
    const now = (reg.params as any[]).find((p) => p.key === def.key)?.value;
    if (String(now) === String(checked.value)) return { error: `${def.label} is already ${checked.value}.` };
    try { await this.logics.assertParamStart(def.key, startsOn); } catch (e: any) { return { error: e.message }; }
    const unit = def.unit === 'paise' ? ' paise' : ' seconds';
    return {
      stored: { kind: 'setting' as const, key: def.key, value: checked.value },
      view: { title: `${def.label}: ${checked.value}${unit}`, lines: [`${def.label} (${def.module}) changes from ${now}${unit} to ${checked.value}${unit}.`] },
    };
  }

  /** Apply a proposal the admin confirmed. One use only; only the admin it was prepared for. */
  async confirm(admin: { sub: string }, id: string, ip: string): Promise<{ message: string }> {
    const rec = await this.load(admin.sub, id);
    // SET NX is the single-use lock: only the first confirm gets 'OK', so a double click cannot apply twice.
    const claimed = await this.redis.client.set(claimKey(id), '1', 'EX', TTL_SECONDS, 'NX').catch(() => null);
    if (claimed !== 'OK') throw new ConflictException('This change was already handled.');
    await this.redis.del(key(id));

    const reason = `${rec.reason} (via assistant)`;
    if (rec.kind === 'formulas') {
      const base = (await this.logics.formulasFor(new Date(`${rec.startsOn}T00:00:00+05:30`))).formulas;
      const formulas = rec.replace ?? ({ ...base, ...rec.patch } as Formulas);
      const doc: any = await this.logics.publish(formulas, rec.startsOn, reason, admin.sub, ip);
      return { message: `Published as version ${doc.version}. It applies to bills dated ${rec.startsOn} onward; older bills are unchanged.` };
    }
    await this.logics.setParam(rec.key, rec.value, rec.startsOn, reason, admin.sub, ip);
    return { message: `Saved. It applies from ${rec.startsOn}.` };
  }

  async cancel(admin: { sub: string }, id: string): Promise<{ message: string }> {
    await this.load(admin.sub, id);
    await this.redis.del(key(id));
    return { message: 'Cancelled. Nothing was changed.' };
  }

  private async load(adminId: string, id: string): Promise<Stored> {
    const rec = await this.redis.getJson<Stored>(key(id));
    if (!rec) throw new NotFoundException('This change has expired or was already handled. Ask me again.');
    if (rec.adminId !== adminId) throw new ForbiddenException('This change was prepared for someone else.');
    return rec;
  }
}
