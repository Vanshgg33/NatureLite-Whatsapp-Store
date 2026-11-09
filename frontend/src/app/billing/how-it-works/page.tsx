'use client';

import { Fragment, type ReactNode } from 'react';
import { Network, ArrowRight, ArrowDown } from 'lucide-react';
import { Header } from '@/components/layout/header';

// Static explainer: mirrors backend/src/modules/billing (billing.service, tax-settings, reports/*).
// Update this page when the pipeline changes.

function Box({ title, children, tone = 'green' }: { title: string; children?: ReactNode; tone?: 'green' | 'amber' | 'blue' | 'gray' }) {
  const tones = {
    green: 'border-[#2d7a4f]/40 bg-[#2d7a4f]/5',
    amber: 'border-amber-400/60 bg-amber-50',
    blue: 'border-blue-400/60 bg-blue-50',
    gray: 'border-gray-300 bg-white',
  };
  return (
    <div className={`rounded-xl border p-3 text-sm ${tones[tone]}`}>
      <div className="font-semibold text-gray-900">{title}</div>
      {children && <div className="mt-1 text-gray-600 leading-snug">{children}</div>}
    </div>
  );
}

function Flow({ steps }: { steps: ReactNode[] }) {
  return (
    <div className="flex flex-col md:flex-row md:items-stretch gap-2">
      {steps.map((s, i) => (
        <Fragment key={i}>
          <div className="flex-1">{s}</div>
          {i < steps.length - 1 && (
            <div className="flex items-center justify-center text-gray-400">
              <ArrowRight className="hidden md:block h-5 w-5" />
              <ArrowDown className="md:hidden h-5 w-5" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function Section({ n, title, intro, children }: { n: number; title: string; intro: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2d7a4f] text-xs text-white">{n}</span>
        {title}
      </h2>
      <p className="text-sm text-gray-600">{intro}</p>
      {children}
    </section>
  );
}

const SAVE_STEPS: Array<[string, string]> = [
  ['Period lock check', 'If the bill date is on or before the "GSTR-1 filed until" date, the save is refused. Same for cancelling.'],
  ['Invoice number', 'Typed number is checked (16 characters, no clashes). Otherwise the next number of the financial year is taken from a counter. Sales, credit notes and sale orders each have their own series, and the series restarts every 1 April.'],
  ['Customer snapshot', 'Name, phone, GSTIN and address are copied onto the bill, so later edits to the customer never change old bills.'],
  ['GST rate from the rule master', 'For every line, the rate and taxability valid on the bill date are looked up by item, then longest HSN prefix, then category. If no rule exists, the rate typed on the bill is used.'],
  ['Discounts', 'Line discount first, then the bill discount is shared across lines in proportion to their value, before tax.'],
  ['Tax split', 'Price incl. tax is divided back into taxable value + tax. Same state as you (Chhattisgarh, 22): CGST + SGST. Other state: IGST.'],
  ['Charges and round-off', 'Freight and similar charges can carry GST. Round-off to the nearest rupee is kept as its own amount, outside taxable value.'],
  ['GSTR-1 section', 'Valid GSTIN means B2B. No GSTIN and inter-state above the limit means B2CL. Otherwise B2CS. The price tag (Retail, Wholesale, ...) never decides this.'],
  ['Save and audit', 'The bill, its payments and an audit-log entry are stored. A cancelled bill keeps its number and is only marked cancelled.'],
];

const POSTINGS: Array<[string, string, string]> = [
  ['Sale', 'Customer (or cash / bank for what was paid)', 'Sales, Output CGST/SGST/IGST, round-off. Stock goes out.'],
  ['Credit note', 'Sales return side, tax reversed', 'Customer account or refund. Mirror image of the sale.'],
  ['Sale order', 'Nothing yet', 'Advance received is held as "advance for sale order" until the order becomes a sale.'],
  ['Purchase', 'Purchases, Input CGST/SGST/IGST', 'Supplier. If the tax is not claimable, it is added to the cost instead.'],
  ['Reverse-charge purchase', 'Input tax', 'Output tax. Supplier is credited only the taxable value.'],
  ['Payment in / out', 'Cash/bank (in) or supplier (out)', 'Customer (in) or cash/bank (out). Cheques wait in "undeposited cheques" until cleared.'],
  ['Expense / other income', 'Expense account, or cash/bank for income', 'Cash/bank, or income account.'],
  ['Opening balances', 'Opening stock, accounts, party balances', 'Retained earnings. Owner equity is whatever is left, so there is no hidden plug.'],
];

const REPORTS: Array<[string, string, string]> = [
  ['Daybook, Sale Summary by HSN', 'Bills and payments of the period', 'Totals tie back to invoice totals.'],
  ['GSTR-1 (14 sheets)', 'Bills in the month, credit notes, orders', 'Taxable value equals sales minus credit notes; HSN sheets tie to the main sheet.'],
  ['GSTR-3B', 'The GSTR-1 numbers plus purchases', 'Outward tax equals GSTR-1; ITC comes from eligible purchases and reverse charge.'],
  ['Profit & Loss', 'Ledger postings + stock valuation', 'Net profit equals the net income the ledger accumulates.'],
  ['Trial Balance', 'Every ledger account up to the date', 'Debit total must equal credit total.'],
  ['Balance Sheet', 'Same ledger + current-year profit', 'Left side must equal right side. If not, a red warning shows the difference.'],
  ['Stock Summary', 'Stock movements (purchases, sales, adjustments)', 'Moving weighted-average cost; open sale orders show as reserved.'],
];

export default function HowItWorksPage() {
  return (
    <div className="space-y-5 pb-10">
      <Header title="How billing works" description="Where each number comes from, and how bills, books and GST reports connect" icon={<Network className="h-6 w-6 text-[#2d7a4f]" />} />

      <div className="px-4 md:px-6 space-y-5 max-w-5xl">
        <Section n={1} title="The big picture" intro="You enter documents. The books are never typed in by hand: every report works the ledger out again from the documents each time you open it, so reports cannot disagree with each other.">
          <Flow steps={[
            <Box key="a" title="1. Documents you enter" tone="blue">Bills, credit notes, sale orders, purchases, payments, expenses, stock entries, opening balances.</Box>,
            <Box key="b" title="2. Rules applied" tone="amber">GST rate master, GSTIN check, invoice numbering, period lock.</Box>,
            <Box key="c" title="3. Ledger built on the fly">Every document becomes balanced debit and credit entries (reports/ledger.ts).</Box>,
            <Box key="d" title="4. Reports read the ledger" tone="gray">P&L, Trial Balance, Balance Sheet, GSTR-1, GSTR-3B, Stock, Daybook.</Box>,
          ]} />
        </Section>

        <Section n={2} title="What happens when you press Save on a bill" intro="These steps run in this order on the server. If one fails, nothing is saved.">
          <ol className="space-y-2">
            {SAVE_STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">{i + 1}</span>
                <div className="text-sm"><span className="font-medium text-gray-900">{t}.</span> <span className="text-gray-600">{d}</span></div>
              </li>
            ))}
          </ol>
        </Section>

        <Section n={3} title="What each document does to the books" intro="Every row below balances: the debit side always equals the credit side.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Document</th><th className="py-2 pr-3">Debit</th><th className="py-2">Credit / other effect</th></tr></thead>
              <tbody>
                {POSTINGS.map(([a, b, c]) => (
                  <tr key={a} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-3 font-medium text-gray-900 whitespace-nowrap">{a}</td>
                    <td className="py-2 pr-3 text-gray-600">{b}</td>
                    <td className="py-2 text-gray-600">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section n={4} title="Which report reads what, and how it checks itself" intro="Each report is a read-only view. The last column is the check that should always hold.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Report</th><th className="py-2 pr-3">Reads</th><th className="py-2">Check</th></tr></thead>
              <tbody>
                {REPORTS.map(([a, b, c]) => (
                  <tr key={a} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-3 font-medium text-gray-900">{a}</td>
                    <td className="py-2 pr-3 text-gray-600">{b}</td>
                    <td className="py-2 text-gray-600">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section n={5} title="What can stop you, and where it is set" intro="These are the guard rails. Most are changed under Tax & Compliance.">
          <div className="grid gap-2 md:grid-cols-2">
            <Box title="Period lock" tone="amber">Set the &quot;GSTR-1 filed until&quot; date after you file. Bills on or before it cannot be created or cancelled.</Box>
            <Box title="Rate master" tone="amber">Tax &amp; Compliance &rarr; GST Rates. Rates are dated, so the 22 Sep 2025 ghee change applies by bill date.</Box>
            <Box title="GSTIN check" tone="amber">An invalid GSTIN is refused when saving a customer, so a typo cannot silently turn a B2B bill into B2C.</Box>
            <Box title="Cancelled bills" tone="gray">Keep their number and stay in the audit trail. They drop out of totals and reports.</Box>
            <Box title="Login and roles" tone="gray">Only admins and superadmins reach billing. Rate rules are admin-only to change.</Box>
            <Box title="Opening balances" tone="gray">Books &amp; Stock &rarr; Accounts &amp; Opening. Set once; everything before that date is treated as opening.</Box>
          </div>
        </Section>
      </div>
    </div>
  );
}
