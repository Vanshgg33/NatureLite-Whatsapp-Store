'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/crm/format';
import { ReportPage, DataTable } from '@/components/crm/ReportPage';

const when = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export default function CrmCallbacksPage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['crm-callbacks'], queryFn: () => api.getCrmCallbacks(), refetchInterval: 60_000 });
  const overdue = data.filter((c: any) => c.overdue);
  const upcoming = data.filter((c: any) => !c.overdue);
  const table = (rows: any[], empty: string) => (
    <DataTable head={['Customer', 'Phone', 'Due (IST)', '']} empty={empty}
      rows={rows.map(c => [c.name || 'Unnamed', formatPhone(c.phone), when(c.callbackAt), <Link key={c.id} href={`/crm/customers/${c.customerId}`} className="underline">Open</Link>])} />
  );
  return (
    <ReportPage title="Callbacks" icon={CalendarClock} loading={isLoading} error={isError} note="Promised callbacks from logged calls. Drag-to-reschedule and adherence % are not built.">
      <h2 className="font-semibold" style={{ color: 'var(--crm-danger)' }}>Overdue ({overdue.length})</h2>
      {table(overdue, 'No overdue callbacks.')}
      <h2 className="font-semibold" style={{ color: 'var(--crm-ink)' }}>Upcoming ({upcoming.length})</h2>
      {table(upcoming, 'No upcoming callbacks.')}
    </ReportPage>
  );
}
