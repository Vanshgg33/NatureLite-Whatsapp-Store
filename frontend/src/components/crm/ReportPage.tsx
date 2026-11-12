'use client';

import type { LucideIcon } from 'lucide-react';
import { downloadCsv } from '@/lib/crm/csv';

const card = { background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' };

export function ReportPage({ title, icon: Icon, note, loading, error, children }: {
  title: string; icon: LucideIcon; note?: string; loading?: boolean; error?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="min-h-full p-7 space-y-5" style={{ background: 'var(--crm-sand)' }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Icon className="h-5 w-5" style={{ color: 'var(--crm-gold)' }} />
        <h1 className="text-[20px] font-semibold" style={{ color: 'var(--crm-ink)' }}>{title}</h1>
        {note && <span className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>{note}</span>}
      </div>
      {loading ? <p>Loading…</p> : error ? <p>Could not load this report.</p> : children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[14px] p-4" style={card}>
      <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{label}</p>
      <p className="text-[20px] font-semibold crm-tabular" style={{ color: 'var(--crm-forest)' }}>{value}</p>
    </div>
  );
}

export function DataTable({ head, rows, empty = 'Nothing to show yet.', csv }: { head: string[]; rows: React.ReactNode[][]; empty?: string; csv?: string }) {
  const exportCsv = () => downloadCsv(`${csv}.csv`, [head, ...rows.map(r => r.map(c => (typeof c === 'string' || typeof c === 'number' ? c : '')))]);
  return (
    <div className="rounded-[14px] overflow-x-auto" style={card}>
      {csv && rows.length > 0 && (
        <div className="flex justify-end px-4 pt-3"><button onClick={exportCsv} className="text-[12px] underline" style={{ color: 'var(--crm-forest)' }}>Export CSV</button></div>
      )}
      <table className="w-full text-[13px]">
        <thead><tr className="text-left" style={{ color: 'var(--crm-muted)' }}>{head.map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {!rows.length && <tr><td colSpan={head.length} className="px-4 py-8 text-center">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--crm-line)' }}>
              {r.map((c, j) => <td key={j} className="px-4 py-2.5 crm-tabular">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Card = ({ children }: { children: React.ReactNode }) => <div className="rounded-[14px] p-4" style={card}>{children}</div>;
export const pctText = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
