import { DEFAULT_FORMULAS, SAMPLE_BILL, SLOT_KEYS, SLOT_META, VAR_LABELS, slotNames } from '../../billing/logics/formula-engine';
import { NODE_GROUPS } from '../../billing/logics/formula-presets';
import { PARAM_DEFS } from '../../billing/logics/param-defs';

export const LANE_TITLE: Record<string, string> = { item: 'Each item on the bill', discount: 'Discount and tax', totals: 'Totals' };

/**
 * Everything the Logics guide may say about the Logics page. The boxes, choices, formulas and settings
 * are generated from the same definitions the page uses, so the guide cannot drift from the screen.
 */
export function logicsKnowledge(): string {
  const label = (k: string) => SLOT_META.find((s) => s.key === k)?.label ?? k;

  const boxes = NODE_GROUPS.map((g, i) => {
    const steps = g.slots.map((s) => `    - ${label(s)} (step "${s}") = ${DEFAULT_FORMULAS[s]}`).join('\n');
    const options = g.options.map((o) => `    - "${o.label}": ${o.desc}`).join('\n');
    return `Box ${i + 1}: "${g.title}" (group "${LANE_TITLE[g.lane]}"). ${g.help}\n  Steps inside, with their built-in formulas:\n${steps}\n  Ready-made choices:\n${options}`;
  }).join('\n\n');

  const names = SLOT_KEYS.map((k) => `- "${k}" (${label(k)}) may use: ${slotNames(k).map((n) => `${n}${VAR_LABELS[n] ? ` [${VAR_LABELS[n]}]` : ''}`).join(', ')}`).join('\n');

  const settings = PARAM_DEFS.map((p) => `- "${p.label}" (${p.module}). ${p.help} Built-in value: ${p.default}${p.unit === 'paise' ? ' paise' : ' seconds'}.`).join('\n');

  return `## Where the Logics page is
Billing app sidebar → Settings group → "Logics" (between "Tax & Compliance" and "How it works"). Only admins who have the "Edit formulas and values" permission under Logics can change anything; others can look.

## How the page works (describe only these things)
- The page shows ${NODE_GROUPS.length} numbered boxes in three groups: ${Object.values(LANE_TITLE).map((t) => `"${t}"`).join(', ')}. Each box shows its name and what it is currently set to.
- Click a box. A panel opens on the right (below the boxes on a phone) with, from top to bottom:
  1. "Build it with blocks": each step of that box as blocks. Names are dropdowns, numbers are small fields, operators and rounding are dropdowns. The "⋯" next to a block adds a calculation, adds rounding, makes it "if / otherwise", replaces it with a number or a value, or removes a wrapper. The real formula is written in small text underneath.
  2. "Or start from a ready-made choice": pick one option from a list. This is the easiest way and covers the common cases.
  3. "Undo changes to this box" appears once the box has been changed.
  4. "Advanced: type the formula" for typing a formula by hand.
- A changed box is marked "changed" and shows "Custom formula" if it no longer matches a ready-made choice.
- "Try it on a sample bill" shows today's result next to the result with the changes, and highlights what moved. The sample is: ${SAMPLE_BILL.text}
- As soon as any box is changed, a bar appears at the bottom: "N box(es) changed", "Applies to bills from" (a date), "Reason", and the buttons Test, Publish and Discard changes. Test runs the safety checks without saving. Publish needs a start date and a reason. Nothing reaches customers until Publish succeeds.
- Under the boxes, "Other settings" holds the values listed below. Click one, type the new value, choose "Applies from", write a reason and press Save. Each one is saved on its own.
- "Fixed rules" are locked boxes that explain rules which stay in code: GSTR-1 section rules, books and ledger, stock first-in-first-out, invoice numbers, and the period lock. They cannot be edited here; a developer must change them.

## The boxes
${boxes}

## Other settings (saved one by one)
${settings}

## What happens when a change is published
- It applies only to bills dated on or after the chosen start date. Bills already saved are never recalculated; each bill remembers which version priced it.
- The start date cannot be on or before the "GSTR-1 filed until" date (the period lock), and cannot be earlier than the start date of a version that already exists. Publishing again on the same start date is allowed.
- The server runs the same checks as the Test button. Publishing is refused if any fail: CGST + SGST + IGST must equal the tax; a line total must equal taxable value + tax; tax must match the GST rate within one paisa; same-state bills use CGST + SGST only and other-state bills IGST only; the bill discount must be between 0 and the subtotal; the grand total before round-off must equal the item totals plus charges; round-off must stay under ₹1 and must give a whole rupee when the round-off switch is on and be 0 when it is off; every result must be a whole number of paise.
- To go back, publish the earlier choice again with a start date that is not earlier than the latest version's start date. Old versions are never deleted.
- The new-bill screen previews totals with the published formulas for the invoice date; the server recalculates when the bill is saved and is always the final authority.

## Formula language (only needed for custom formulas)
- Amounts are in paise (₹1 = 100 paise).
- Allowed: + - * / %, comparisons (< > <= >= == !=), && || !, condition ? a : b, and the functions round, floor, ceil, min, max, abs. Nothing else.
- Yes/no inputs are 1 or 0.
- Each step may use only the names listed here (earlier steps can be used too):
${names}`;
}
