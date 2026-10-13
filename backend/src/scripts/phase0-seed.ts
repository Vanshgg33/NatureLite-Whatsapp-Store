/**
 * Phase 0 seed: BusinessProfile, Godowns, AllowedRates, TaxRateRules (GST 2.0), ComplianceParams.
 * Run once: npx ts-node -r tsconfig-paths/register src/scripts/phase0-seed.ts
 */
import mongoose from 'mongoose'

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/naturelite'

async function seed() {
  await mongoose.connect(URI)
  const db = mongoose.connection.db!

  // ── AllowedRates ──────────────────────────────────────────
  const activeRates  = [0, 0.25, 3, 5, 18, 40]
  const inactiveRates = [12, 28]
  for (const rate of activeRates)
    await db.collection('billing_allowed_rates').updateOne({ rate }, { $set: { rate, active: true } }, { upsert: true })
  for (const rate of inactiveRates)
    await db.collection('billing_allowed_rates').updateOne({ rate }, { $set: { rate, active: false } }, { upsert: true })
  console.log('AllowedRates seeded')

  // ── BusinessProfile singleton ─────────────────────────────
  await db.collection('billing_business_profiles').updateOne(
    {},
    { $setOnInsert: {
      name: 'NATURE LITE FOODS', legalName: 'SUHIKA PVT LTD',
      stateCode: '22', fyStartMonth: 4, gstFilingFrequency: 'monthly',
      b2clThreshold: 10_000_000, ewayThreshold: 5_000_000,
      roundOffEnabled: true, defaultPriceMode: 'without_tax', thermalWidth: 80,
      termsByDocType: {}, createdAt: new Date(), updatedAt: new Date(),
    }},
    { upsert: true }
  )
  console.log('BusinessProfile seeded')

  // ── Godowns ───────────────────────────────────────────────
  for (const g of [
    { name: 'Raipur Unit', code: 'RPR', stateCode: '22', isDefault: true },
    { name: 'Office', code: 'OFC', stateCode: '22', isDefault: false },
  ]) await db.collection('billing_godowns').updateOne({ code: g.code }, { $setOnInsert: { ...g, createdAt: new Date(), updatedAt: new Date() } }, { upsert: true })
  console.log('Godowns seeded')

  // ── TaxRateRules (GST 2.0 effective 22 Sep 2025) ──────────
  const GST2_DATE = new Date('2025-09-22')
  const PRE_GST2  = new Date('1970-01-01')

  const hsnRules = [
    // Pre-GST2 ghee rate (12%) — archived
    { hsnPrefix: '0405', gstRate: 12, taxability: 'taxable', effectiveFrom: PRE_GST2, effectiveTo: GST2_DATE, status: 'expired', reason: 'Pre-GST2.0 rate' },
    // GST 2.0 rates (22 Sep 2025 onwards)
    { hsnPrefix: '0405', gstRate: 5,  taxability: 'taxable', effectiveFrom: GST2_DATE, effectiveTo: null, status: 'active', reason: 'GST 2.0 rate notification Sep 2025 – ghee/butter 5%' },
    { hsnPrefix: '1507', gstRate: 5,  taxability: 'taxable', effectiveFrom: GST2_DATE, effectiveTo: null, status: 'active', reason: 'GST 2.0 – edible oils 5%' },
    { hsnPrefix: '1101', gstRate: 5,  taxability: 'taxable', effectiveFrom: GST2_DATE, effectiveTo: null, status: 'active', reason: 'GST 2.0 – pre-packaged atta 5%' },
    { hsnPrefix: '0713', gstRate: 5,  taxability: 'taxable', effectiveFrom: GST2_DATE, effectiveTo: null, status: 'active', reason: 'GST 2.0 – pre-packaged pulses 5%' },
    { hsnPrefix: '2106', gstRate: 5,  taxability: 'taxable', effectiveFrom: GST2_DATE, effectiveTo: null, status: 'active', reason: 'GST 2.0 – namkeen/snacks 5%' },
    { hsnPrefix: '0409', gstRate: 5,  taxability: 'taxable', effectiveFrom: GST2_DATE, effectiveTo: null, status: 'active', reason: 'GST 2.0 – branded honey 5%' },
  ]

  for (const r of hsnRules) {
    await db.collection('billing_tax_rate_rules').updateOne(
      { scope: 'hsn', hsnPrefix: r.hsnPrefix, effectiveFrom: r.effectiveFrom },
      { $setOnInsert: { scope: 'hsn', cessRate: 0, createdAt: new Date(), ...r } },
      { upsert: true }
    )
  }
  console.log('TaxRateRules seeded')

  // ── ComplianceParams (§13.5) ──────────────────────────────
  const EPOCH = new Date('2024-01-01')
  const params: Array<{ key: string; value: number | string | boolean; unit: string; reason: string }> = [
    { key: 'b2clThreshold',             value: 10_000_000,     unit: 'paise',   reason: 'Rs 1 lakh, effective 1 Aug 2024 (Notif 12/2024)' },
    { key: 'unregisteredDetailsLimit',  value: 5_000_000,      unit: 'paise',   reason: 'Rs 50,000 — Rule 46 CGST Rules' },
    { key: 'ewayBillThreshold',         value: 5_000_000,      unit: 'paise',   reason: 'Rs 50,000 inter-state — VERIFY intra-state CG' },
    { key: 'einvoiceAatoLimit',         value: 5_000_000_000,  unit: 'paise',   reason: 'Rs 5 crore AATO' },
    { key: 'cashReceiptLimit269ST',     value: 20_000_000,     unit: 'paise',   reason: 'Rs 2 lakh — Section 269ST' },
    { key: 'cashExpenseLimit40A',       value: 1_000_000,      unit: 'paise',   reason: 'Rs 10,000 — Section 40A(3)' },
    { key: 'cashTransporterLimit40A',   value: 3_500_000,      unit: 'paise',   reason: 'Rs 35,000 — Section 40A(3) transporter' },
    { key: 'invoiceNoMaxLength',        value: 16,              unit: 'count',   reason: 'Rule 46 CGST' },
    { key: 'minHsnDigitsB2B',          value: 4,               unit: 'count',   reason: 'Turnover under Rs 5 crore, Rule 46' },
    { key: 'roundOffEnabled',          value: true,            unit: 'bool',    reason: 'Default: round to nearest rupee' },
    { key: 'lateInterestRatePct',      value: 18,              unit: 'percent', reason: 'Section 50 CGST — VERIFY current' },
    { key: 'creditNoteDeadlineMonth',  value: 11,              unit: 'count',   reason: 'November (month index 0-based) — Section 34' },
    { key: 'creditNoteDeadlineDay',    value: 30,              unit: 'count',   reason: '30 November — Section 34' },
    { key: 'gstr1DueDay',             value: 11,              unit: 'count',   reason: '11th of next month (monthly filers)' },
    { key: 'gstr3bDueDay',            value: 20,              unit: 'count',   reason: '20th of next month (monthly filers)' },
    { key: 'qrmpGstr3bDueDay',        value: 22,              unit: 'count',   reason: 'Chhattisgarh group — VERIFY' },
    { key: 'tds194QRatePct',          value: 0.1,             unit: 'percent', reason: 'Section 194Q' },
    { key: 'tds194QThreshold',        value: 5_000_000_000,   unit: 'paise',   reason: 'Rs 50 lakh — Section 194Q' },
    { key: 'defaultCreditDays',       value: 15,              unit: 'days',    reason: 'Default billing credit period' },
    { key: 'drawerVarianceRemarkAbove', value: 0,             unit: 'paise',   reason: 'Any variance needs a remark' },
  ]

  for (const p of params) {
    await db.collection('billing_compliance_params').updateOne(
      { key: p.key, effectiveFrom: EPOCH },
      { $setOnInsert: { ...p, effectiveFrom: EPOCH, effectiveTo: null, createdBy: 'seed', createdAt: new Date() } },
      { upsert: true }
    )
  }
  console.log('ComplianceParams seeded')

  await mongoose.disconnect()
  console.log('Phase 0 seed complete')
}

seed().catch(err => { console.error(err); process.exit(1) })
