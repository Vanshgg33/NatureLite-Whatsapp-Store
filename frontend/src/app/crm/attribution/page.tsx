'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ticket } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/crm/format';
import { ReportPage, Stat, pctText } from '@/components/crm/ReportPage';

export default function CrmAttributionPage() {
  const [days, setDays] = useState(7);
  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-attribution', days], queryFn: () => api.getCrmAttribution(days) });
  return (
    <ReportPage title="Revenue recovered by CRM" icon={Ticket} loading={isLoading} error={isError}
      note="Last 90 days. An order counts when it lands within the window after a logged call to that customer (latest call wins). Campaign and coupon attribution are not built yet.">
      <label className="text-[13px] flex items-center gap-2">
        Window
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-2 py-1 rounded-lg" style={{ border: '1px solid var(--crm-line)' }}>
          {[3, 7, 14, 30].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
      </label>
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Revenue recovered" value={formatINR(data.attributedRevenue)} />
          <Stat label="Orders recovered" value={data.attributedOrders} />
          <Stat label="Total revenue (90d)" value={formatINR(data.totalRevenue)} />
          <Stat label="Share of revenue" value={pctText(data.sharePct)} />
        </div>
      )}
    </ReportPage>
  );
}
