import type { ReactNode } from 'react';

export type PillVariant = 'vip' | 'overdue' | 'dueToday' | 'upcoming' | 'neutral' | 'success' | 'danger' | 'warn';

const STYLES: Record<PillVariant, { bg: string; color: string }> = {
  vip:      { bg: 'var(--crm-vip-bg)',     color: 'var(--crm-vip-text)' },
  overdue:  { bg: 'var(--crm-danger-bg)',  color: 'var(--crm-danger)' },
  dueToday: { bg: 'var(--crm-amber-bg)',   color: 'var(--crm-amber)' },
  upcoming: { bg: 'var(--crm-blue-bg)',    color: 'var(--crm-blue)' },
  neutral:  { bg: 'var(--crm-sand-2)',     color: 'var(--crm-muted)' },
  success:  { bg: 'var(--crm-success-bg)', color: 'var(--crm-success)' },
  danger:   { bg: 'var(--crm-danger-bg)',  color: 'var(--crm-danger)' },
  warn:     { bg: 'var(--crm-warn-bg)',    color: 'var(--crm-warn-text)' },
};

interface PillProps {
  variant?: PillVariant;
  children: ReactNode;
  className?: string;
}

export function Pill({ variant = 'neutral', children, className }: PillProps) {
  const s = STYLES[variant];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${className ?? ''}`}
      style={{ background: s.bg, color: s.color }}
    >
      {children}
    </span>
  );
}
