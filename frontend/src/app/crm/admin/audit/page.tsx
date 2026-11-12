'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { ReportPage, DataTable } from '@/components/crm/ReportPage';

const when = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export default function CrmAuditPage() {
  const [action, setAction] = useState('');
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['crm-audit', action], queryFn: () => api.getCrmAudit(action || undefined) });
  return (
    <ReportPage title="Audit log" icon={ScrollText} loading={isLoading} error={isError} note="Latest 100 entries from the store-wide audit trail (not CRM-only). Before/after diff is not built.">
      <input aria-label="Filter by action" placeholder="Filter by action…" value={action} onChange={e => setAction(e.target.value)} className="px-3 py-2 rounded-xl text-[13px] w-64" style={{ border: '1px solid var(--crm-line)' }} />
      <DataTable head={['When (IST)', 'Who', 'Action', 'On', 'Details']} csv="audit-log" empty="No entries."
        rows={data.map((a: any) => [when(a.createdAt), a.performedByName || a.performedBy, a.action, a.targetModel || '—', a.description || '—'])} />
    </ReportPage>
  );
}
