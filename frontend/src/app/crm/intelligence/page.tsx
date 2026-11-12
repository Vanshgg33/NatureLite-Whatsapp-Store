'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, formatPhone } from '@/lib/crm/format';
import { ReportPage, DataTable } from '@/components/crm/ReportPage';

export default function CrmIntelligencePage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['crm-intelligence'], queryFn: () => api.getCrmIntelligence() });
  return (
    <ReportPage title="Intelligence" icon={Sparkles} loading={isLoading} error={isError}
      note="Rule-based churn risk: days late ÷ the customer's reorder cycle (≥2 high, ≥1 medium). Sorted by value × days late. Next-best product, best call time and discount sensitivity are not built.">
      <DataTable head={['Customer', 'Phone', 'Segment', 'Days late', 'Lifetime value', 'Usual category', 'Churn risk', '']} csv="churn-risk" empty="No at-risk customers."
        rows={data.map((c: any) => [c.name || 'Unnamed', formatPhone(c.phone), c.segment, c.daysLate, formatINR(c.ltv), c.topCategory || '—', c.churnRisk,
          <Link key={c.customerId} href={`/crm/customers/${c.customerId}`} className="underline">Open</Link>])} />
    </ReportPage>
  );
}
