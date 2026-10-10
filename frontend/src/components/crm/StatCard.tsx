interface StatCardProps {
  eyebrow: string;
  value: string;
  caption?: string;
  valueSize?: string;
}

export function StatCard({ eyebrow, value, caption, valueSize = '34px' }: StatCardProps) {
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
        {value}
      </p>
      {caption && (
        <p className="text-[12px] mt-1" style={{ color: 'var(--crm-muted)' }}>
          {caption}
        </p>
      )}
    </div>
  );
}
