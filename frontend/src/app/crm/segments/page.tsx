'use client';

import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, formatPhone } from '@/lib/crm/format';
import { ReportPage, Card, DataTable } from '@/components/crm/ReportPage';

export default function CrmSegmentsPage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['crm-segments'], queryFn: () => api.getCrmSegments() });
  return (
    <ReportPage title="Segments" icon={Layers} loading={isLoading} error={isError}
      note="Rule-based audiences. Lifecycle segments (Active, At Risk, Dormant…) are tabs on Customers. Gifting and Referrers need festival/referral data not captured yet.">
      {data.map((s: any) => (
        <div key={s.key} className="space-y-2">
          <Card>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold" style={{ color: 'var(--crm-ink)' }}>{s.name}</h2>
              <span className="text-[20px] font-semibold crm-tabular" style={{ color: 'var(--crm-forest)' }}>{s.count}</span>
            </div>
            <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>{s.rule}</p>
          </Card>
          {s.count > 0 && (
            <DataTable head={['Customer', 'Phone', 'Orders', 'Lifetime value']} csv="crm-segment"
              rows={s.top.map((m: any) => [m.name || 'Unnamed', formatPhone(m.phone), m.orders, formatINR(m.ltv)])} />
          )}
        </div>
      ))}
    </ReportPage>
  );
}
