'use client';
import { useRouter, useSearchParams } from 'next/navigation';

const PRESETS = [
  { label: 'Today',      value: 'today' },
  { label: 'Yesterday',  value: 'yesterday' },
  { label: '7 Days',     value: '7' },
  { label: '30 Days',    value: '30' },
  { label: 'This Month', value: 'month' },
  { label: 'All',        value: 'all' },
];

export function DateRangeFilter({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get('range') ?? 'all';

  const setRange = (v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v === 'all') { p.delete('range'); } else { p.set('range', v); }
    router.push(`?${p.toString()}`, { scroll: false });
  };

  return (
    <div className={`pf-filter-strip ${className ?? ''}`}>
      {PRESETS.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => setRange(value)}
          className={`pf-filter-pill${active === value ? ' active' : ''}`}
          data-ripple=""
        >
          {label}
        </button>
      ))}
    </div>
  );
}
