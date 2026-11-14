import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CrmEngineService } from '../crm-engine.service';
import { CrmSettings, DEFAULT_REORDER_CYCLES } from '../schemas/crm-settings.schema';
import { CrmLogicSet } from '../schemas/crm-logic-set.schema';
import { CrmLogicLog } from '../schemas/crm-logic-log.schema';
import {
  CRM_SAMPLES, CRM_SLOT_KEYS, CRM_SLOT_META, CRM_VAR_LABELS, DEFAULT_CRM_FORMULAS, crmSelfCheck, evalCycle, evalPriority,
  type CrmFormulas,
} from '../engine/crm-formulas';
import { CRM_GROUPS } from './crm-groups';
import { CRM_VALUE_DEFS, checkCrmValues } from './crm-param-defs';

export interface CrmSampleOut { text: string; cycleDays: number | string; score: number | string; band: string }

const TOP_LEVEL = ['dueSoonDays', 'minOrdersForPersonal', 'priorityHighAt', 'priorityMediumAt', 'fallbackCycleDays', 'dailyCallTarget'];
const THRESHOLDS = ['atRiskAfterDays', 'dormantAfterDays', 'lostAfterDays'];

@Injectable()
export class CrmLogicsService {
  constructor(
    private readonly engine: CrmEngineService,
    @InjectModel(CrmSettings.name) private settingsModel: Model<CrmSettings>,
    @InjectModel(CrmLogicSet.name) private setModel: Model<CrmLogicSet>,
    @InjectModel(CrmLogicLog.name) private logModel: Model<CrmLogicLog>,
  ) {}

  /** Flat view of every number, with built-ins for anything not stored yet. */
  async currentValues(): Promise<{ values: Record<string, number>; cycles: Record<string, number> }> {
    const s: any = await this.settingsModel.findOne().lean();
    const v: Record<string, number> = Object.fromEntries(CRM_VALUE_DEFS.map(d => [d.key, d.default]));
    for (const k of TOP_LEVEL) if (typeof s?.[k] === 'number') v[k] = s[k];
    for (const k of THRESHOLDS) if (typeof s?.thresholds?.[k] === 'number') v[k] = s.thresholds[k];
    if (typeof s?.vip?.minOrders === 'number') v.vipMinOrders = s.vip.minOrders;
    if (typeof s?.vip?.minLifetimeValue === 'number') v.vipMinLifetimeValue = s.vip.minLifetimeValue;
    return { values: v, cycles: { ...(s?.reorderCycles ?? DEFAULT_REORDER_CYCLES) } };
  }

  async registry() {
    const [rules, history, cur] = await Promise.all([
      this.engine.loadRules(),
      this.setModel.find().sort({ version: -1 }).limit(20).lean() as unknown as Promise<any[]>,
      this.currentValues(),
    ]);
    const values = CRM_VALUE_DEFS.map(d => ({ ...d, value: cur.values[d.key] }));
    return {
      slots: CRM_SLOT_META, varLabels: CRM_VAR_LABELS, groups: CRM_GROUPS, defaults: DEFAULT_CRM_FORMULAS,
      active: { version: history[0]?.version ?? 0, formulas: rules.formulas },
      latestVersion: history[0]?.version ?? 0, history, values, reorderCycles: cur.cycles, samples: CRM_SAMPLES.map(s => s.text),
    };
  }

  private cleanFormulas(raw: unknown): CrmFormulas {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Formulas are required');
    const out = {} as CrmFormulas;
    for (const k of CRM_SLOT_KEYS) {
      const v = (raw as any)[k];
      if (typeof v !== 'string' || !v.trim()) throw new BadRequestException(`Formula "${k}" is empty`);
      out[k] = v.trim();
    }
    return out;
  }

  private sampleRun(f: CrmFormulas, v: Record<string, number>): CrmSampleOut[] {
    return CRM_SAMPLES.map(s => {
      const cycleDays: number | string = evalCycle(f, s.cycle) ?? 'no usable number';
      let score: number | string;
      let band = '-';
      try {
        const n = evalPriority(f, s.priority);
        score = n;
        band = n >= v.priorityHighAt ? 'high' : n >= v.priorityMediumAt ? 'medium' : 'low';
      } catch (e: any) { score = `error: ${e.message}`; }
      return { text: s.text, cycleDays, score, band };
    });
  }

  /** Dry run on the sample customers; nothing is saved. */
  async preview(formulas?: unknown, values?: unknown) {
    const [cur, rules] = await Promise.all([this.currentValues(), this.engine.loadRules()]);
    const f = formulas === undefined ? rules.formulas : this.cleanFormulas(formulas);
    let v = cur.values;
    const problems = crmSelfCheck(f);
    if (values !== undefined) {
      const c = checkCrmValues(cur.values, values);
      if ('error' in c) problems.push(c.error); else v = { ...v, ...c.values };
    }
    return { ok: problems.length === 0, problems, today: this.sampleRun(rules.formulas, cur.values), withChange: this.sampleRun(f, v) };
  }

  private async log(area: 'formulas' | 'values', before: unknown, after: unknown, reason: string, userId: string, ip: string) {
    await this.logModel.create({ area, before, after, reason, userId, ip, at: new Date() });
  }

  /** `baseVersion` = newest version the caller was looking at; a stale one is refused so two admins cannot undo each other. */
  async publishFormulas(raw: unknown, reason: string, userId: string, ip: string, baseVersion?: number) {
    const formulas = this.cleanFormulas(raw);
    reason = String(reason ?? '').trim();
    if (!reason) throw new BadRequestException('A reason is required');
    const problems = crmSelfCheck(formulas);
    if (problems.length) throw new BadRequestException(`Formulas failed the checks: ${problems.join('; ')}`);
    const last: any = await this.setModel.findOne().sort({ version: -1 }).lean();
    if (baseVersion !== undefined && baseVersion !== (last?.version ?? 0)) {
      throw new BadRequestException('Someone published a newer version while you were editing. Reload the page and make your change again.');
    }
    const before = { ...DEFAULT_CRM_FORMULAS, ...(last?.formulas ?? {}) };
    const doc = await this.setModel.create({ version: (last?.version ?? 0) + 1, formulas, reason, createdBy: userId });
    await this.log('formulas', { version: last?.version ?? 0, formulas: before }, { version: doc.version, formulas }, reason, userId, ip);
    this.engine.refreshAll('settings').catch(() => {});
    return doc;
  }

  async setValues(patch: unknown, reason: string, userId: string, ip: string) {
    reason = String(reason ?? '').trim();
    if (!reason) throw new BadRequestException('A reason is required');
    const cur = await this.currentValues();
    const checked = checkCrmValues(cur.values, patch);
    if ('error' in checked) throw new BadRequestException(checked.error);
    const v = { ...cur.values, ...checked.values };
    const changed = Object.keys(checked.values);
    const $set: Record<string, unknown> = {};
    for (const k of changed) if (TOP_LEVEL.includes(k)) $set[k] = v[k];
    // nested objects are always written whole so a partial object is never stored
    if (changed.some(k => THRESHOLDS.includes(k))) $set.thresholds = { atRiskAfterDays: v.atRiskAfterDays, dormantAfterDays: v.dormantAfterDays, lostAfterDays: v.lostAfterDays };
    if (changed.some(k => k.startsWith('vip'))) $set.vip = { minOrders: v.vipMinOrders, minLifetimeValue: v.vipMinLifetimeValue };
    if (checked.cycles) $set.reorderCycles = { ...cur.cycles, ...checked.cycles };
    if (!Object.keys($set).length) throw new BadRequestException('Nothing to change');
    await this.settingsModel.findOneAndUpdate({}, { $set }, { upsert: true, new: true });
    const before: Record<string, unknown> = Object.fromEntries(changed.map(k => [k, cur.values[k]]));
    const after: Record<string, unknown> = { ...checked.values };
    if (checked.cycles) { before.reorderCycles = cur.cycles; after.reorderCycles = $set.reorderCycles; }
    await this.log('values', before, after, reason, userId, ip);
    this.engine.refreshAll('settings').catch(() => {});
  }
}
