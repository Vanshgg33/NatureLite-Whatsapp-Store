'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { GitMerge } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/crm/format';

// Detection only: merging moves orders, wallets, carts and chats across many collections, so it is a later, separately tested step.
// This route also stops customers/[id] from capturing "duplicates" as a customer id.
export default function CrmDuplicatesPage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['crm-duplicates'], queryFn: () => api.getCrmDuplicates() });
  return (
    <div className="min-h-full p-7 space-y-4" style={{ background: 'var(--crm-sand)' }}>
      <div className="flex items-center gap-2.5">
        <GitMerge className="h-5 w-5" style={{ color: 'var(--crm-gold)' }} />
        <h1 className="text-[20px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Duplicate customers</h1>
        <span className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>same phone written differently (+91, spaces, 0-prefix)</span>
      </div>
      {isLoading && <p>Loading…</p>}
      {isError && <p>Could not load duplicates.</p>}
      {!isLoading && !isError && !data.length && <p style={{ color: 'var(--crm-muted)' }}>No duplicate phone numbers found.</p>}
      {data.map((g: any) => (
        <div key={g.phone} className="rounded-[14px] p-4" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
          <p className="font-semibold mb-2 crm-tabular">{formatPhone(g.phone)}</p>
          {g.users.map((u: any) => (
            <p key={u._id} className="text-[13px]">
              <Link href={`/crm/customers/${u._id}`} className="underline">{u.name || 'Unnamed'}</Link>{' '}
              <span style={{ color: 'var(--crm-muted)' }}>stored as {u.phone}{u.email ? ` · ${u.email}` : ''}</span>
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
