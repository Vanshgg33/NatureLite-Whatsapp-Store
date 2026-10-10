import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string;
}

export function EmptyState({ icon: Icon, title, body }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && (
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'var(--crm-sand)' }}
        >
          <Icon className="h-6 w-6" style={{ color: 'var(--crm-muted)' }} />
        </div>
      )}
      <p className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>{title}</p>
      {body && <p className="text-[13px] mt-1.5" style={{ color: 'var(--crm-muted)' }}>{body}</p>}
    </div>
  );
}
