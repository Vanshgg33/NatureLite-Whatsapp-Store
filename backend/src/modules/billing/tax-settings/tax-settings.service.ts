import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { TaxRateRule } from '../schemas/tax-rate-rule.schema'
import { ComplianceParam } from '../schemas/compliance-param.schema'
import { AllowedRate } from '../schemas/allowed-rate.schema'
import { SettingsChangeLog } from '../schemas/settings-changelog.schema'
import { CreateRuleDto } from './dto/create-rule.dto'

// Inlined from frontend/src/lib/billing/tax/resolveRate.ts to avoid cross-package import
// ponytail: duplicate kept in sync with frontend lib; update both when algorithm changes
interface TaxRateRuleLike {
  _id: string | object
  scope: 'hsn' | 'category' | 'item'
  hsnPrefix?: string
  categoryId?: string | object
  itemId?: string | object
  gstRate: number
  cessRate: number
  taxability: string
  effectiveFrom: Date | string
  effectiveTo: Date | string | null
  status: string
}

interface ItemDescriptor { _id: string; hsnCode: string; categoryId?: string }
interface RateResult { gstRate: number; cessRate: number; taxability: string; ruleId: string; source: string }

function selectRate(rules: TaxRateRuleLike[], item: ItemDescriptor, docDate: Date): RateResult | null {
  const candidates = rules.filter(r => {
    if (r.status === 'cancelled') return false
    const from = new Date(r.effectiveFrom)
    const to = r.effectiveTo ? new Date(r.effectiveTo) : null
    return from <= docDate && (to === null || docDate < to)
  })
  const itemMatch = candidates.find(r => r.scope === 'item' && String(r.itemId) === item._id)
  if (itemMatch) return { gstRate: itemMatch.gstRate, cessRate: itemMatch.cessRate, taxability: itemMatch.taxability, ruleId: String(itemMatch._id), source: 'item' }
  const hsnMatches = candidates
    .filter(r => r.scope === 'hsn' && r.hsnPrefix && item.hsnCode.startsWith(r.hsnPrefix))
    .sort((a, b) => {
      const lenDiff = (b.hsnPrefix?.length ?? 0) - (a.hsnPrefix?.length ?? 0)
      if (lenDiff !== 0) return lenDiff
      return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    })
  if (hsnMatches[0]) {
    const m = hsnMatches[0]
    return { gstRate: m.gstRate, cessRate: m.cessRate, taxability: m.taxability, ruleId: String(m._id), source: 'hsn' }
  }
  const catMatch = candidates.find(r => r.scope === 'category' && String(r.categoryId) === item.categoryId)
  if (catMatch) return { gstRate: catMatch.gstRate, cessRate: catMatch.cessRate, taxability: catMatch.taxability, ruleId: String(catMatch._id), source: 'category' }
  return null
}

@Injectable()
export class TaxSettingsService {
  constructor(
    @InjectModel(TaxRateRule.name) private ruleModel: Model<TaxRateRule>,
    @InjectModel(ComplianceParam.name) private paramModel: Model<ComplianceParam>,
    @InjectModel(AllowedRate.name) private allowedRateModel: Model<AllowedRate>,
    @InjectModel(SettingsChangeLog.name) private changelogModel: Model<SettingsChangeLog>,
  ) {}

  async getRules() {
    return this.ruleModel.find().sort({ effectiveFrom: -1 }).lean()
  }

  async createRule(dto: CreateRuleDto, userId: string, ip: string) {
    const allowed = await this.allowedRateModel.findOne({ rate: dto.gstRate, active: true })
    if (!allowed) throw new BadRequestException(`Rate ${dto.gstRate}% is not in the allowed list`)

    const effectiveFrom = new Date(dto.effectiveFrom)

    // Guard: check if effectiveFrom falls inside a filed GST month
    const lockedParam = await this.paramModel.findOne({ key: 'gstr1FiledUntil' }).sort({ effectiveFrom: -1 })
    if (lockedParam) {
      const lockedUntil = new Date(lockedParam.value as string)
      if (effectiveFrom <= lockedUntil) {
        const mo = lockedUntil.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
        throw new BadRequestException(`GSTR-1 for ${mo} is filed. A rate change cannot start inside a filed period.`)
      }
    }

    // Overlap: close previous open rule for same scope+key
    const matchFilter: Record<string, unknown> = { scope: dto.scope, effectiveTo: null, status: { $ne: 'cancelled' } }
    if (dto.scope === 'hsn') matchFilter.hsnPrefix = dto.hsnPrefix
    if (dto.scope === 'category') matchFilter.categoryId = dto.categoryId
    if (dto.scope === 'item') matchFilter.itemId = dto.itemId

    const prev = await this.ruleModel.findOne(matchFilter).sort({ effectiveFrom: -1 })
    if (prev) {
      if (new Date(prev.effectiveFrom) >= effectiveFrom)
        throw new BadRequestException('A rule with the same scope starts on or after the new effective date. Resolve the overlap first.')
      await this.ruleModel.findByIdAndUpdate(prev._id, { effectiveTo: effectiveFrom })
    }

    const rule = await this.ruleModel.create({
      ...dto,
      effectiveFrom,
      cessRate: dto.cessRate ?? 0,
      status: effectiveFrom <= new Date() ? 'active' : 'scheduled',
      createdBy: userId,
    })

    await this.changelogModel.create({
      entity: 'TaxRateRule', entityId: rule._id, action: 'create',
      before: prev?.toObject() ?? null, after: rule.toObject(),
      reason: dto.reason, userId, at: new Date(), ip,
    })

    return rule
  }

  async cancelRule(id: string, reason: string, userId: string, ip: string) {
    const rule = await this.ruleModel.findById(id)
    if (!rule) throw new BadRequestException('Rule not found')
    if (rule.status !== 'scheduled') throw new BadRequestException('Only scheduled (future) rules can be cancelled')
    await rule.updateOne({ status: 'cancelled' })
    await this.changelogModel.create({
      entity: 'TaxRateRule', entityId: rule._id, action: 'cancel',
      before: rule.toObject(), after: { ...rule.toObject(), status: 'cancelled' },
      reason, userId, at: new Date(), ip,
    })
  }

  async getParam(key: string, docDate: Date = new Date()) {
    const param = await this.paramModel
      .findOne({ key, effectiveFrom: { $lte: docDate }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: docDate } }] })
      .sort({ effectiveFrom: -1 })
    return param?.value ?? null
  }

  async getAllParams() {
    return this.paramModel.find().sort({ key: 1, effectiveFrom: -1 }).lean()
  }

  async getChangelog() {
    return this.changelogModel.find().sort({ at: -1 }).limit(500).lean()
  }

  async resolveRateForInvoice(item: ItemDescriptor, docDate: Date): Promise<RateResult> {
    const rules = await this.ruleModel.find({
      effectiveFrom: { $lte: docDate },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gt: docDate } }],
      status: { $ne: 'cancelled' },
    }).lean() as unknown as TaxRateRuleLike[]
    const result = selectRate(rules, item, docDate)
    if (!result) throw new BadRequestException(`No GST rate set for item ${item._id} on ${docDate.toISOString().slice(0,10)}. Ask Admin.`)
    return result
  }
}
