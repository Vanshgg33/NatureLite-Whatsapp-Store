'use client';

import { useQuery } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import { api } from '@/lib/api';
import { ReportPage, DataTable } from '@/components/crm/ReportPage';

const STALE_HOURS = 48;

export default function CrmIntegrationsPage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['crm-integrations'], queryFn: () => api.getCrmIntegrations() });
  return (
    <ReportPage title="Integrations" icon={Plug} loading={isLoading} error={isError}
      note={`Shows when each feed last produced data; quiet for over ${STALE_HOURS}h is flagged. IMS, Cost Tracker, Purchase Flow and TaskOS links are not built.`}>
      <DataTable head={['Feed', 'Last activity (IST)', 'Status']}
        rows={data.map((i: any) => {
          const hrs = i.lastAt ? (Date.now() - +new Date(i.lastAt)) / 3_600_000 : Infinity;
          return [i.name, i.lastAt ? new Date(i.lastAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never', hrs > STALE_HOURS ? 'Quiet' : 'OK'];
        })} />
    </ReportPage>
  );
}
