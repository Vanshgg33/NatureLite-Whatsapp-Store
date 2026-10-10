// SVG progress ring — 150px, r=62, stroke=14, starts at 12 o'clock
interface ProgressRingProps {
  value: number;
  target: number;
  label?: string;
}

export function ProgressRing({ value, target, label }: ProgressRingProps) {
  const r = 62;
  const stroke = 14;
  const cx = 75;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(target, 1), 1);
  const dash = pct * circumference;

  return (
    <svg width="150" height="150" viewBox="0 0 150 150" aria-label={`${value} of ${target}`} role="img">
      {/* track */}
      <circle
        cx={cx} cy={cx} r={r}
        fill="none"
        stroke="var(--crm-forest-3)"
        strokeWidth={stroke}
      />
      {/* value arc */}
      {pct > 0 && (
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke="var(--crm-gold-bright)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      )}
      {/* centre number */}
      <text
        x={cx} y={cx - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--crm-gold-bright)"
        fontSize="38"
        fontWeight="600"
        style={{ fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
      >
        {value}
      </text>
      <text
        x={cx} y={cx + 20}
        textAnchor="middle"
        fill="var(--crm-on-dark-muted)"
        fontSize="12"
        style={{ fontFamily: 'var(--font-sans, DM Sans, system-ui, sans-serif)' }}
      >
        {label ?? `of ${target} calls`}
      </text>
    </svg>
  );
}
