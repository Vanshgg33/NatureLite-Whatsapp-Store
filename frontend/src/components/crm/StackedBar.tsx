// Segments as flex children with 2px white separators, height 28px, radius 8px
export interface SegmentSlice {
  label: string;
  count: number;
  color: string;
}

interface StackedBarProps {
  segments: SegmentSlice[];
  total: number;
}

export function StackedBar({ segments, total }: StackedBarProps) {
  const nonZero = segments.filter(s => s.count > 0);
  if (!nonZero.length || !total) {
    return (
      <div
        className="h-7 rounded-lg"
        style={{ background: 'var(--crm-sand-2)' }}
      />
    );
  }

  return (
    <div
      className="flex h-7 rounded-lg overflow-hidden"
      style={{ background: '#fff', gap: 2 }}
      role="img"
      aria-label={`Segment distribution, total ${total}`}
    >
      {nonZero.map(s => (
        <div
          key={s.label}
          title={`${s.label}: ${s.count}`}
          style={{
            width: `${(s.count / total) * 100}%`,
            background: s.color,
            minWidth: 2,
          }}
        />
      ))}
    </div>
  );
}
