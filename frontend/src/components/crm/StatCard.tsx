'use client';
import { FnCountUp } from './forest-night-motion';

interface StatCardProps {
  eyebrow: string;
  value: string;
  caption?: string;
  valueSize?: string;
}

/**
 * "₹1,23,456", "45%", "12 days": count the number up, keep the prefix/suffix. Anything else (or a format the
 * counter would print differently, e.g. 2 decimals or non-Indian grouping) is shown exactly as given.
 */
export function parseCountable(value: string): { prefix: string; n: number; suffix: string; format: 'int' | 'dec1' } | null {
  const m = /^([^\d-]*)(-?\d[\d,]*)(\.\d)?((?![.,]\d)\D.*)?$/.exec(value);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, '') + (m[3] ?? ''));
  if (!Number.isFinite(n)) return null;
  const format = m[3] ? 'dec1' : 'int';
  const prefix = m[1];
  const suffix = m[4] ?? '';
  // only animate when the counter reproduces the original text exactly
  const shown = new Intl.NumberFormat('en-IN', format === 'dec1' ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(n);
  return prefix + shown + suffix === value ? { prefix, n, suffix, format } : null;
}

export function StatCard({ eyebrow, value, caption, valueSize = '34px' }: StatCardProps) {
  const c = parseCountable(value);
  return (
    <div className="crm-card-v2" style={{ padding: '22px 24px' }}>
      <p
        className="text-[11px] uppercase tracking-[.12em] font-semibold mb-2"
        style={{ color: 'var(--crm-muted)' }}
      >
        {eyebrow}
      </p>
      <p
        className="crm-display font-semibold leading-none mb-1"
        style={{ fontSize: valueSize, color: 'var(--crm-ink)' }}
      >
        {c ? <FnCountUp value={c.n} format={c.format} prefix={c.prefix} suffix={c.suffix} /> : value}
      </p>
      {caption && (
        <p className="text-[12px] mt-1" style={{ color: 'var(--crm-muted)' }}>
          {caption}
        </p>
      )}
    </div>
  );
}
