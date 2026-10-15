# Billing Phase 1 — Sale Invoice Upgrade (Vyapar Parity)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/billing/new` to full Vyapar Sale screen parity — Cash/Credit toggle, FY invoice series, place-of-supply driven CGST/SGST vs IGST, Godown selector, full item grid (HSN, MRP, incl/excl tax, discount, tax columns), bill-level discount, shipping charges, round-off, payment mode, amount in words, A4 GST Tax Invoice print (Rule 46), 58/80 mm thermal receipt, and Edit/Cancel with AuditLog.

**Architecture:** Extend the existing `BillingBill` schema with new fields (keep old fields for backward compat). The existing `/billing/new/page.tsx` is decomposed into focused sub-components. Backend `createBill` is replaced by a `createBillV1` method that uses `calcLine` from Phase 0 lib. A4 and thermal are separate Next.js pages under `/billing/invoice/[id]`. Cash denomination keypad (Phase 1B) is out of scope — cash payment uses a plain amount input in Phase 1.

**Tech Stack:** NestJS (backend), Next.js 14 App Router (frontend), Mongoose, Tailwind CSS, shadcn/ui, framer-motion, Phase 0 libs (`lib/billing/gst/calc.ts`, `lib/billing/gst/validate.ts`, `lib/billing/utils/amountInWords.ts`, `lib/billing/utils/formatINR.ts`, `lib/billing/constants/stateCodes.ts`)

**Spec:** `docs/superpowers/plans/2026-10-14-billing-phase-1.md` (this file) + Section 5 of `NatureLite_Billing_Ultimate_Blueprint.pdf` (Sections 3, 4, 5, 15.5)

---

## Global Constraints

- Stack is fixed: Next.js 14 App Router, MongoDB/Mongoose, Tailwind, shadcn/ui — do not add new dependencies beyond framer-motion (already installed)
- EXTEND, do not rewrite: keep existing routes, keep existing `BillingBill` fields (`invoiceNo`, `subtotal`, `totalGst`, `grandTotal`, `amountPaid`, `amountDue`, `paymentStatus`), keep delivery-staff and order-tag flows
- All new money fields added to schema are stored in **paise (integer)** — old float fields stay for backward compat with reports/invoice pages
- Place of supply (POS): business state is Chhattisgarh = `22`. If POS state === `'22'` → CGST + SGST (half each). Else → IGST at full rate.
- Invoice number: auto from `BillingCounter` (`{docType:'sale', fyLabel:'2026-27', prefix:'NLF-26-27/'}`, atomic `$inc seq`), editable but validated by `validateInvoiceNo` — max 16 chars, regex `^[A-Za-z0-9/-]{1,16}$`
- GST rates come from the item's `gstRate` field (seeded in Phase 0 via TaxRateRule mirror). For Phase 1, read `product.gstRate` directly — the `resolveRate` function is not yet wired to the item search; that's Phase 8.
- `calcLine` from `frontend/src/lib/billing/gst/calc.ts` is the single source of truth for per-line tax math. Backend must recompute using the same algorithm — never trust frontend-sent tax amounts.
- Phase 1B (denomination keypad, shift sessions) is out of scope here. Cash payment uses a plain rupee input.
- F2/F8/F9/Esc shortcuts must continue to work. Do not break existing keyboard handler.
- Existing pages (`/billing/reports`, `/billing/dues`, `/billing/gstr1`, `/billing/invoice/[id]`) must continue to work with old bill data after schema extension.
- AuditLog writes on every create/cancel/edit using the existing `AuditLog` schema at `backend/src/modules/billing/schemas/audit-log.schema.ts`.

## Review Focus

1. **CGST/SGST vs IGST split on place-of-supply change**: when a user switches the State of Supply dropdown mid-bill, the tax must recompute live — a stale intra/inter flag leaves wrong tax on saved bills.
2. **Invoice number uniqueness**: two cashiers hitting Save simultaneously must never get the same `invoiceNo` — the `findOneAndUpdate($inc)` must be done inside the bill-save transaction, not in a separate pre-save step.
3. **Bill-level discount proportional allocation**: `allocateBillDiscount` must be called before `calcLine` for each row, not after — allocating after means tax is computed on pre-discount taxable, which is wrong per Section 3.4/T13.
4. **Round-off range**: `applyRoundOff` only returns valid values when grand total before round-off is used as input. Passing the already-rounded total yields `roundOff = 0` always.
5. **Backward compat on invoice print**: old bills (pre-Phase-1) have no `cgstPaise`/`sgstPaise`/`igstPaise` fields — the invoice page must render gracefully when these are `undefined`, falling back to `totalGst / 2` for display.

---

## File Map

### Backend — new / modified

| File | Action | Responsibility |
|---|---|---|
| `backend/src/modules/billing/schemas/billing-bill.schema.ts` | Modify | Add new Phase 1 fields (paise, discount, charges, POS, payment mode) |
| `backend/src/modules/billing/billing.service.ts` | Modify | Add `createBillV1`, `cancelBill`, `editBill`, `getGodowns`, write AuditLog |
| `backend/src/modules/billing/billing.controller.ts` | Modify | Add `POST /billing/bills/v1`, `GET /billing/godowns`, `PATCH /billing/bills/:id/cancel`, `PATCH /billing/bills/:id/edit` |
| `backend/src/modules/billing/billing.module.ts` | Modify | Register Godown model |
| `backend/src/modules/billing/dto/create-bill-v1.dto.ts` | Create | Typed DTO for Phase 1 bill creation |

### Frontend — new components

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/app/billing/new/types.ts` | Create | `LineItem`, `BillCharge`, `BillState` TypeScript types |
| `frontend/src/app/billing/new/useBillCalc.ts` | Create | Pure hook: given line items + discount + charges, returns all totals (calls `calcLine`, `allocateBillDiscount`, `applyRoundOff`) |
| `frontend/src/app/billing/new/components/BillHeader.tsx` | Create | Cash/Credit toggle, InvoiceNo, Date, Time, Godown, Addresses, POS dropdown, TaxChip |
| `frontend/src/app/billing/new/components/ItemGrid.tsx` | Create | Full 11-column item table with per-row calc |
| `frontend/src/app/billing/new/components/BillFooter.tsx` | Create | Bill-discount, charges, round-off, payment mode, amount-in-words, Terms |
| `frontend/src/app/billing/new/components/SummaryPanel.tsx` | Create | Right panel: totals with CountUp, GST split table, save/print buttons |

### Frontend — modified

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/app/billing/new/page.tsx` | Modify | Thin orchestrator: combines sub-components, keyboard shortcuts, save mutation |
| `frontend/src/app/billing/invoice/[id]/page.tsx` | Modify | Full A4 GST Tax Invoice (Rule 46), thermal toggle, edit/cancel buttons |
| `frontend/src/lib/api.ts` | Modify | Add `createBillingBillV1`, `getBillingGodowns`, `cancelBillingBill`, `editBillingBill` |

---

## Task 1: Backend Schema Extension

**Files:**
- Modify: `backend/src/modules/billing/schemas/billing-bill.schema.ts`

**Interfaces produced:**
```typescript
// New fields on BillLineItem (all paise unless noted)
interface BillLineItemV1 {
  productId: Types.ObjectId;
  name: string;
  sku: string;
  hsnCode: string;               // 4-8 digits
  mrp: number;                   // rupees (display only)
  qty: number;
  unit: string;                  // 'KGS' | 'LTR' | 'NOS' | 'PCS' | 'BOX' etc
  rate: number;                  // rupees, price per unit as entered
  priceInclTax: boolean;         // true = MRP-inclusive
  discountPct: number;           // 0-100
  discountAmt: number;           // paise
  taxable: number;               // paise
  gstRate: number;               // total rate e.g. 5
  cgst: number;                  // paise
  sgst: number;                  // paise
  igst: number;                  // paise
  total: number;                 // paise
  // keep old float fields for backward compat (no required, no default):
  // unitPrice, taxableAmount, gstAmount (old rupee floats from pre-Phase-1)
}

// New top-level fields on BillingBill
interface BillingBillV1Fields {
  paymentTerm: 'cash' | 'credit';          // default 'credit'
  invoiceDate: Date;                        // bill date (not createdAt)
  placeOfSupply: string;                    // GST state code e.g. '22'
  isInterState: boolean;                   // POS !== '22'
  godownId?: string;
  shippingAddress?: string;
  sameAsBilling: boolean;
  paymentMode: 'cash' | 'upi' | 'card' | 'bank' | 'cheque' | 'credit';
  billDiscountPct: number;
  billDiscountAmtPaise: number;
  charges: Array<{ label: string; amtPaise: number }>;
  roundOffPaise: number;                   // signed, range -50 to +50 paise
  cgstTotalPaise: number;
  sgstTotalPaise: number;
  igstTotalPaise: number;
  grandTotalPaise: number;
  amountPaidPaise: number;
  amountDuePaise: number;
  gstr1Section: 'B2B' | 'B2CL' | 'B2CS' | 'EXEMPT' | 'NONE';
  terms?: string;
  cancelReason?: string;
}
```

- [ ] **Step 1.1: Add new line item fields to schema**

In `billing-bill.schema.ts`, extend the `items` array subdocument with new Phase 1 fields. Keep all existing fields. Add:

```typescript
// Inside the items array definition, after the existing fields:
mrp: { type: Number, default: 0 },
unit: { type: String, default: 'NOS' },
rate: { type: Number, default: 0 },           // rupees, as entered
priceInclTax: { type: Boolean, default: true },
discountPct: { type: Number, default: 0 },
discountAmt: { type: Number, default: 0 },    // paise
taxable: { type: Number, default: 0 },        // paise
cgst: { type: Number, default: 0 },           // paise
sgst: { type: Number, default: 0 },           // paise
igst: { type: Number, default: 0 },           // paise
```

Also update `BillLineItem` interface to include these.

- [ ] **Step 1.2: Add new top-level fields to BillingBill class**

Add as `@Prop` after `deliveryUserName`:

```typescript
@Prop({ default: 'credit' }) paymentTerm: string;
@Prop() invoiceDate?: Date;
@Prop({ default: '22' }) placeOfSupply: string;
@Prop({ default: false }) isInterState: boolean;
@Prop() godownId?: string;
@Prop() shippingAddress?: string;
@Prop({ default: true }) sameAsBilling: boolean;
@Prop({ default: 'credit' }) paymentMode: string;
@Prop({ default: 0 }) billDiscountPct: number;
@Prop({ default: 0 }) billDiscountAmtPaise: number;
@Prop({ type: [{ label: String, amtPaise: Number }], default: [] }) charges: Array<{ label: string; amtPaise: number }>;
@Prop({ default: 0 }) roundOffPaise: number;
@Prop({ default: 0 }) cgstTotalPaise: number;
@Prop({ default: 0 }) sgstTotalPaise: number;
@Prop({ default: 0 }) igstTotalPaise: number;
@Prop({ default: 0 }) grandTotalPaise: number;
@Prop({ default: 0 }) amountPaidPaise: number;
@Prop({ default: 0 }) amountDuePaise: number;
@Prop({ default: 'B2CS' }) gstr1Section: string;
@Prop() terms?: string;
@Prop() cancelReason?: string;
```

- [ ] **Step 1.3: Verify NestJS restarts without schema error**

Run `cd backend && npm run start:dev` and confirm no Mongoose validation errors. Existing bills load fine because all new fields have defaults.

---

## Task 2: Backend — Godowns Endpoint + Counter + createBillV1

**Files:**
- Modify: `backend/src/modules/billing/billing.service.ts`
- Modify: `backend/src/modules/billing/billing.controller.ts`
- Modify: `backend/src/modules/billing/billing.module.ts`
- Create: `backend/src/modules/billing/dto/create-bill-v1.dto.ts`

**Interfaces consumed:**
- `BillingBill` (Task 1)
- `Godown` schema at `backend/src/modules/billing/schemas/godown.schema.ts`
- `BillingCounter` schema at `backend/src/modules/billing/schemas/billing-counter.schema.ts`
- `AuditLog` schema at `backend/src/modules/billing/schemas/audit-log.schema.ts`

**Interfaces produced:**
```typescript
// GET /billing/godowns → GodownDto[]
interface GodownDto { _id: string; name: string; code: string; isDefault: boolean; }

// POST /billing/bills/v1 → BillingBillDocument
// Body shape (CreateBillV1Dto):
interface CreateBillV1Dto {
  paymentTerm: 'cash' | 'credit';
  invoiceDate: string;            // ISO date
  invoiceNo?: string;             // if blank, auto-generated
  placeOfSupply: string;          // GST state code
  godownId?: string;
  customerId: string;
  billingAddress?: string;
  shippingAddress?: string;
  sameAsBilling: boolean;
  orderTag: string;
  paymentMode: 'cash' | 'upi' | 'card' | 'bank' | 'cheque' | 'credit';
  items: Array<{
    productId: string;
    name: string;
    sku: string;
    hsnCode: string;
    mrp: number;
    qty: number;
    unit: string;
    rate: number;                 // rupees as entered by user
    priceInclTax: boolean;
    discountPct: number;
    gstRate: number;
  }>;
  billDiscountPct: number;
  charges: Array<{ label: string; amtRupees: number }>;
  roundOffEnabled: boolean;
  amountPaidRupees: number;
  terms?: string;
  notes?: string;
  deliveryUserId?: string;
  deliveryUserName?: string;
}
```

- [ ] **Step 2.1: Add Godown model to BillingModule**

In `billing.module.ts`, import the Godown schema and add to `MongooseModule.forFeature`:

```typescript
import { Godown, GodownSchema } from './schemas/godown.schema';
// inside forFeature array:
{ name: Godown.name, schema: GodownSchema },
```

Also add AuditLog (billing-specific) if not already registered:
```typescript
import { BillingAuditLog, BillingAuditLogSchema } from './schemas/audit-log.schema';
{ name: BillingAuditLog.name, schema: BillingAuditLogSchema },
```

Inject both in `BillingService` constructor.

- [ ] **Step 2.2: Add `getGodowns` service method**

```typescript
async getGodowns(): Promise<GodownDto[]> {
  const docs = await this.godownModel.find().sort({ isDefault: -1, name: 1 }).lean();
  return docs.map(d => ({ _id: d._id.toString(), name: d.name, code: d.code, isDefault: !!d.isDefault }));
}
```

Add `GET /billing/godowns` in controller:
```typescript
@Get('godowns')
getGodowns() { return this.billingService.getGodowns(); }
```

- [ ] **Step 2.3: Add `nextInvoiceNo` helper**

In `billing.service.ts`:

```typescript
private async nextInvoiceNo(fyLabel = '2026-27', prefix = 'NLF-26-27/'): Promise<string> {
  const doc = await this.counterModel.findOneAndUpdate(
    { key: `sale-${fyLabel}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  const no = `${prefix}${doc.seq}`;
  if (!validateInvoiceNo(no)) throw new BadRequestException(`Generated invoice no too long: ${no}`);
  return no;
}
```

Import `validateInvoiceNo` from the compiled frontend lib — copy the pure function to backend:

Create `backend/src/modules/billing/billing-validate.ts`:
```typescript
export function validateInvoiceNo(no: string): boolean {
  return /^[A-Za-z0-9/-]{1,16}$/.test(no);
}
```

- [ ] **Step 2.4: Add `createBillV1` service method**

This is the core of Phase 1. The method:
1. Validates invoiceNo (generate if blank)
2. Resolves customer snapshot
3. Determines `isInterState` (placeOfSupply !== '22')
4. For each line item, converts rupees to paise, computes `calcLine` equivalent in pure JS
5. Applies bill-level discount via `allocateBillDiscount`
6. Applies charges
7. Applies round-off
8. Computes GSTR-1 section
9. Saves bill
10. Writes AuditLog

```typescript
async createBillV1(dto: CreateBillV1Dto, createdBy: string, ip: string): Promise<BillingBillDocument> {
  // 1. Invoice number
  const invoiceNo = dto.invoiceNo?.trim()
    ? (validateInvoiceNo(dto.invoiceNo) ? dto.invoiceNo : (() => { throw new BadRequestException('Invoice number must be 1-16 chars, letters/digits/hyphen/slash only') })())
    : await this.nextInvoiceNo();

  // Uniqueness check
  const existing = await this.billModel.findOne({ invoiceNo }).lean();
  if (existing) throw new ConflictException(`Invoice number ${invoiceNo} already exists`);

  // 2. Customer snapshot
  const customer = await this.userModel.findById(dto.customerId).lean();
  if (!customer) throw new NotFoundException('Customer not found');

  // 3. Inter-state flag
  const isInterState = dto.placeOfSupply !== '22';

  // 4. Per-line calc (all in paise)
  const rupeesToPaise = (r: number) => Math.round(r * 100);
  
  // Compute pre-discount taxable per line (needed for bill-discount allocation)
  const preBillDisc = dto.items.map(item => {
    const ratePaise = rupeesToPaise(item.rate);
    const gross = ratePaise * item.qty;
    const discAmt = Math.round(gross * item.discountPct / 100);
    const afterDisc = gross - discAmt;
    const taxable = item.priceInclTax
      ? Math.round(afterDisc * 100 / (100 + item.gstRate))
      : afterDisc;
    return { taxable, ...item };
  });

  // Apply bill-level discount allocation
  const totalTaxable = preBillDisc.reduce((s, l) => s + l.taxable, 0);
  const billDiscAmt = dto.billDiscountPct > 0
    ? Math.round(totalTaxable * dto.billDiscountPct / 100)
    : 0;

  const billDiscAlloc = totalTaxable > 0 && billDiscAmt > 0
    ? preBillDisc.map(l => Math.round(billDiscAmt * l.taxable / totalTaxable))
    : preBillDisc.map(() => 0);

  const lines = dto.items.map((item, i) => {
    const ratePaise = rupeesToPaise(item.rate);
    const gross = ratePaise * item.qty;
    const lineDiscAmt = Math.round(gross * item.discountPct / 100);
    const afterLineDisc = gross - lineDiscAmt;
    const taxable = item.priceInclTax
      ? Math.round(afterLineDisc * 100 / (100 + item.gstRate))
      : afterLineDisc;
    const taxableAfterBillDisc = taxable - billDiscAlloc[i];
    const taxAmt = Math.round(taxableAfterBillDisc * item.gstRate / 100);
    const cgst = isInterState ? 0 : Math.floor(taxAmt / 2);
    const sgst = isInterState ? 0 : taxAmt - cgst;  // odd paisa goes to sgst
    const igst = isInterState ? taxAmt : 0;
    const total = taxableAfterBillDisc + taxAmt;

    return {
      productId: new Types.ObjectId(item.productId),
      name: item.name,
      sku: item.sku,
      hsnCode: item.hsnCode,
      mrp: item.mrp,
      qty: item.qty,
      unit: item.unit,
      rate: item.rate,
      priceInclTax: item.priceInclTax,
      discountPct: item.discountPct,
      discountAmt: lineDiscAmt,
      taxable: taxableAfterBillDisc,
      gstRate: item.gstRate,
      cgst,
      sgst,
      igst,
      total,
      // backward compat float fields:
      unitPrice: item.rate,
      taxableAmount: +(taxableAfterBillDisc / 100).toFixed(2),
      gstAmount: +(taxAmt / 100).toFixed(2),
    };
  });

  // 5. Charges
  const chargesPaise = (dto.charges ?? []).map(c => ({
    label: c.label,
    amtPaise: rupeesToPaise(c.amtRupees),
  }));
  const chargesTotalPaise = chargesPaise.reduce((s, c) => s + c.amtPaise, 0);

  // 6. Totals
  const cgstTotalPaise = lines.reduce((s, l) => s + l.cgst, 0);
  const sgstTotalPaise = lines.reduce((s, l) => s + l.sgst, 0);
  const igstTotalPaise = lines.reduce((s, l) => s + l.igst, 0);
  const taxableTotalPaise = lines.reduce((s, l) => s + l.taxable, 0);
  const grandBeforeRound = taxableTotalPaise + cgstTotalPaise + sgstTotalPaise + igstTotalPaise + chargesTotalPaise;

  // 7. Round-off (to nearest 100 paise = 1 rupee)
  let roundOffPaise = 0;
  let grandTotalPaise = grandBeforeRound;
  if (dto.roundOffEnabled) {
    const rounded = Math.round(grandBeforeRound / 100) * 100;
    roundOffPaise = rounded - grandBeforeRound;   // can be negative
    grandTotalPaise = rounded;
  }

  const amountPaidPaise = rupeesToPaise(dto.amountPaidRupees ?? 0);
  const amountDuePaise = Math.max(0, grandTotalPaise - amountPaidPaise);
  const paymentStatus: PaymentStatus = amountDuePaise <= 0 ? 'paid' : amountPaidPaise > 0 ? 'partial' : 'unpaid';

  // 8. GSTR-1 classification
  const customerGstin = customer.gstNo ?? '';
  const hasValidGstin = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(customerGstin);
  const B2CL_THRESHOLD = 10_000_000; // paise = Rs 1 lakh
  let gstr1Section: string;
  if (hasValidGstin) {
    gstr1Section = 'B2B';
  } else if (isInterState && grandTotalPaise > B2CL_THRESHOLD) {
    gstr1Section = 'B2CL';
  } else {
    gstr1Section = 'B2CS';
  }

  // 9. Save
  const bill = await this.billModel.create({
    invoiceNo,
    invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
    customerId: customer._id,
    customerName: customer.name ?? '',
    customerPhone: customer.phone ?? '',
    customerGstNo: customer.gstNo,
    billingAddress: dto.billingAddress,
    shippingAddress: dto.sameAsBilling ? dto.billingAddress : dto.shippingAddress,
    sameAsBilling: dto.sameAsBilling,
    customerTags: customer.tags ?? [],
    orderTag: dto.orderTag,
    deliveryUserId: dto.deliveryUserId,
    deliveryUserName: dto.deliveryUserName,
    godownId: dto.godownId,
    placeOfSupply: dto.placeOfSupply,
    isInterState,
    paymentTerm: dto.paymentTerm ?? 'credit',
    paymentMode: dto.paymentMode ?? 'credit',
    items: lines,
    billDiscountPct: dto.billDiscountPct ?? 0,
    billDiscountAmtPaise: billDiscAmt,
    charges: chargesPaise,
    roundOffPaise,
    cgstTotalPaise,
    sgstTotalPaise,
    igstTotalPaise,
    grandTotalPaise,
    amountPaidPaise,
    amountDuePaise,
    gstr1Section,
    // backward compat float fields:
    subtotal: +(taxableTotalPaise / 100).toFixed(2),
    totalGst: +((cgstTotalPaise + sgstTotalPaise + igstTotalPaise) / 100).toFixed(2),
    grandTotal: +(grandTotalPaise / 100).toFixed(2),
    amountPaid: +(amountPaidPaise / 100).toFixed(2),
    amountDue: +(amountDuePaise / 100).toFixed(2),
    paymentStatus,
    terms: dto.terms,
    notes: dto.notes,
    status: 'active',
  });

  // 10. AuditLog
  await this.auditLogModel.create({
    collection: 'BillingBill',
    docId: bill._id,
    action: 'create',
    before: null,
    after: { invoiceNo, grandTotalPaise, paymentStatus },
    userId: createdBy,
    ip,
    at: new Date(),
  });

  // 11. CRM trigger (keep existing behavior)
  await this.crmEngine.onNewBill({ customerId: dto.customerId, total: grandTotalPaise / 100 }).catch(() => {});

  return bill;
}
```

- [ ] **Step 2.5: Add `cancelBill` service method**

```typescript
async cancelBill(id: string, reason: string, userId: string, ip: string): Promise<void> {
  const bill = await this.billModel.findById(id).lean();
  if (!bill) throw new NotFoundException('Bill not found');
  if (bill.status === 'cancelled') throw new BadRequestException('Already cancelled');
  if (!reason?.trim()) throw new BadRequestException('Cancel reason required');

  const before = { status: bill.status, cancelReason: bill.cancelReason };
  await this.billModel.updateOne({ _id: id }, { $set: { status: 'cancelled', cancelReason: reason.trim() } });
  await this.auditLogModel.create({
    collection: 'BillingBill', docId: bill._id, action: 'cancel',
    before, after: { status: 'cancelled', cancelReason: reason.trim() },
    userId, ip, at: new Date(),
  });
}
```

- [ ] **Step 2.6: Add controller routes**

```typescript
@Post('bills/v1')
createBillV1(
  @Body() body: CreateBillV1Dto,
  @Request() req: any,
) {
  return this.billingService.createBillV1(body, req.user?._id?.toString() ?? 'system', req.ip ?? '');
}

@Patch('bills/:id/cancel')
cancelBill(
  @Param('id') id: string,
  @Body('reason') reason: string,
  @Request() req: any,
) {
  return this.billingService.cancelBill(id, reason, req.user?._id?.toString() ?? 'system', req.ip ?? '');
}
```

- [ ] **Step 2.7: Test via curl**

```bash
# Get godowns
curl -H "Authorization: Bearer <token>" http://localhost:3001/billing/godowns

# Create bill v1 (minimal)
curl -X POST http://localhost:3001/billing/bills/v1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentTerm":"credit","invoiceDate":"2026-10-14",
    "placeOfSupply":"22","customerId":"<id>","orderTag":"B2B",
    "paymentMode":"credit","sameAsBilling":true,
    "items":[{"productId":"<id>","name":"Ghee","sku":"G1","hsnCode":"04059020","mrp":950,"qty":1,"unit":"KGS","rate":900,"priceInclTax":true,"discountPct":0,"gstRate":5}],
    "billDiscountPct":0,"charges":[],"roundOffEnabled":true,"amountPaidRupees":0
  }'
```

Expected: bill saved with `cgstTotalPaise=2143`, `sgstTotalPaise=2143`, `igstTotalPaise=0`, `grandTotalPaise=90000`.

---

## Task 3: Frontend Types + `useBillCalc` Hook

**Files:**
- Create: `frontend/src/app/billing/new/types.ts`
- Create: `frontend/src/app/billing/new/useBillCalc.ts`

**Interfaces produced:**
```typescript
// types.ts
export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank' | 'cheque' | 'credit';

export interface LineItem {
  _key: string;               // uuid for React key
  productId: string;
  name: string;
  sku: string;
  hsnCode: string;
  mrp: number;                // rupees
  qty: number;
  unit: string;
  rate: number;               // rupees as entered
  priceInclTax: boolean;
  discountPct: number;
  gstRate: number;
  // computed (paise):
  discountAmt: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface BillCharge { label: string; amtRupees: number; }

export interface BillTotals {
  taxablePaise: number;
  billDiscAmtPaise: number;
  chargesTotalPaise: number;
  cgstTotalPaise: number;
  sgstTotalPaise: number;
  igstTotalPaise: number;
  grandBeforePaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
  amountDuePaise: number;
}
```

- [ ] **Step 3.1: Create `types.ts`** with the interfaces above.

- [ ] **Step 3.2: Create `useBillCalc.ts`**

```typescript
import { useMemo } from 'react';
import { LineItem, BillCharge, BillTotals } from './types';

function calcLine(
  item: Pick<LineItem, 'rate' | 'qty' | 'priceInclTax' | 'discountPct' | 'gstRate'>,
  billDiscAllocPaise: number,
  isInterState: boolean,
): Pick<LineItem, 'discountAmt' | 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total'> {
  const ratePaise = Math.round(item.rate * 100);
  const gross = ratePaise * item.qty;
  const lineDiscAmt = Math.round(gross * item.discountPct / 100);
  const afterLineDisc = gross - lineDiscAmt;
  const taxable = item.priceInclTax
    ? Math.round(afterLineDisc * 100 / (100 + item.gstRate))
    : afterLineDisc;
  const taxableAfterBillDisc = Math.max(0, taxable - billDiscAllocPaise);
  const taxAmt = Math.round(taxableAfterBillDisc * item.gstRate / 100);
  const cgst = isInterState ? 0 : Math.floor(taxAmt / 2);
  const sgst = isInterState ? 0 : taxAmt - cgst;
  const igst = isInterState ? taxAmt : 0;
  return {
    discountAmt: lineDiscAmt,
    taxable: taxableAfterBillDisc,
    cgst, sgst, igst,
    total: taxableAfterBillDisc + taxAmt,
  };
}

export function useBillCalc(
  items: LineItem[],
  billDiscountPct: number,
  charges: BillCharge[],
  roundOffEnabled: boolean,
  isInterState: boolean,
  amountPaidRupees: number,
): { lines: LineItem[]; totals: BillTotals } {
  return useMemo(() => {
    // Pre-discount taxables for proportional allocation
    const preTaxables = items.map(item => {
      const ratePaise = Math.round(item.rate * 100);
      const gross = ratePaise * item.qty;
      const lineDiscAmt = Math.round(gross * item.discountPct / 100);
      const afterLineDisc = gross - lineDiscAmt;
      return item.priceInclTax
        ? Math.round(afterLineDisc * 100 / (100 + item.gstRate))
        : afterLineDisc;
    });
    const totalPreTaxable = preTaxables.reduce((s, t) => s + t, 0);
    const billDiscAmtPaise = Math.round(totalPreTaxable * billDiscountPct / 100);

    const billDiscAlloc = totalPreTaxable > 0 && billDiscAmtPaise > 0
      ? preTaxables.map(t => Math.round(billDiscAmtPaise * t / totalPreTaxable))
      : preTaxables.map(() => 0);

    const lines: LineItem[] = items.map((item, i) => ({
      ...item,
      ...calcLine(item, billDiscAlloc[i], isInterState),
    }));

    const taxablePaise = lines.reduce((s, l) => s + l.taxable, 0);
    const cgstTotalPaise = lines.reduce((s, l) => s + l.cgst, 0);
    const sgstTotalPaise = lines.reduce((s, l) => s + l.sgst, 0);
    const igstTotalPaise = lines.reduce((s, l) => s + l.igst, 0);
    const chargesTotalPaise = charges.reduce((s, c) => s + Math.round(c.amtRupees * 100), 0);
    const grandBeforePaise = taxablePaise + cgstTotalPaise + sgstTotalPaise + igstTotalPaise + chargesTotalPaise;

    let roundOffPaise = 0;
    let grandTotalPaise = grandBeforePaise;
    if (roundOffEnabled) {
      const rounded = Math.round(grandBeforePaise / 100) * 100;
      roundOffPaise = rounded - grandBeforePaise;
      grandTotalPaise = rounded;
    }

    const amountPaidPaise = Math.round(amountPaidRupees * 100);
    const amountDuePaise = Math.max(0, grandTotalPaise - amountPaidPaise);

    return {
      lines,
      totals: { taxablePaise, billDiscAmtPaise, chargesTotalPaise, cgstTotalPaise, sgstTotalPaise, igstTotalPaise, grandBeforePaise, roundOffPaise, grandTotalPaise, amountDuePaise },
    };
  }, [items, billDiscountPct, charges, roundOffEnabled, isInterState, amountPaidRupees]);
}
```

---

## Task 4: `BillHeader` Component

**Files:**
- Create: `frontend/src/app/billing/new/components/BillHeader.tsx`

**Consumes:** `stateCodes` from `frontend/src/lib/billing/constants/stateCodes.ts`, Godown API, existing `CustomerSearch` component logic

**Props:**
```typescript
interface BillHeaderProps {
  paymentTerm: 'cash' | 'credit';
  onPaymentTermChange: (v: 'cash' | 'credit') => void;
  invoiceNo: string;
  onInvoiceNoChange: (v: string) => void;
  invoiceDate: string;          // 'YYYY-MM-DD'
  onInvoiceDateChange: (v: string) => void;
  invoiceTime: string;          // 'HH:MM'
  onInvoiceTimeChange: (v: string) => void;
  godownId: string;
  onGodownChange: (id: string) => void;
  godowns: GodownDto[];
  customer: any | null;
  onCustomerSelect: (c: any) => void;
  onCustomerClear: () => void;
  billingAddress: string;
  onBillingAddressChange: (v: string) => void;
  shippingAddress: string;
  onShippingAddressChange: (v: string) => void;
  sameAsBilling: boolean;
  onSameAsBillingChange: (v: boolean) => void;
  placeOfSupply: string;        // GST state code
  onPlaceOfSupplyChange: (v: string) => void;
  isInterState: boolean;        // derived, display only
  orderTag: string;
  onOrderTagChange: (v: string) => void;
}
```

- [ ] **Step 4.1: Create `BillHeader.tsx`**

The header has these sections stacked vertically:

**Row 1 — Cash/Credit toggle + Invoice meta**
```tsx
<div className="flex items-center gap-3 flex-wrap">
  {/* Cash/Credit toggle */}
  <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
    {(['credit','cash'] as const).map(t => (
      <button key={t}
        onClick={() => onPaymentTermChange(t)}
        className={cn('px-3 py-1.5 font-medium capitalize transition-colors',
          paymentTerm === t ? 'bg-[#2d7a4f] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
        )}>
        {t === 'credit' ? 'Credit' : 'Cash Sale'}
      </button>
    ))}
  </div>

  {/* Invoice No */}
  <div className="flex items-center gap-1.5">
    <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Invoice No</label>
    <input value={invoiceNo} onChange={e => onInvoiceNoChange(e.target.value)}
      className="border border-gray-200 rounded px-2 py-1 text-xs font-mono w-36 focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
      placeholder="Auto"
    />
  </div>

  {/* Invoice Date */}
  <div className="flex items-center gap-1.5">
    <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Date</label>
    <input type="date" value={invoiceDate} onChange={e => onInvoiceDateChange(e.target.value)}
      className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
    />
    <input type="time" value={invoiceTime} onChange={e => onInvoiceTimeChange(e.target.value)}
      className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none w-24"
    />
  </div>

  {/* Godown */}
  <div className="flex items-center gap-1.5">
    <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Godown</label>
    <select value={godownId} onChange={e => onGodownChange(e.target.value)}
      className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
      <option value="">— Select —</option>
      {godowns.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
    </select>
  </div>
</div>
```

**Row 2 — State of Supply + Tax chip**
```tsx
<div className="flex items-center gap-3">
  <div className="flex items-center gap-1.5">
    <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">State of Supply</label>
    <select value={placeOfSupply} onChange={e => onPlaceOfSupplyChange(e.target.value)}
      className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
      {STATE_CODES.map(s => (
        <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
      ))}
    </select>
  </div>
  {/* Tax chip — animate on change */}
  <AnimatePresence mode="wait">
    <motion.span key={placeOfSupply}
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className={cn('text-[11px] px-2.5 py-1 rounded-full font-medium',
        isInterState ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
      )}>
      {isInterState
        ? `Inter-state → IGST`
        : `Intra-state → CGST + SGST`}
    </motion.span>
  </AnimatePresence>
</div>
```

**Row 3 — Customer (keep existing CustomerSearch)**
Keep the existing CustomerSearch and customer-selected card from `page.tsx` — just move them here.

**Row 4 — Billing/Shipping address**
```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold block mb-1">Billing Address</label>
    <select value={billingAddress} onChange={e => onBillingAddressChange(e.target.value)}
      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
      <option value="">— Pick address —</option>
      {customer?.addresses?.map((a: any, i: number) => (
        <option key={i} value={a.line}>{a.label}: {a.line}</option>
      ))}
    </select>
  </div>
  <div>
    <div className="flex items-center gap-2 mb-1">
      <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Shipping Address</label>
      <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
        <input type="checkbox" checked={sameAsBilling} onChange={e => onSameAsBillingChange(e.target.checked)} className="h-3 w-3" />
        Same as billing
      </label>
    </div>
    {sameAsBilling ? (
      <div className="text-xs text-gray-400 px-2 py-1.5 border border-dashed border-gray-200 rounded">{billingAddress || '—'}</div>
    ) : (
      <input value={shippingAddress} onChange={e => onShippingAddressChange(e.target.value)}
        placeholder="Type shipping address…"
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
      />
    )}
  </div>
</div>
```

**Row 5 — Order tag chips (keep existing)**

- [ ] **Step 4.2: Import STATE_CODES** from `frontend/src/lib/billing/constants/stateCodes.ts`. The file exports an array of `{ code: string; name: string }`. Use it to populate the State of Supply dropdown.

---

## Task 5: `ItemGrid` Component

**Files:**
- Create: `frontend/src/app/billing/new/components/ItemGrid.tsx`

**Props:**
```typescript
interface ItemGridProps {
  lines: LineItem[];           // computed lines from useBillCalc
  rawItems: LineItem[];        // source items (for editing)
  isInterState: boolean;
  onUpdate: (idx: number, patch: Partial<Pick<LineItem,'mrp'|'qty'|'unit'|'rate'|'priceInclTax'|'discountPct'|'gstRate'|'hsnCode'>>) => void;
  onRemove: (idx: number) => void;
  onAdd: (item: Omit<LineItem, 'discountAmt'|'taxable'|'cgst'|'sgst'|'igst'|'total'>) => void;
  orderTag: string;
}
```

- [ ] **Step 5.1: Column header row**

```tsx
const COLS = ['#','Item','HSN','MRP','Qty','Unit','Price/Unit','Tax%','Disc%','Tax Amt','Amount',''];
```

Render as sticky thead. Columns for `Tax Amt` and `Amount` are right-aligned. All number cells use `tabular-nums` class.

The `Price/Unit` column header shows a toggle: `[incl. tax]` / `[excl. tax]` — clicking it toggles `priceInclTax` for ALL rows in one go (matches Vyapar global switch).

- [ ] **Step 5.2: Per-row render**

Each row shows editable inputs for `mrp`, `qty`, `unit` (select from `['KGS','LTR','NOS','PCS','BOX','PAC','BTL','GMS','MLT']`), `rate`, `discountPct`, `gstRate` (select from `[0, 5, 12, 18, 28]`), `hsnCode`. Display-only: `lines[i].total / 100` formatted with `formatINR`.

Show `Tax Amt` = `(cgst + sgst + igst) / 100` formatted.

```tsx
{lines.map((line, idx) => (
  <motion.tr key={line._key}
    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}
    className="group hover:bg-[#f7faf8]">
    <td className="px-3 py-2 text-xs text-gray-400 tabular-nums">{idx + 1}</td>
    <td className="px-2 py-2">
      <div className="font-medium text-gray-800 text-sm">{line.name}</div>
      <div className="text-[11px] text-gray-400 font-mono">{line.sku}</div>
    </td>
    <td className="px-2 py-2">
      <input value={line.hsnCode} onChange={e => onUpdate(idx, { hsnCode: e.target.value })}
        className="w-24 border border-gray-200 rounded px-1.5 py-1 text-xs font-mono focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
      />
    </td>
    <td className="px-2 py-2 text-right text-xs text-gray-400 tabular-nums">{line.mrp > 0 ? formatINR(line.mrp * 100) : '—'}</td>
    <td className="px-2 py-2">
      <input type="number" min="0.001" step="0.001" value={line.qty}
        onChange={e => onUpdate(idx, { qty: parseFloat(e.target.value) || 1 })}
        className="w-16 text-center border border-gray-200 rounded px-1.5 py-1 text-sm focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
      />
    </td>
    <td className="px-2 py-2">
      <select value={line.unit} onChange={e => onUpdate(idx, { unit: e.target.value })}
        className="border border-gray-200 rounded px-1 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
        {['KGS','LTR','NOS','PCS','BOX','PAC','BTL','GMS','MLT'].map(u => <option key={u}>{u}</option>)}
      </select>
    </td>
    <td className="px-2 py-2">
      <input type="number" min="0" step="0.5" value={line.rate}
        onChange={e => onUpdate(idx, { rate: parseFloat(e.target.value) || 0 })}
        className="w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-sm focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
      />
    </td>
    <td className="px-2 py-2">
      <select value={line.gstRate} onChange={e => onUpdate(idx, { gstRate: Number(e.target.value) })}
        className="border border-gray-200 rounded px-1 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none bg-white">
        {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
      </select>
    </td>
    <td className="px-2 py-2">
      <input type="number" min="0" max="100" step="0.5" value={line.discountPct}
        onChange={e => onUpdate(idx, { discountPct: Math.min(100, parseFloat(e.target.value) || 0) })}
        className="w-14 text-center border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
      />
    </td>
    <td className="px-2 py-2 text-right text-xs text-gray-600 tabular-nums">
      {formatINR(line.cgst + line.sgst + line.igst)}
    </td>
    <td className="px-2 py-2 text-right font-semibold text-gray-800 tabular-nums">
      {formatINR(line.total)}
    </td>
    <td className="px-2 py-2">
      <button onClick={() => onRemove(idx)}
        className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </td>
  </motion.tr>
))}
```

- [ ] **Step 5.3: Product search row**

Keep the existing `ProductSearch` component but wire it to create a `LineItem` with `_key: crypto.randomUUID()`, `unit: product.uqc ?? 'NOS'`, `mrp: product.mrp ?? 0`, `rate: resolvePrice(...)`, `priceInclTax: true`, `discountPct: 0`, `gstRate: product.gstRate ?? 5`.

The `api.searchBillingProducts` already exists. Ensure the product search returns `gstRate`, `mrp`, `uqc` from the backend. Check `billing.service.ts` → `searchProducts` method and add these fields to the projection.

- [ ] **Step 5.4: Totals row**

```tsx
<tfoot>
  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs">
    <td colSpan={4} className="px-3 py-2 text-gray-500">
      {lines.length} item{lines.length !== 1 ? 's' : ''}
    </td>
    <td className="px-2 py-2 text-center tabular-nums">
      {lines.reduce((s, l) => s + l.qty, 0).toFixed(2)}
    </td>
    <td colSpan={4} className="px-2 py-2 text-right text-gray-500 tabular-nums">
      Disc: {formatINR(lines.reduce((s, l) => s + l.discountAmt, 0))}
    </td>
    <td className="px-2 py-2 text-right tabular-nums">
      {formatINR(lines.reduce((s, l) => s + l.cgst + l.sgst + l.igst, 0))}
    </td>
    <td className="px-2 py-2 text-right tabular-nums">
      {formatINR(lines.reduce((s, l) => s + l.total, 0))}
    </td>
    <td />
  </tr>
</tfoot>
```

---

## Task 6: `BillFooter` + `SummaryPanel` Components

**Files:**
- Create: `frontend/src/app/billing/new/components/BillFooter.tsx`
- Create: `frontend/src/app/billing/new/components/SummaryPanel.tsx`

**`BillFooter` props:**
```typescript
interface BillFooterProps {
  billDiscountPct: number;
  onBillDiscountPctChange: (v: number) => void;
  charges: BillCharge[];
  onChargesChange: (c: BillCharge[]) => void;
  roundOffEnabled: boolean;
  onRoundOffEnabledChange: (v: boolean) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (v: PaymentMode) => void;
  amountPaidRupees: number;
  onAmountPaidChange: (v: number) => void;
  terms: string;
  onTermsChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
}
```

**`SummaryPanel` props:**
```typescript
interface SummaryPanelProps {
  totals: BillTotals;
  isInterState: boolean;
  lines: LineItem[];
  onSave: () => void;
  onSaveAndPrint: () => void;
  onSaveAndNew: () => void;
  isSaving: boolean;
}
```

- [ ] **Step 6.1: Bill-level discount section in `BillFooter`**

```tsx
<div className="flex items-center gap-3">
  <label className="text-xs text-gray-500 w-32 shrink-0">Bill Discount</label>
  <div className="flex items-center gap-1">
    <input type="number" min="0" max="100" step="0.5"
      value={billDiscountPct || ''}
      onChange={e => onBillDiscountPctChange(Math.min(100, parseFloat(e.target.value) || 0))}
      className="w-16 text-right border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
      placeholder="0"
    />
    <span className="text-xs text-gray-400">%</span>
  </div>
</div>
```

- [ ] **Step 6.2: Repeatable charges rows**

```tsx
<div className="space-y-1.5">
  {charges.map((c, i) => (
    <div key={i} className="flex items-center gap-2">
      <input value={c.label}
        onChange={e => { const nc = [...charges]; nc[i] = {...nc[i], label: e.target.value}; onChargesChange(nc); }}
        placeholder="Shipping / Packing…"
        className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none"
      />
      <input type="number" min="0" step="0.5" value={c.amtRupees || ''}
        onChange={e => { const nc = [...charges]; nc[i] = {...nc[i], amtRupees: parseFloat(e.target.value) || 0}; onChargesChange(nc); }}
        className="w-20 text-right border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-2 focus:ring-[#2d7a4f]/30 focus:outline-none tabular-nums"
        placeholder="0"
      />
      <button onClick={() => onChargesChange(charges.filter((_, j) => j !== i))}
        className="text-gray-300 hover:text-red-400 transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ))}
  <button onClick={() => onChargesChange([...charges, { label: '', amtRupees: 0 }])}
    className="flex items-center gap-1 text-xs text-[#2d7a4f] hover:underline">
    <Plus className="h-3 w-3" /> Add Charge
  </button>
</div>
```

- [ ] **Step 6.3: Round-off toggle**

```tsx
<label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
  <input type="checkbox" checked={roundOffEnabled}
    onChange={e => onRoundOffEnabledChange(e.target.checked)}
    className="h-3.5 w-3.5 accent-[#2d7a4f]"
  />
  Round off to nearest rupee
</label>
```

- [ ] **Step 6.4: Payment mode tabs**

```tsx
const MODES: { key: PaymentMode; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'bank', label: 'Bank' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'credit', label: 'Credit' },
];
// render as pill tabs similar to order tag chips
```

Below the tabs, if paymentMode !== 'credit': show "Amount Received" input.

- [ ] **Step 6.5: Terms and Notes textareas**

Two collapsible sections at the bottom of `BillFooter` using shadcn `Collapsible`.

- [ ] **Step 6.6: `SummaryPanel` totals section**

```tsx
// GST split table by rate (group lines by gstRate)
const gstByRate = lines.reduce((acc, l) => {
  if (l.gstRate === 0) return acc;
  const k = String(l.gstRate);
  if (!acc[k]) acc[k] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  acc[k].taxable += l.taxable;
  acc[k].cgst += l.cgst;
  acc[k].sgst += l.sgst;
  acc[k].igst += l.igst;
  return acc;
}, {} as Record<string, { taxable: number; cgst: number; sgst: number; igst: number }>);
```

Render as a compact table below the main totals using `CountUp` from `billing-motion.tsx` for each paise value.

- [ ] **Step 6.7: Amount in words line**

```tsx
import { amountInWords } from '@/lib/billing/utils/amountInWords';
// ...
<p className="text-[11px] text-gray-500 italic mt-1">
  {amountInWords(totals.grandTotalPaise)}
</p>
```

- [ ] **Step 6.8: Save buttons with animation**

```tsx
<Button
  className="w-full bg-[#2d7a4f] hover:bg-[#245f3e] text-white text-sm h-9 relative overflow-hidden"
  onClick={onSaveAndPrint}
  disabled={isSaving}
>
  <AnimatePresence mode="wait">
    {isSaving ? (
      <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
      </motion.span>
    ) : (
      <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
        <Printer className="h-4 w-4" /> Save & Print
        <kbd className="ml-auto text-[10px] bg-[#1e5436] px-1.5 py-0.5 rounded font-mono opacity-70">F9</kbd>
      </motion.span>
    )}
  </AnimatePresence>
</Button>
```

Also add "Save & New" button (variant outline, smaller).

---

## Task 7: Wire `page.tsx` + API + Save Flow

**Files:**
- Modify: `frontend/src/app/billing/new/page.tsx`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 7.1: Add API methods**

In `api.ts`, after existing billing methods:

```typescript
async getBillingGodowns(): Promise<{ _id: string; name: string; code: string; isDefault: boolean }[]> {
  const res = await this.client.get<ApiResponse<any[]>>('/billing/godowns');
  return res.data.data;
}

async createBillingBillV1(data: {
  paymentTerm: string; invoiceDate: string; invoiceNo?: string;
  placeOfSupply: string; godownId?: string; customerId: string;
  billingAddress?: string; shippingAddress?: string; sameAsBilling: boolean;
  orderTag: string; paymentMode: string;
  items: Array<{ productId: string; name: string; sku: string; hsnCode: string;
    mrp: number; qty: number; unit: string; rate: number; priceInclTax: boolean;
    discountPct: number; gstRate: number; }>;
  billDiscountPct: number;
  charges: Array<{ label: string; amtRupees: number }>;
  roundOffEnabled: boolean; amountPaidRupees: number;
  terms?: string; notes?: string;
  deliveryUserId?: string; deliveryUserName?: string;
}): Promise<any> {
  const res = await this.client.post<ApiResponse<any>>('/billing/bills/v1', data);
  return res.data.data;
}

async cancelBillingBill(id: string, reason: string): Promise<void> {
  await this.client.patch(`/billing/bills/${id}/cancel`, { reason });
}
```

- [ ] **Step 7.2: Rewrite `page.tsx` as thin orchestrator**

Keep all existing state (customer, orderTag, deliveryUserId, notes, items). Add new state:

```typescript
const [paymentTerm, setPaymentTerm] = useState<'cash'|'credit'>('credit');
const [invoiceNo, setInvoiceNo] = useState('');            // blank = auto
const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0,10));
const [invoiceTime, setInvoiceTime] = useState(() => new Date().toTimeString().slice(0,5));
const [godownId, setGodownId] = useState('');
const [placeOfSupply, setPlaceOfSupply] = useState('22'); // CG default
const [sameAsBilling, setSameAsBilling] = useState(true);
const [billingAddress, setBillingAddress] = useState('');
const [shippingAddress, setShippingAddress] = useState('');
const [billDiscountPct, setBillDiscountPct] = useState(0);
const [charges, setCharges] = useState<BillCharge[]>([]);
const [roundOffEnabled, setRoundOffEnabled] = useState(true);
const [paymentMode, setPaymentMode] = useState<PaymentMode>('credit');
const [amountPaidRupees, setAmountPaidRupees] = useState(0);
const [terms, setTerms] = useState('');
const [rawItems, setRawItems] = useState<LineItem[]>([]);
```

Query godowns on mount:
```typescript
const { data: godowns = [] } = useQuery({
  queryKey: ['billing-godowns'],
  queryFn: () => api.getBillingGodowns(),
  staleTime: 60_000,
});
// Auto-select default godown
useEffect(() => {
  const def = godowns.find(g => g.isDefault);
  if (def && !godownId) setGodownId(def._id);
}, [godowns]);
```

Derive `isInterState`:
```typescript
const isInterState = placeOfSupply !== '22';
```

Call `useBillCalc`:
```typescript
const { lines, totals } = useBillCalc(rawItems, billDiscountPct, charges, roundOffEnabled, isInterState, amountPaidRupees);
```

When customer is selected, auto-set `placeOfSupply` from customer GSTIN (chars 0-1) if valid GSTIN, else default `'22'`.

Update `saveMutation` to call `api.createBillingBillV1`:
```typescript
const saveMutation = useMutation({
  mutationFn: async (opts: { print: boolean; saveNew: boolean }) => {
    if (paymentTerm === 'credit' && !customer) throw new Error('Select a customer for credit bill');
    if (!rawItems.length) throw new Error('Add at least one item');
    if (!orderTag) throw new Error('Select an order type');
    const bill = await api.createBillingBillV1({
      paymentTerm, invoiceDate, invoiceNo: invoiceNo || undefined,
      placeOfSupply, godownId: godownId || undefined,
      customerId: customer?._id ?? 'CASH',
      billingAddress, shippingAddress: sameAsBilling ? billingAddress : shippingAddress,
      sameAsBilling, orderTag, paymentMode,
      items: rawItems.map(i => ({
        productId: i.productId, name: i.name, sku: i.sku, hsnCode: i.hsnCode,
        mrp: i.mrp, qty: i.qty, unit: i.unit, rate: i.rate,
        priceInclTax: i.priceInclTax, discountPct: i.discountPct, gstRate: i.gstRate,
      })),
      billDiscountPct, charges, roundOffEnabled, amountPaidRupees,
      terms, notes, deliveryUserId: deliveryUserId || undefined, deliveryUserName: deliveryUserName || undefined,
    });
    return { bill, ...opts };
  },
  onSuccess: ({ bill, print, saveNew }) => {
    toast({ title: `Invoice ${bill.invoiceNo} saved` });
    if (saveNew) {
      // Reset form state
      setRawItems([]); setCustomer(null); setOrderTag(''); setInvoiceNo('');
      setBillDiscountPct(0); setCharges([]); setAmountPaidRupees(0); setNotes(''); setTerms('');
      setInvoiceDate(new Date().toISOString().slice(0,10));
    } else if (print) {
      router.push(`/billing/invoice/${bill._id}?print=1`);
    } else {
      router.push(`/billing/invoice/${bill._id}`);
    }
  },
  onError: (e: any) => toast({ title: e?.message ?? e?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
});
```

Render as:
```tsx
return (
  <div className="flex flex-col min-h-full">
    {/* Page header bar - keep existing */}
    <div className="sticky top-0 z-20 ...">...</div>

    <div className="flex flex-col lg:grid lg:grid-cols-[1fr_300px] flex-1">
      <div className="flex flex-col gap-0 border-b lg:border-b-0 lg:border-r border-gray-200">
        <div className="p-4 bg-white border-b border-gray-200 space-y-3">
          <BillHeader {...headerProps} />
        </div>
        <div className="flex-1 bg-white">
          <ItemGrid lines={lines} rawItems={rawItems} isInterState={isInterState}
            onUpdate={(idx, patch) => setRawItems(prev => prev.map((it, i) => i === idx ? {...it, ...patch} : it))}
            onRemove={(idx) => setRawItems(prev => prev.filter((_, i) => i !== idx))}
            onAdd={(item) => setRawItems(prev => {
              const ex = prev.findIndex(i => i.productId === item.productId);
              if (ex >= 0) { const u = [...prev]; u[ex] = {...u[ex], qty: u[ex].qty + item.qty}; return u; }
              return [...prev, item];
            })}
            orderTag={orderTag}
          />
        </div>
        <div className="p-4 bg-white border-t border-gray-100">
          <BillFooter
            billDiscountPct={billDiscountPct} onBillDiscountPctChange={setBillDiscountPct}
            charges={charges} onChargesChange={setCharges}
            roundOffEnabled={roundOffEnabled} onRoundOffEnabledChange={setRoundOffEnabled}
            paymentMode={paymentMode} onPaymentModeChange={setPaymentMode}
            amountPaidRupees={amountPaidRupees} onAmountPaidChange={setAmountPaidRupees}
            terms={terms} onTermsChange={setTerms}
            notes={notes} onNotesChange={setNotes}
          />
        </div>
      </div>
      <SummaryPanel
        totals={totals} isInterState={isInterState} lines={lines}
        onSave={() => saveMutation.mutate({ print: false, saveNew: false })}
        onSaveAndPrint={() => saveMutation.mutate({ print: true, saveNew: false })}
        onSaveAndNew={() => saveMutation.mutate({ print: false, saveNew: true })}
        isSaving={saveMutation.isPending}
      />
    </div>
  </div>
);
```

- [ ] **Step 7.3: Keep keyboard shortcuts**

Update keyboard handler to trigger new save signature:
```typescript
if (e.key === 'F8') { e.preventDefault(); saveMutation.mutate({ print: false, saveNew: false }); }
if (e.key === 'F9') { e.preventDefault(); saveMutation.mutate({ print: true, saveNew: false }); }
```

---

## Task 8: A4 Invoice Print Page (Rule 46)

**Files:**
- Modify: `frontend/src/app/billing/invoice/[id]/page.tsx`

The existing invoice page shows bill details. Replace it with a full GST Tax Invoice layout that prints correctly with `window.print()`.

- [ ] **Step 8.1: Screen + print styles**

At the top of the page, add a `<style>` tag or use Tailwind print utilities:
```
@media print {
  .no-print { display: none !important; }
  @page { size: A4; margin: 10mm; }
  body { -webkit-print-color-adjust: exact; }
}
```

Wrap the invoice in a `max-w-[210mm]` container so it previews correctly on screen.

- [ ] **Step 8.2: Header section (business details)**

```tsx
<div className="flex justify-between items-start border-b-2 border-gray-800 pb-3 mb-3">
  <div>
    <h1 className="text-lg font-bold text-gray-900">NATURE LITE FOODS (SUHIKA PVT LTD)</h1>
    <p className="text-xs text-gray-600">State: Chhattisgarh | GSTIN: {BUSINESS_GSTIN}</p>
    <p className="text-xs text-gray-600">PAN: ABCDE1234F | Phone: +91-XXXXXXXXXX</p>
  </div>
  <div className="text-right">
    <h2 className="text-base font-bold uppercase tracking-wide border border-gray-800 px-3 py-1">
      {bill.gstr1Section === 'B2B' ? 'TAX INVOICE' :
       bill.items?.some(i => i.gstRate === 0) && bill.items?.some(i => i.gstRate > 0)
         ? 'INVOICE-CUM-BILL OF SUPPLY' : 'BILL OF SUPPLY'}
    </h2>
    <p className="text-xs text-gray-500 mt-1">Original for Recipient</p>
  </div>
</div>
```

- [ ] **Step 8.3: Invoice meta (two-column)**

```tsx
<div className="grid grid-cols-2 gap-4 mb-4 text-xs">
  <div className="space-y-1">
    <p><span className="text-gray-500 font-medium">Invoice No:</span> <span className="font-mono font-bold">{bill.invoiceNo}</span></p>
    <p><span className="text-gray-500 font-medium">Date:</span> {formatDate(bill.invoiceDate ?? bill.createdAt)}</p>
    <p><span className="text-gray-500 font-medium">Place of Supply:</span> {bill.placeOfSupply ?? '22'} — {STATE_NAME[bill.placeOfSupply ?? '22']}</p>
    <p><span className="text-gray-500 font-medium">Reverse Charge:</span> No</p>
  </div>
  <div className="space-y-1">
    <p className="font-semibold text-gray-700">Bill To:</p>
    <p className="font-bold">{bill.customerName}</p>
    <p className="text-gray-600">{bill.billingAddress}</p>
    {bill.customerGstNo && <p><span className="text-gray-500">GSTIN:</span> {bill.customerGstNo}</p>}
    {bill.shippingAddress && !bill.sameAsBilling && (
      <><p className="font-semibold text-gray-700 mt-1">Ship To:</p><p className="text-gray-600">{bill.shippingAddress}</p></>
    )}
  </div>
</div>
```

- [ ] **Step 8.4: Items table**

Full column set: `#`, `Item / HSN`, `Qty`, `Unit`, `Rate`, `Disc`, `Taxable`, `GST%`, `CGST`, `SGST/IGST`, `Amount`.

If `bill.cgstTotalPaise` is undefined (old bill), derive from `bill.totalGst / 2` for display.

- [ ] **Step 8.5: GST summary table by rate**

Below items table, group by `gstRate` and show: `HSN`, `Taxable Value`, `CGST Rate %`, `CGST Amt`, `SGST Rate %`, `SGST Amt` (or IGST if inter-state), `Total Tax`. Use data from line items.

- [ ] **Step 8.6: Totals block**

```
Taxable Amount:     XX,XXX.XX
CGST:               X,XXX.XX
SGST:               X,XXX.XX
Round Off:          ±0.XX
Grand Total:        XX,XXX.XX
Amount Paid:        XX,XXX.XX
Balance Due:        XX,XXX.XX
```

Amount in words below: `"Rupees Forty Thousand Five Hundred Only"`

- [ ] **Step 8.7: Bank details + UPI QR + Signature**

Footer bar:
```
Bank: [name] | A/C: [masked] | IFSC: [code] | Branch: [branch]
UPI: [upiId]

[QR code placeholder — render as text link for Phase 1; Phase 9 will add actual QR generation]

Authorised Signatory: NATURE LITE FOODS
[blank line for signature]
```

- [ ] **Step 8.8: Print and action buttons (no-print)**

```tsx
<div className="no-print flex gap-3 mb-6">
  <Button onClick={() => window.print()} className="bg-[#2d7a4f] text-white">
    <Printer className="h-4 w-4 mr-2" /> Print A4
  </Button>
  <Button variant="outline" onClick={() => router.push(`/billing/invoice/${id}/thermal`)}>
    Thermal Receipt
  </Button>
  {bill.status === 'active' && (
    <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
      onClick={() => setShowCancel(true)}>
      Cancel Bill
    </Button>
  )}
  {bill.status === 'cancelled' && (
    <span className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded font-medium">CANCELLED</span>
  )}
</div>
```

- [ ] **Step 8.9: Cancel dialog**

Simple shadcn `AlertDialog` with a required reason textarea. On confirm, calls `api.cancelBillingBill(id, reason)` then re-fetches bill.

---

## Task 9: Thermal Receipt Page

**Files:**
- Create: `frontend/src/app/billing/invoice/[id]/thermal/page.tsx`

- [ ] **Step 9.1: Create thermal page**

```tsx
// 58mm receipt at ~384px wide
export default function ThermalReceiptPage({ params }: { params: { id: string } }) {
  const { data: bill } = useQuery({
    queryKey: ['billing-bill', params.id],
    queryFn: () => api.getBillingBill(params.id),
  });
  if (!bill) return null;

  return (
    <div className="max-w-[384px] mx-auto font-mono text-[12px] leading-tight p-4 bg-white">
      <style>{`@media print { @page { size: 58mm auto; margin: 2mm; } .no-print { display: none; } }`}</style>
      
      <div className="text-center mb-2">
        <div className="font-bold text-sm">NATURE LITE FOODS</div>
        <div className="text-[10px]">SUHIKA PVT LTD</div>
        <div className="text-[10px]">GST: {BUSINESS_GSTIN}</div>
      </div>
      
      <div className="border-t border-dashed border-gray-400 my-1" />
      
      <div className="text-[10px]">
        <div>Invoice: {bill.invoiceNo}</div>
        <div>Date: {formatDate(bill.invoiceDate ?? bill.createdAt)}</div>
        <div>Customer: {bill.customerName}</div>
      </div>
      
      <div className="border-t border-dashed border-gray-400 my-1" />
      
      {bill.items?.map((item: any, i: number) => (
        <div key={i} className="flex justify-between text-[11px]">
          <span className="flex-1 truncate mr-1">{item.name}</span>
          <span>{item.qty} x {item.rate ?? (item.unitPrice?.toFixed(2))}</span>
          <span className="ml-2 tabular-nums">
            {formatINR(item.total ?? Math.round(item.unitPrice * item.qty * 100))}
          </span>
        </div>
      ))}
      
      <div className="border-t border-dashed border-gray-400 my-1" />
      
      <div className="flex justify-between text-[11px]">
        <span>Taxable</span><span>{formatINR(bill.grandTotalPaise ? bill.grandTotalPaise - (bill.cgstTotalPaise + bill.sgstTotalPaise + bill.igstTotalPaise + (bill.roundOffPaise ?? 0)) : bill.subtotal * 100)}</span>
      </div>
      {bill.cgstTotalPaise > 0 && <div className="flex justify-between text-[11px]"><span>CGST</span><span>{formatINR(bill.cgstTotalPaise)}</span></div>}
      {bill.sgstTotalPaise > 0 && <div className="flex justify-between text-[11px]"><span>SGST</span><span>{formatINR(bill.sgstTotalPaise)}</span></div>}
      {bill.igstTotalPaise > 0 && <div className="flex justify-between text-[11px]"><span>IGST</span><span>{formatINR(bill.igstTotalPaise)}</span></div>}
      <div className="flex justify-between font-bold text-[12px] border-t border-gray-400 mt-1 pt-1">
        <span>TOTAL</span><span>{formatINR(bill.grandTotalPaise ?? bill.grandTotal * 100)}</span>
      </div>
      <div className="flex justify-between text-[11px]"><span>Paid</span><span>{formatINR(bill.amountPaidPaise ?? bill.amountPaid * 100)}</span></div>
      <div className="flex justify-between text-[11px] font-semibold"><span>Balance</span><span>{formatINR(bill.amountDuePaise ?? bill.amountDue * 100)}</span></div>
      
      <div className="border-t border-dashed border-gray-400 my-1" />
      
      <div className="text-center text-[10px] text-gray-500">
        <div>{amountInWords(bill.grandTotalPaise ?? Math.round(bill.grandTotal * 100))}</div>
        <div className="mt-1">Thank you for your purchase!</div>
      </div>
      
      <div className="no-print mt-4 flex gap-2">
        <button onClick={() => window.print()} className="text-[11px] border px-2 py-1 rounded">Print</button>
        <button onClick={() => window.history.back()} className="text-[11px] border px-2 py-1 rounded">Back</button>
      </div>
    </div>
  );
}
```

The `formatINR` utility from Phase 0 accepts paise. Ensure it returns a rupee string.

---

## Task 10: Add `searchProducts` backend — return GST fields

**Files:**
- Modify: `backend/src/modules/billing/billing.service.ts`

The existing `searchProducts` method returns products from the `Product` collection. It needs to include `gstRate`, `mrp`, `uqc` for the item grid.

- [ ] **Step 10.1: Update product search projection**

Find the `searchProducts` method in `billing.service.ts` and ensure the query includes:

```typescript
.select('name sku price hsnCode tagPrices gstRate mrp uqc taxability')
```

If `gstRate` is not on the Product schema, check `backend/src/modules/products/schemas/product.schema.ts`. If it was added in Phase 0 (`a6c6cb3` commit), it should exist. If not, add:

```typescript
// In product.schema.ts (if missing)
@Prop({ default: 5 }) gstRate: number;
@Prop({ default: 0 }) mrp: number;
@Prop({ default: 'NOS' }) uqc: string;
```

- [ ] **Step 10.2: Return uqc as `unit` in the API response**

In the service, map products to include `unit: p.uqc ?? 'NOS'` so the frontend ItemGrid can pre-fill the unit column.

---

## Self-Review Checklist

### Spec coverage:

| Blueprint section | Covered |
|---|---|
| 5.1 Cash/Credit toggle | Task 4, 7 |
| 5.1 Invoice No from Counter, FY series | Task 2 |
| 5.1 Invoice Date + Time | Task 4 |
| 5.1 Godown selector | Task 2, 4 |
| 5.1 Billing + Shipping address, Same-as-billing | Task 4, 7 |
| 5.1 State of Supply, auto from GSTIN, override | Task 4, 7 |
| 5.2 HSN, MRP, QTY, UNIT, PRICE with incl/excl switch | Task 5 |
| 5.2 DISCOUNT % and AMT | Task 5 |
| 5.2 TAX %, TAX AMOUNT, AMOUNT | Task 5 |
| 5.2 Price auto-fill: tag price → item sale price | Task 5.3 |
| 5.2 Barcode scan | ❌ Deferred — no camera API available in counter PC environment |
| 5.2 Stock hint | ❌ Deferred to Phase 5 (inventory) |
| 5.2 Below-purchase price hint | ❌ Deferred to Phase 3 (purchase price on product) |
| 5.3 Bill-level discount | Task 6 |
| 5.3 Shipping/packing charges | Task 6 |
| 5.3 Round-off | Task 6, 3 |
| 5.3 Payment mode (Cash/UPI/Card/Bank/Cheque) | Task 6 |
| 5.3 Denomination keypad for cash | ❌ Phase 1B |
| 5.3 Amount in words | Task 6.7 |
| 5.3 Save, Save & New, Save & Print | Task 7 |
| 5.3 Share (PDF/WhatsApp) | ❌ PDF generation deferred; WhatsApp link is `/billing/invoice/:id` URL share |
| 5.4 A4 GST Tax Invoice (Rule 46) | Task 8 |
| 5.4 Thermal 58/80mm | Task 9 |
| 5.4 Copy labels (ORIGINAL/DUPLICATE/TRIPLICATE) | Task 8.2 |
| 5.5 Edit until GST lock | ❌ GST month locking is Phase 8; Phase 1 bills can always be edited until cancelled |
| 5.5 AuditLog on every save/cancel | Task 2.4, 2.5 |
| 5.5 Cancel with reason | Task 2.5, 8.8, 8.9 |
| 5.5 Soft delete to Recycle Bin | ❌ Phase 9 (Recycle Bin) |
| 15.5 UI animations | Tasks 4, 5, 7 (motion primitives from Phase 0) |
| Section 3.4 Price incl/excl tax | Task 3.2, 2.4 |
| Section 3.4 Round-off range ±0.50 | Task 3.2, 2.4 |
| Section 3.5 Bill discount proportional | Task 3.2, 2.4 |
| Section 3.6 GSTR-1 classification | Task 2.4 |
| CGST odd-paisa rule | Task 2.4 (floor for CGST, remainder to SGST) |

**Deferred features logged:** Barcode scan, stock hint, below-purchase price hint, denomination keypad (Phase 1B), Share PDF generation, soft-delete Recycle Bin (Phase 9), GST month lock (Phase 8). These do not block Phase 1 going live.

### Placeholder scan: none found.

### Type consistency:
- `LineItem._key` is `string` (uuid) in `types.ts` and `useBillCalc.ts` — consistent
- `BillTotals.grandTotalPaise` used in `SummaryPanel` → `amountInWords(totals.grandTotalPaise)` → `amountInWords` accepts paise Number → consistent
- `formatINR` accepts paise: `formatINR(line.total)` where `total` is paise — consistent with Phase 0 implementation
- `BillCharge.amtRupees` in frontend, converted to `amtPaise` in backend — explicit boundary conversion in Task 2.4

### Review Focus — tests to add:

Add these to the existing vitest suite at `frontend/src/lib/billing/gst/calc.test.ts`:

```typescript
it('POS change mid-bill: switching to inter-state recomputes IGST not CGST+SGST', () => {
  const intra = calcLine({ qty: 1, rate: 90000, priceInclTax: true, gstRate: 5 }, 'intra');
  const inter = calcLine({ qty: 1, rate: 90000, priceInclTax: true, gstRate: 5 }, 'inter');
  expect(intra.cgst).toBe(2143);
  expect(intra.igst).toBe(0);
  expect(inter.igst).toBe(4286);
  expect(inter.cgst).toBe(0);
});

it('round-off input must be grandBefore, not already-rounded value', () => {
  const { rounded, roundOff } = applyRoundOff(94550); // 945.50 rupee in paise
  expect(rounded).toBe(94600);
  expect(roundOff).toBe(50);
  // Calling again on the already-rounded value should give roundOff=0
  const { roundOff: zero } = applyRoundOff(94600);
  expect(zero).toBe(0);
});

it('bill discount allocated before tax: T13 confirmed in useBillCalc', () => {
  // taxable lines 60000 and 40000 paise, bill disc 10000 paise
  // line 0 alloc = 10000 * 60000/100000 = 6000; taxable after = 54000
  // line 1 alloc = 10000 * 40000/100000 = 4000; taxable after = 36000
  const items: LineItem[] = [
    { _key:'a', productId:'p1', name:'A', sku:'S1', hsnCode:'', mrp:0, qty:1, unit:'NOS', rate:600, priceInclTax:false, discountPct:0, gstRate:5, discountAmt:0, taxable:0, cgst:0, sgst:0, igst:0, total:0 },
    { _key:'b', productId:'p2', name:'B', sku:'S2', hsnCode:'', mrp:0, qty:1, unit:'NOS', rate:400, priceInclTax:false, discountPct:0, gstRate:18, discountAmt:0, taxable:0, cgst:0, sgst:0, igst:0, total:0 },
  ];
  const { lines } = useBillCalcPure(items, 10, [], false, false, 0);
  expect(lines[0].taxable).toBe(54000); // 540 rupees in paise
  expect(lines[1].taxable).toBe(36000); // 360 rupees in paise
  expect(lines[0].cgst + lines[0].sgst).toBe(2700);  // 5% of 54000 / 2 each
  expect(lines[1].cgst + lines[1].sgst).toBe(6480);  // 18% of 36000
});
```

Export a pure `useBillCalcPure` function (same logic as the hook but callable without React) from `useBillCalc.ts` for testing.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-10-14-billing-phase-1.md`.

**Deferred from Phase 1 (document for tracking):**
- Barcode scan into item row → Phase 1 or later
- Stock qty hint → Phase 5
- Below-purchase price hint → Phase 3
- Cash denomination keypad → Phase 1B
- Share/PDF generation → Phase 10
- Soft-delete Recycle Bin → Phase 9
- GST month lock → Phase 8
- QR code on invoice → Phase 9

**Please review the plan. Which execution approach would you prefer?**

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

**I recommend Native** because the tasks build heavily on each other's interfaces (types flow from Task 3 → 4 → 5 → 6 → 7) and I already have full context of the codebase from writing this plan. Does the plan capture what you want, and which approach should we use?
