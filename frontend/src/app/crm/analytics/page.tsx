'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, AlertTriangle, Users, PhoneCall } from 'lucide-react';
import { api } from '@/lib/api';

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }

const SEGMENT_ORDER = ['New', 'Active', 'Due Soon', 'Overdue', 'At Risk', 'Dormant', 'Lost'];
const SEG_COLORS: Record<string, string> = {
  'New': '#3B82F6', 'Active': '#22C55E', 'Due Soon': '#F59E0B',
  'Overdue': '#EF4444', 'At Risk': '#F97316', 'Dormant': '#9CA3AF', 'Lost': '#D1D5DB',
};

function KpiCard({ label, value, sub, icon: Icon, accent, delay = 0 }: { label: string; value: string; sub?: string; icon: any; accent: string; delay?: number }) {
  return (
    <div className="bg-white rounded-xl overflow-hidden crm-count-in" style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', animationDelay: `${delay}ms` }}>
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}60)` }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}14` }}>
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </div>
        </div>
        <p className="text-3xl font-semibold leading-none mb-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#1C1917' }}>{value}</p>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{label}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: '#A09A93' }}>{sub}</p>}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['crm-analytics'], queryFn: () => api.getCrmAnalytics() });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const segs: { segment: string; count: number }[] = data?.segmentBreakdown ?? [];
  const segsOrdered = SEGMENT_ORDER.map(s => ({ segment: s, count: segs.find((x: any) => x.segment === s)?.count ?? 0 })).filter(s => s.count > 0);
  const maxSeg = Math.max(...segsOrdered.map(s => s.count), 1);
  const totalSeg = segsOrdered.reduce((a, b) => a + b.count, 0);

  return (
    <div className="crm-root min-h-full" style={{ background: '#F7F5F0' }}>
      <div className="bg-white px-7 py-5" style={{ borderBottom: '1px solid #E8E2D9' }}>
        <h1 className="text-xl font-semibold flex items-center gap-2.5" style={{ color: '#1C1917' }}>
          <BarChart3 className="h-5 w-5" style={{ color: '#D4A017' }} />
          Analytics
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>CRM performance overview</p>
      </div>

      <div className="p-7 space-y-6">
        {/* KPIs */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: '#A09A93' }}>Key Metrics</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard label="Total Customers" value={String(data?.totalCustomers ?? 0)} icon={Users} accent="#1A3625" delay={0} />
            <KpiCard label="Repeat Rate" value={`${data?.repeatRate ?? 0}%`} sub="2+ orders" icon={TrendingUp} accent="#16A34A" delay={50} />
            <KpiCard label="Calls This Month" value={String(data?.callsThisMonth ?? 0)} icon={PhoneCall} accent="#7C5C1E" delay={100} />
            <KpiCard label="Revenue at Risk" value={fmt(data?.revenueAtRisk ?? 0)} sub="At Risk + Dormant" icon={AlertTriangle} accent="#DC2626" delay={150} />
          </div>
        </div>

        {/* Segment breakdown */}
        <div className="bg-white rounded-xl p-6 crm-count-in" style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', animationDelay: '200ms' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold" style={{ color: '#1C1917' }}>Customer Segments</h2>
              <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>{totalSeg} customers across {segsOrdered.length} segments</p>
            </div>
          </div>

          <div className="space-y-3">
            {segsOrdered.map(({ segment, count }) => {
              const color = SEG_COLORS[segment] ?? '#9CA3AF';
              const pct = Math.round((count / totalSeg) * 100);
              return (
                <div key={segment}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[13px] font-medium" style={{ color: '#1C1917' }}>{segment}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-mono" style={{ color: '#A09A93' }}>{count}</span>
                      <span className="text-[11px] font-bold w-8 text-right" style={{ color }}>{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: `${color}18` }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(count / maxSeg) * 100}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Donut-style proportion row */}
          {segsOrdered.length > 0 && (
            <div className="mt-5 flex rounded-full overflow-hidden h-2.5" style={{ background: '#F0EDE7' }}>
              {segsOrdered.map(({ segment, count }) => (
                <div
                  key={segment}
                  className="h-full transition-all duration-700"
                  style={{ width: `${(count / totalSeg) * 100}%`, background: SEG_COLORS[segment] ?? '#9CA3AF' }}
                  title={`${segment}: ${count}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Conversion funnel */}
        {data?.funnelStats && (
          <div className="bg-white rounded-xl p-6 crm-count-in" style={{ border: '1px solid #E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', animationDelay: '280ms' }}>
            <h2 className="text-base font-semibold mb-5" style={{ color: '#1C1917' }}>Call Outcome Funnel</h2>
            <div className="space-y-2.5">
              {Object.entries(data.funnelStats as Record<string, number>).map(([outcome, count], idx) => {
                const max = Math.max(...Object.values(data.funnelStats as Record<string, number>), 1);
                const OUTCOME_COLORS: Record<string, string> = {
                  converted: '#22C55E', callback: '#3B82F6', interested: '#F59E0B',
                  not_interested: '#6B7280', no_answer: '#9CA3AF', wrong_number: '#EF4444',
                };
                const color = OUTCOME_COLORS[outcome] ?? '#9CA3AF';
                return (
                  <div key={outcome} className="flex items-center gap-3" style={{ animationDelay: `${idx * 30}ms` }}>
                    <p className="text-[12px] w-28 text-right font-medium capitalize" style={{ color: '#6B6560' }}>{outcome.replace('_', ' ')}</p>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0EDE7' }}>
                      <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: color }} />
                    </div>
                    <p className="text-[13px] font-semibold w-10 text-right" style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#1C1917' }}>{count}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
