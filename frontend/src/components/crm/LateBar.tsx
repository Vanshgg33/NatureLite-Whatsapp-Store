// "N days" (danger, 13px bold) + 6px bar, width = min(daysLate/15, 1)
interface LateBarProps {
  daysLate: number;
  // pass positive daysUntil to render "in N days" (blue) for upcoming
  daysUntil?: number;
}

export function LateBar({ daysLate, daysUntil }: LateBarProps) {
  if (daysUntil !== undefined && daysUntil > 0) {
    return (
      <span className="text-[12px] font-semibold" style={{ color: 'var(--crm-blue)' }}>
        in {daysUntil}d
      </span>
    );
  }

  if (!daysLate || daysLate <= 0) {
    return <span className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>—</span>;
  }

  const pct = Math.min(daysLate / 15, 1) * 100;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[13px] font-bold crm-tabular" style={{ color: 'var(--crm-danger)' }}>
        {daysLate}d
      </span>
      <div
        className="w-12 h-1.5 rounded-full overflow-hidden flex-shrink-0"
        style={{ background: 'var(--crm-danger-track)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: 'var(--crm-danger)' }}
        />
      </div>
    </div>
  );
}
