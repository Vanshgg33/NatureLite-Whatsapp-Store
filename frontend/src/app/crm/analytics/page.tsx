// frontend/src/app/crm/analytics/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, AlertTriangle, Users, PhoneCall } from 'lucide-react';
import { api } from '@/lib/api';

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  const bg: Record<string, string> = { 'text-green-600': 'bg-green-50', 'text-red-500': 'bg-red-50', 'text-blue-600': 'bg-blue-50', 'text-amber-600': 'bg-amber-50', 'text-[#7C5C1E]': 'bg-[#D4A017]/10' };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
          <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${bg[color] ?? 'bg-gray-100'}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
    </div>
  );
}

const SEGMENT_ORDER = ['New', 'Active', 'Due Soon', 'Overdue', 'At Risk', 'Dormant', 'Lost'];
const SEG_BAR_COLORS: Record<string, string> = {
  'New': 'bg-blue-400', 'Active': 'bg-green-400', 'Due Soon': 'bg-amber-400',
  'Overdue': 'bg-red-400', 'At Risk': 'bg-orange-400', 'Dormant': 'bg-gray-300', 'Lost': 'bg-gray-200',
};

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-analytics'],
    queryFn: () => api.getCrmAnalytics(),
  });

  if (isLoading) return <div className="flex justify-center py-24"><div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" /></div>;

  const total = data?.totalCustomers ?? 0;

  return (
    <div className="min-h-full">
      <div className="border-b bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#D4A017]" /> Analytics</h1>
      </div>
      <div className="p-5 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Customers" value={String(total)} icon={Users} color="text-blue-600" />
          <StatCard label="Repeat Rate" value={`${data?.repeatRate ?? 0}%`} sub="2+ orders" icon={TrendingUp} color="text-green-600" />
          <StatCard label="Revenue at Risk" value={fmt(data?.revenueAtRisk ?? 0)} sub="At Risk + Dormant LTV" icon={AlertTriangle} color="text-red-500" />
          <StatCard label="Calls (30d)" value={String(data?.callsLast30 ?? 0)} icon={PhoneCall} color="text-[#7C5C1E]" />
        </div>

        {/* Segment breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Customer Segments</h3>
          <div className="space-y-2.5">
            {SEGMENT_ORDER.map(seg => {
              const count = data?.segmentCounts?.[seg] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={seg} className="flex items-center gap-3">
                  <span className="text-[12px] text-gray-600 w-20 shrink-0">{seg}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${SEG_BAR_COLORS[seg]}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[12px] text-gray-500 tabular-nums w-12 text-right">{count}</span>
                  <span className="text-[11px] text-gray-400 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
