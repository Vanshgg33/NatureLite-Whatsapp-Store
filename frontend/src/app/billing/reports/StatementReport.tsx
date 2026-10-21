'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download } from 'lucide-react';
import { api, type BillingReportKey } from '@/lib/api';
import { Button } from '@/components/ui/button';

export type StatementKind = 'profit-loss' | 'stock-summary' | 'trial-balance' | 'balance-sheet' | 'gstr3b';

const TITLES: Record<StatementKind, string> = {
  'profit-loss': 'Profit & Loss', 'stock-summary': 'Stock Summary', 'trial-balance': 'Trial Balance',
  'balance-sheet': 'Balance Sheet', gstr3b: 'GSTR-3B',
};
export const STATEMENT_TABS = (Object.keys(TITLES) as StatementKind[]).map(k => ({ key: k, label: TITLES[k] }));

const BOLD = /^(\s*)(Total|Gross Profit|Net Profit|I\.|II\.|III\.|IV\.|V\.)/;

function cell(v: unknown) {
  if (typeof v === 'number') return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return v == null ? '' : String(v);
}

/** Renders a server-built statement exactly as laid out in its Excel export (rows of cells). */
export function StatementReport({ kind, from, to }: { kind: StatementKind; from: string; to: string }) {
  const params: Record<string, string> =
    kind === 'profit-loss' ? { from, to } : kind === 'gstr3b' ? { month: to.slice(0, 7) } : { asOn: to };
  const q = useQuery({ queryKey: ['billing-statement', kind, params], queryFn: () => api.getBillingReport(kind as BillingReportKey, params) });
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const sheets: Array<{ name: string; rows: any[][] }> = d?.view ?? d?.sheets ?? [];

  return (
    <div className="space-y-3">
      {kind === 'balance-sheet' && d?.warning && (
        <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <div>{d.warning}. Check opening balances and recent entries before relying on this report.</div>
        </div>
      )}
      {kind === 'trial-balance' && d && !d.balanced && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">Debit and credit totals differ — {d.debitTotal} vs {d.creditTotal}.</div>
      )}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-sm font-medium text-gray-700">{TITLES[kind]}</div>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={busy || !d}
            onClick={async () => { setBusy(true); try { await api.downloadBillingReport(kind as BillingReportKey, params); } finally { setBusy(false); } }}>
            <Download className="h-3.5 w-3.5" /> {busy ? 'Preparing…' : 'Export Excel'}
          </Button>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          {q.isLoading && <div className="text-center py-10 text-gray-400">Loading…</div>}
          {q.isError && <div className="text-center py-10 text-red-500">Could not load this report.</div>}
          {sheets.map(sh => (
            <table key={sh.name} className="w-full mb-6">
              <caption className="text-left px-4 py-2 text-xs font-semibold text-gray-400">{sh.name}</caption>
              <tbody>
                {sh.rows.map((r, i) => (
                  <tr key={i} className={`border-t ${BOLD.test(String(r[0] ?? '')) ? 'font-semibold bg-gray-50' : ''}`}>
                    {r.map((c, j) => (
                      <td key={j} className={`px-3 py-1.5 text-sm whitespace-pre ${typeof c === 'number' ? 'text-right tabular-nums' : 'text-gray-700'}`}>{cell(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
    </div>
  );
}
