import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-4">
      <div>
        <h1 className="font-fraunces text-[30px] font-semibold tracking-[-0.01em] text-fms-ink leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-fms-muted font-jakarta">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 pt-1">{actions}</div>}
    </div>
  );
}
