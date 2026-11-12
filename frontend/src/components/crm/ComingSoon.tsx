'use client';

import { usePathname } from 'next/navigation';
import { navItemForPath } from './nav.config';

export default function ComingSoon() {
  const item = navItemForPath(usePathname());
  const Icon = item?.icon;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      {Icon && <Icon className="h-9 w-9" style={{ color: 'var(--crm-gold)' }} />}
      <h1 className="text-xl font-semibold" style={{ color: 'var(--crm-ink)' }}>{item?.label ?? 'Page not found'}</h1>
      <p className="max-w-sm text-sm" style={{ color: 'var(--crm-ink)', opacity: 0.6 }}>
        {item
          ? `Planned in CRM Blueprint v2 as ${item.module} (${item.priority}). Not built yet.`
          : 'This CRM page does not exist.'}
      </p>
    </div>
  );
}
