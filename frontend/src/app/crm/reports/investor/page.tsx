'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/crm/format';
import { ReportPage, Stat, DataTable, pctText } from '@/components/crm/ReportPage';

export default function CrmInvestorPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-investor'], queryFn: () => api.getCrmInvestor() });
  const monthly: any[] = data?.monthly ?? [];
  const cur = monthly[monthly.length - 1];
  return (
    <ReportPage title="Investor snapshot" icon={Briefcase} loading={isLoading} error={isError}
      note={data ? `As of ${new Date(data.asOf).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · aggregates only. LTV:CAC is on Acquisition; gross margin and share links are not built yet.` : undefined}>
      <style>{`@media print { aside, .crm-no-print { display: none !important; } main { overflow: visible !important; } }`}</style>
      <button onClick={() => window.print()} className="crm-no-print text-[13px] underline self-start">Save as PDF (opens the print dialog)</button>
      {cur && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={`Revenue ${cur.month}`} value={formatINR(cur.revenue)} />
          <Stat label="MoM growth" value={pctText(cur.momGrowthPct)} />
          <Stat label={`90-day repeat rate (of ${data.repeatRateBase})`} value={pctText(data.repeatRate90d)} />
          <Stat label="AOV" value={formatINR(cur.aov)} />
        </div>
      )}
      <h2 className="font-semibold" style={{ color: 'var(--crm-ink)' }}>Monthly</h2>
      <DataTable head={['Month', 'Revenue', 'Orders', 'MoM', 'New customers', 'Repeat customers']} csv="investor-monthly"
        rows={monthly.map(m => [m.month, formatINR(m.revenue), m.orders, pctText(m.momGrowthPct), m.newCustomers, m.repeatCustomers])} />
      <h2 className="font-semibold" style={{ color: 'var(--crm-ink)' }}>Cohort retention (% of cohort ordering again)</h2>
      <DataTable head={['Cohort', 'Size', 'Month +1', '+2', '+3', '+4', '+5']}
        rows={(data?.cohorts ?? []).map((c: any) => [c.cohort, c.size, ...c.retention.map(pctText)])} />
    </ReportPage>
  );
}
