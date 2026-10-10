// Label · track (sand-2, 14px, round) with fill · value
interface HBarProps {
  label: string;
  value: number;
  max: number;
  displayValue: string;
  color?: string;
  labelWidth?: number;
}

export function HBar({ label, value, max, displayValue, color, labelWidth = 128 }: HBarProps) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <p
        className="text-[12px] font-medium text-right flex-shrink-0 truncate"
        style={{ width: labelWidth, color: 'var(--crm-ink-2)' }}
      >
        {label}
      </p>
      <div
        className="flex-1 h-3.5 rounded-full overflow-hidden"
        style={{ background: 'var(--crm-sand-2)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color ?? 'var(--crm-gold)' }}
        />
      </div>
      <p
        className="crm-display text-[13px] font-semibold w-12 text-right flex-shrink-0"
        style={{ color: 'var(--crm-ink)' }}
      >
        {displayValue}
      </p>
    </div>
  );
}
