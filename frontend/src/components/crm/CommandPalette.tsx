'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/utils';
import { useAdminAccess } from '@/lib/admin-access';
import { ALL_NAV_ITEMS } from './nav.config';
import { useNavVisibility } from './useNavVisibility';

type Hit = { key: string; label: string; hint: string; href: string };

/** ⌘K / Ctrl+K: jump to any CRM page you can open, or find a customer by name or phone (blueprint G2). */
export default function CommandPalette() {
  const router = useRouter();
  const visible = useNavVisibility();
  const access = useAdminAccess();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dq = useDebouncedValue(q.trim(), 300);
  const canSearchCustomers = !access.restricted || access.can('crm_customers.view');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const { data: customers } = useQuery({
    queryKey: ['crm-palette-customers', dq],
    queryFn: () => api.getCrmCustomers({ search: dq, page: 1 }),
    enabled: open && canSearchCustomers && dq.length >= 3,
  });

  const hits: Hit[] = useMemo(() => {
    const pages = ALL_NAV_ITEMS.filter(visible).filter(i => i.label.toLowerCase().includes(q.trim().toLowerCase()))
      .map(i => ({ key: i.href, label: i.label, hint: 'Page', href: i.href }));
    const people = ((customers?.data ?? []) as any[]).slice(0, 5).map(c => {
      const id = String(c.userId?._id ?? c.userId ?? c._id);
      return { key: 'c' + id, label: c.user?.name ?? c.user?.phone ?? 'Customer', hint: c.user?.phone ?? 'Customer', href: `/crm/customers/${id}` };
    });
    return [...pages.slice(0, 8), ...people];
  }, [q, customers, visible]);

  const go = (h?: Hit) => { if (h) { setOpen(false); router.push(h.href); } };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-lg rounded-[14px] overflow-hidden" style={{ background: 'var(--crm-paper)' }} onClick={e => e.stopPropagation()}>
        <input
          ref={input} value={q} onChange={e => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, hits.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') go(hits[idx]);
          }}
          placeholder="Search pages, or a customer name / phone…" aria-label="Search" role="combobox" aria-expanded aria-controls="crm-palette-list"
          className="w-full px-4 py-3 text-[14px] outline-none" style={{ borderBottom: '1px solid var(--crm-line)', background: 'transparent' }}
        />
        <ul id="crm-palette-list" role="listbox" className="max-h-80 overflow-y-auto py-1">
          {!hits.length && <li className="px-4 py-3 text-[13px]" style={{ color: 'var(--crm-muted)' }}>No matches.</li>}
          {hits.map((h, i) => (
            <li key={h.key} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => go(h)}
              className="flex justify-between px-4 py-2 text-[13px] cursor-pointer" style={i === idx ? { background: 'var(--crm-sand)' } : undefined}>
              <span>{h.label}</span><span style={{ color: 'var(--crm-muted)' }}>{h.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
