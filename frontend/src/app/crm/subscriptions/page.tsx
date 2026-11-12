'use client';

import { useQuery } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, formatPhone } from '@/lib/crm/format';
import { ReportPage, Stat, DataTable } from '@/components/crm/ReportPage';

const day = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) : '—');

// Read-only: pause / skip / renewal reminders need the subscription engine, which does not exist in the backend yet.
export default function CrmSubscriptionsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-subscriptions'], queryFn: () => api.getCrmSubscriptions() });
  const c = data?.counts ?? {};
  return (
    <ReportPage title="Subscriptions" icon={Repeat} loading={isLoading} error={isError} note="Read-only view of standing orders">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {['active', 'paused', 'cancelled', 'completed'].map(s => (
          <Stat key={s} label={`${s} (${formatINR(c[s]?.amount ?? 0)} / delivery)`} value={c[s]?.count ?? 0} />
        ))}
      </div>
      <DataTable head={['Customer', 'Phone', 'Frequency', 'Status', 'Next delivery', 'Amount']}
        empty="No subscriptions yet."
        rows={(data?.items ?? []).map((s: any) => [s.user?.name || 'Unnamed', formatPhone(s.user?.phone), s.frequency, s.status, day(s.nextDeliveryDate), formatINR(s.totalAmount)])} />
    </ReportPage>
  );
}
