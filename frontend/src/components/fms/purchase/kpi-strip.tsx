import { Stage } from '@/lib/fms/stage';
import { fmtQty, fmtOverdue } from '@/lib/fms/format';

interface Summary {
  myAction: number;
  byStage: Record<string, number>;
  overdue: number;
  overdueItems: { prNo: string; days: number }[];
  oldestOpen: { prNo: string; days: number; title: string } | null;
  pipelineKg: number;
  pipelineLines: number;
  closedThisMonth: number;
}

export function KpiStrip({ summary }: { summary: Summary }) {
  const needs  = summary.byStage['NEEDS_PO'] || 0;
  const approve = summary.byStage['AWAITING_APPROVAL'] || 0;
  const close  = summary.byStage['READY_TO_CLOSE'] || 0;

  const breakdown = [
    needs   && `${needs} need a PO`,
    approve && `${approve} to approve`,
    close   && `${close} to close`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Tile 1 — dark */}
      <div className="col-span-2 md:col-span-1 rounded-fms-card p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]" style={{ background: '#17382A' }}>
        <p className="text-xs text-white/60 font-jakarta mb-1">Waiting on you</p>
        <p className="text-4xl font-semibold text-white font-fraunces tabular-nums">{summary.myAction}</p>
        {breakdown && <p className="mt-1.5 text-[11px] text-white/50 font-jakarta leading-snug">{breakdown}</p>}
      </div>

      {/* Tile 2 — Overdue */}
      <div className="rounded-fms-card bg-fms-surface border border-fms-line p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
        <p className="text-xs text-fms-muted font-jakarta mb-1">Overdue</p>
        <p className="text-4xl font-semibold font-fraunces tabular-nums" style={{ color: summary.overdue > 0 ? '#A3241A' : '#1E5E3F' }}>
          {summary.overdue}
        </p>
        {summary.overdueItems[0] && (
          <p className="mt-1.5 text-[11px] text-fms-muted font-jakarta truncate">
            {summary.overdueItems[0].prNo} · {summary.overdueItems[0].days} d
          </p>
        )}
      </div>

      {/* Tile 3 — Oldest open */}
      <div className="rounded-fms-card bg-fms-surface border border-fms-line p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
        <p className="text-xs text-fms-muted font-jakarta mb-1">Oldest open</p>
        <p className="text-4xl font-semibold font-fraunces tabular-nums" style={{ color: '#8A4B06' }}>
          {summary.oldestOpen ? `${summary.oldestOpen.days} d` : '—'}
        </p>
        {summary.oldestOpen && (
          <p className="mt-1.5 text-[11px] text-fms-muted font-jakarta truncate">{summary.oldestOpen.prNo}</p>
        )}
      </div>

      {/* Tile 4 — Pipeline */}
      <div className="rounded-fms-card bg-fms-surface border border-fms-line p-5 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
        <p className="text-xs text-fms-muted font-jakarta mb-1">In pipeline</p>
        <p className="text-4xl font-semibold text-fms-ink font-fraunces tabular-nums">
          {summary.pipelineKg.toLocaleString('en-IN')}
          <span className="text-base font-normal text-fms-muted ml-1">kg</span>
        </p>
        <p className="mt-1.5 text-[11px] text-fms-muted font-jakarta">
          {summary.pipelineLines} lines · {summary.closedThisMonth} closed this month
        </p>
      </div>
    </div>
  );
}

const PIPELINE_STAGES: { key: Stage; label: string; dot: string }[] = [
  { key: 'NEEDS_PO',          label: 'Needs PO',         dot: '#D9902B' },
  { key: 'AWAITING_APPROVAL', label: 'Awaiting approval', dot: '#2F6FB5' },
  { key: 'AWAITING_DELIVERY', label: 'Awaiting delivery', dot: '#7B8780' },
  { key: 'READY_TO_CLOSE',    label: 'Ready to close',    dot: '#2F8A57' },
];

export function PipelineStrip({
  byStage,
  activeFilter,
  onFilter,
}: {
  byStage: Record<string, number>;
  activeFilter: Stage | null;
  onFilter: (s: Stage | null) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-fms-muted uppercase tracking-[0.07em] font-jakarta mb-2">
        Where every open request is stuck
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {PIPELINE_STAGES.map(({ key, label, dot }) => {
          const count = byStage[key] || 0;
          const active = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => onFilter(active ? null : key)}
              className="text-left rounded-fms-card border p-4 transition-colors focus-visible:ring-2 focus-visible:ring-fms-brand focus-visible:outline-none"
              style={{
                background: active ? '#EAF3EE' : '#FFFFFF',
                borderColor: active ? '#1E5E3F' : '#ECE9E1',
                boxShadow: '0 1px 2px rgba(24,33,28,.06)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot }} />
                <span className="text-[11px] font-semibold text-fms-muted uppercase tracking-wide font-jakarta">{label}</span>
              </div>
              <p className="text-2xl font-semibold text-fms-ink font-fraunces tabular-nums">{count}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
