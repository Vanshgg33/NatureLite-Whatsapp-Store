import { Clock } from 'lucide-react';

export function RequestedAt({ at }: { at: string | Date | undefined }) {
  if (!at) return null;
  const formatted = new Date(at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return (
    <span className="pf-requested-chip">
      <Clock className="h-2.5 w-2.5" style={{ color: 'var(--g500, #d4a03a)' }} />
      Requested {formatted}
    </span>
  );
}
