import { DEFAULT_FORMULAS, Formulas, SlotKey } from './formula-engine';

/**
 * The boxes on the Logics page. Each box owns one or more formula steps and offers ready-made choices,
 * so nobody has to type a formula. The first choice of every box is the built-in behaviour.
 * Every choice is checked by the same safety tests as a typed formula (see formula-presets.spec.ts).
 */
export interface PresetOption { id: string; label: string; desc: string; set: Partial<Formulas> }
export interface NodeGroup { id: string; lane: 'item' | 'discount' | 'totals'; title: string; help: string; slots: SlotKey[]; options: PresetOption[] }

const D = DEFAULT_FORMULAS;
const rounding = (slot: SlotKey, build: (fn: string) => string, what: string): PresetOption[] => [
  { id: 'nearest', label: 'Nearest paisa', desc: `${what} rounded to the nearest paisa. This is how billing works today.`, set: { [slot]: build('round') } },
  { id: 'down', label: 'Round down', desc: `${what} rounded down to the paisa below.`, set: { [slot]: build('floor') } },
  { id: 'up', label: 'Round up', desc: `${what} rounded up to the paisa above.`, set: { [slot]: build('ceil') } },
];

export const NODE_GROUPS: NodeGroup[] = [
  {
    id: 'amount', lane: 'item', title: 'Item amount', slots: ['gross'],
    help: 'Price × quantity for one item line, before any discount.',
    options: rounding('gross', f => `${f}(ratePaise * qty)`, 'The amount'),
  },
  {
    id: 'itemDiscount', lane: 'item', title: 'Item discount', slots: ['lineDisc'],
    help: 'The discount typed on a single item line.',
    options: [
      ...rounding('lineDisc', f => `${f}(gross * discountPct / 100)`, 'The discount'),
      { id: 'none', label: 'No item discounts', desc: 'Ignore any discount typed on an item line.', set: { lineDisc: '0' } },
    ],
  },
  {
    id: 'taxInPrice', lane: 'item', title: 'Tax in the price', slots: ['preTaxable'],
    help: 'Decides whether the price you type already contains GST.',
    options: [
      { id: 'follow', label: 'Follow the bill switch', desc: 'Use the “price includes tax” switch on each item. This is how billing works today.', set: { preTaxable: D.preTaxable } },
      { id: 'before', label: 'Prices never include tax', desc: 'Always add GST on top of the typed price, whatever the switch says.', set: { preTaxable: 'gross - lineDisc' } },
      { id: 'inclusive', label: 'Prices always include tax', desc: 'Always take GST out of the typed price, whatever the switch says.', set: { preTaxable: 'round((gross - lineDisc) * 100 / (100 + gstRate))' } },
    ],
  },
  {
    id: 'billDiscount', lane: 'discount', title: 'Bill discount', slots: ['billDiscAmt', 'billDiscAlloc', 'taxable'],
    help: 'A discount on the whole bill. It is spread across the items before tax is worked out.',
    options: [
      { id: 'standard', label: 'Standard', desc: 'Follow the % or ₹ switch, rounded to the nearest paisa, shared in proportion to item value. This is how billing works today.', set: { billDiscAmt: D.billDiscAmt, billDiscAlloc: D.billDiscAlloc } },
      { id: 'down', label: 'Round % discounts down', desc: 'A percentage discount is rounded down to the paisa below. Rupee discounts are unchanged.', set: { billDiscAmt: 'isAmountMode ? min(round(discountValue * 100), totalPreTaxable) : floor(totalPreTaxable * discountValue / 100)' } },
      { id: 'none', label: 'No bill discount', desc: 'Ignore any discount typed for the whole bill.', set: { billDiscAmt: '0' } },
    ],
  },
  {
    id: 'tax', lane: 'discount', title: 'Tax amount', slots: ['taxAmt'],
    help: 'GST charged on each item after discounts.',
    options: rounding('taxAmt', f => `${f}(taxable * gstRate / 100)`, 'The tax'),
  },
  {
    id: 'split', lane: 'discount', title: 'CGST / SGST / IGST', slots: ['cgst', 'sgst', 'igst'],
    help: 'Same-state bills split the tax into CGST and SGST. Other-state bills charge IGST.',
    options: [
      { id: 'cgst-small', label: 'SGST gets the odd paisa', desc: 'When the tax cannot be split evenly, CGST takes the smaller half. This is how billing works today.', set: { cgst: D.cgst, sgst: D.sgst, igst: D.igst } },
      { id: 'cgst-large', label: 'CGST gets the odd paisa', desc: 'When the tax cannot be split evenly, CGST takes the larger half.', set: { cgst: 'isInterState ? 0 : ceil(taxAmt / 2)', sgst: 'isInterState ? 0 : taxAmt - ceil(taxAmt / 2)', igst: D.igst } },
    ],
  },
  {
    id: 'lineTotal', lane: 'totals', title: 'Item total', slots: ['lineTotal'],
    help: 'Taxable value plus tax for one item line.',
    options: [{ id: 'standard', label: 'Taxable value + tax', desc: 'This is how billing works today.', set: { lineTotal: D.lineTotal } }],
  },
  {
    id: 'billTotal', lane: 'totals', title: 'Bill total', slots: ['grandBefore'],
    help: 'All item totals plus charges such as freight, before round-off.',
    options: [{ id: 'standard', label: 'Items + charges', desc: 'This is how billing works today.', set: { grandBefore: D.grandBefore } }],
  },
  {
    id: 'roundOff', lane: 'totals', title: 'Round-off', slots: ['grandTotal'],
    help: 'How the final amount is rounded to a whole rupee when the round-off switch is on.',
    options: [
      { id: 'nearest', label: 'Nearest rupee', desc: 'This is how billing works today.', set: { grandTotal: D.grandTotal } },
      { id: 'down', label: 'Round down to the rupee', desc: 'The customer never pays more than the exact amount.', set: { grandTotal: 'roundOff ? floor(grandBefore / 100) * 100 : grandBefore' } },
      { id: 'up', label: 'Round up to the rupee', desc: 'The final amount is always the next whole rupee.', set: { grandTotal: 'roundOff ? ceil(grandBefore / 100) * 100 : grandBefore' } },
    ],
  },
];
