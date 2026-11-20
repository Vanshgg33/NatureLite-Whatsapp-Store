'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, formatPhone } from '@/lib/crm/format';
import { ReportPage, Card, DataTable } from '@/components/crm/ReportPage';

export default function CrmSegmentsPage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['crm-segments'], queryFn: () => api.getCrmSegments() });
  return (
    <ReportPage title="Segments" icon={Layers} loading={isLoading} error={isError}
      note="Customers by AOV = net lifetime sales (after returns, refunds and cancellations) ÷ valid orders. Updated on every purchase, return, refund or cancellation. Customers with no valid orders are not in any segment.">
      {data.map((s: any) => (
        <div key={s.key} className="space-y-2">
          <Card>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold" style={{ color: 'var(--crm-ink)' }}>{s.name}</h2>
              <Link href={`/crm/customers?aovSegment=${s.key}`} className="text-[20px] font-semibold crm-tabular underline-offset-4 hover:underline" style={{ color: 'var(--crm-forest)' }}>{s.count}</Link>
            </div>
            <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>{s.rule}</p>
          </Card>
          {s.count > 0 && (
            <DataTable head={['Customer', 'Phone', 'Valid orders', 'Net LTV', 'AOV']} csv="crm-segment"
              rows={s.top.map((m: any) => [m.name || 'Unnamed', formatPhone(m.phone), m.orders, formatINR(m.ltv), formatINR(m.aov)])} />
          )}
        </div>
      ))}
    </ReportPage>
  );
}
