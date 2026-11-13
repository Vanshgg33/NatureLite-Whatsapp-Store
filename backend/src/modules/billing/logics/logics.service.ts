import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { FormulaSet } from '../schemas/formula-set.schema'
import { ComplianceParam } from '../schemas/compliance-param.schema'
import { SettingsChangeLog } from '../schemas/settings-changelog.schema'
import { TaxSettingsService } from '../tax-settings/tax-settings.service'
import { DEFAULT_FORMULAS, Formulas, SLOT_KEYS, SLOT_META, selfCheck } from './formula-engine'
import { PARAM_DEFS, checkParamValue, paramDef } from './param-defs'

/** A date-only string means the start of that day in IST (the shop's clock). */
function startDate(raw: string): Date {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+05:30` : raw)
  if (isNaN(d.getTime())) throw new BadRequestException('Start date is not a valid date')
  return d
}

@Injectable()
export class LogicsService {
  constructor(
    @InjectModel(FormulaSet.name) private setModel: Model<FormulaSet>,
    @InjectModel(ComplianceParam.name) private paramModel: Model<ComplianceParam>,
    @InjectModel(SettingsChangeLog.name) private changelogModel: Model<SettingsChangeLog>,
    private readonly taxSettings: TaxSettingsService,
  ) {}

  /** Formulas in force on `date`: the latest published version starting on or before it, else the built-in ones (version 0). */
  async formulasFor(date: Date = new Date()): Promise<{ version: number; formulas: Formulas }> {
    const set = await this.setModel.findOne({ effectiveFrom: { $lte: date } }).sort({ effectiveFrom: -1, version: -1 }).lean()
    return set ? { version: set.version, formulas: { ...DEFAULT_FORMULAS, ...set.slots } } : { version: 0, formulas: DEFAULT_FORMULAS }
  }

  /** Everything the Logics page needs in one call. */
  async registry() {
    const now = new Date()
    const [active, history] = await Promise.all([
      this.formulasFor(now),
      this.setModel.find().sort({ version: -1 }).limit(20).lean(),
    ])
    const params = await Promise.all(PARAM_DEFS.map(async d => {
      const last = await this.paramModel.findOne({ key: d.key }).sort({ effectiveFrom: -1 }).lean()
      return { ...d, value: await this.taxSettings.paramOrDefault(d.key, now), lastChange: last ? { effectiveFrom: last.effectiveFrom, reason: last.reason } : null }
    }))
    return { slots: SLOT_META, defaults: DEFAULT_FORMULAS, active, history, params }
  }

  private cleanSlots(raw: unknown): Formulas {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Formulas are required')
    const out = {} as Formulas
    for (const k of SLOT_KEYS) {
      const v = (raw as any)[k]
      if (typeof v !== 'string' || !v.trim()) throw new BadRequestException(`Formula "${k}" is empty`)
      out[k] = v.trim()
    }
    return out
  }

  /** Dry run on built-in sample bills; nothing is saved. */
  test(raw: unknown) {
    const problems = selfCheck(this.cleanSlots(raw))
    return { ok: problems.length === 0, problems }
  }

  async publish(raw: unknown, startsOn: string, reason: string, userId: string, ip: string) {
    const slots = this.cleanSlots(raw)
    reason = String(reason ?? '')
    if (!reason.trim()) throw new BadRequestException('A reason is required')
    const effectiveFrom = startDate(startsOn)
    await this.taxSettings.assertPeriodOpen(effectiveFrom)
    // An earlier start than an existing version would be shadowed by it and never apply.
    const latest = await this.setModel.findOne().sort({ effectiveFrom: -1, version: -1 }).lean()
    if (latest && effectiveFrom < new Date(latest.effectiveFrom)) {
      const d = new Date(latest.effectiveFrom).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      throw new BadRequestException(`A version already starts on ${d}. Choose that date or later.`)
    }
    const problems = selfCheck(slots)
    if (problems.length) throw new BadRequestException(`Formulas failed the checks: ${problems.join('; ')}`)

    const before = await this.formulasFor(effectiveFrom)
    const last = await this.setModel.findOne().sort({ version: -1 }).lean()
    const doc = await this.setModel.create({ version: (last?.version ?? 0) + 1, slots, effectiveFrom, reason: reason.trim(), createdBy: userId })
    await this.changelogModel.create({
      entity: 'FormulaSet', entityId: doc._id, action: 'create',
      before: { version: before.version, slots: before.formulas }, after: { version: doc.version, slots, effectiveFrom },
      reason: reason.trim(), userId, at: new Date(), ip,
    })
    return doc
  }

  async setParam(key: string, value: unknown, startsOn: string, reason: string, userId: string, ip: string) {
    const def = paramDef(key)
    if (!def) throw new BadRequestException('This value cannot be edited here')
    reason = String(reason ?? '')
    if (!reason.trim()) throw new BadRequestException('A reason is required')
    const checked = checkParamValue(def, value)
    if ('error' in checked) throw new BadRequestException(checked.error)
    const effectiveFrom = startDate(startsOn)
    await this.taxSettings.assertPeriodOpen(effectiveFrom)

    const prev = await this.paramModel.findOne({ key, effectiveTo: null }).sort({ effectiveFrom: -1 })
    if (prev) {
      if (new Date(prev.effectiveFrom) >= effectiveFrom) throw new BadRequestException('Start date must be later than the current value\'s start date')
      await prev.updateOne({ effectiveTo: effectiveFrom })
    }
    const doc = await this.paramModel.create({ key, value: checked.value, unit: def.unit, effectiveFrom, effectiveTo: null, reason: reason.trim(), createdBy: userId })
    await this.changelogModel.create({
      entity: 'ComplianceParam', entityId: doc._id, action: 'create',
      before: prev?.toObject() ?? null, after: doc.toObject(), reason: reason.trim(), userId, at: new Date(), ip,
    })
    return doc
  }
}
