'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Phone, CheckCircle2, Clock, Calendar, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { formatIST } from '@/lib/time';

const ROLE_LABEL: Record<string, string> = {
  crm_head:    'CRM Head',
  crm_manager: 'CRM Manager',
  crm_senior:  'Senior Agent',
  crm_viewer:  'Viewer',
};

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string; icon: any; accent: string;
}) {
  return (
    <div className="crm-card-v2 p-5">
      <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-3"
        style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </div>
      <p className="text-[26px] font-semibold leading-none mb-1"
        style={{ fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)', color: 'var(--crm-ink)' }}>
        {value}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{label}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>{sub}</p>}
    </div>
  );
}

export default function EmployeeAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [days, setDays] = useState(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-employee-stats', id, days],
    queryFn: () => api.getCrmEmployeeStats(id, days),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} />
    </div>
  );
  if (isError || !data) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-[14px]" style={{ color: 'var(--crm-danger)' }}>Failed to load stats</p>
    </div>
  );

  const { employee, totalCalls, conversions, convRate, activeHours, activeDays, activityByDay } = data;

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      {/* Header */}
      <div style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
        <div className="px-7 pt-4 pb-6">
          <Link
            href="/crm/admin/employees"
            className="inline-flex items-center gap-1 text-[12px] font-medium mb-4 transition-opacity hover:opacity-70"
            style={{ color: 'var(--crm-muted)' }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Team
          </Link>

          <div className="flex items-center gap-4 flex-wrap">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center text-[20px] font-bold flex-shrink-0"
              style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
            >
              {(employee?.name?.[0] ?? 'A').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[20px] font-semibold" style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans)' }}>
                {employee?.name ?? '—'}
              </h1>
              <p className="text-[13px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
                {ROLE_LABEL[employee?.departmentType] ?? employee?.departmentType}
                {employee?.lastLoginAt && ` · Last login ${formatIST(employee.lastLoginAt, true)}`}
              </p>
            </div>

            {/* Period selector */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl" style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}>
              {[7, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={days === d
                    ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' }
                    : { color: 'var(--crm-muted)' }}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-7 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Calls" value={totalCalls} icon={Phone} accent="var(--crm-amber)" />
          <StatCard label="Conversions" value={conversions} sub={`${convRate}% conv rate`} icon={CheckCircle2} accent="var(--crm-success)" />
          <StatCard label="Active Hours" value={activeHours} sub={`across ${activeDays} days`} icon={Clock} accent="var(--crm-blue)" />
          <StatCard label="Calls/Active Day" value={activeDays > 0 ? Math.round(totalCalls / activeDays) : 0} icon={Activity} accent="var(--crm-forest)" />
        </div>

        {/* Daily activity heatmap */}
        {activityByDay?.length > 0 && (
          <div className="crm-card-v2 p-6">
            <h2 className="text-[14px] font-semibold mb-4" style={{ color: 'var(--crm-ink)' }}>
              Active hours by day (last {days}d)
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {activityByDay.map((d: any) => (
                <div key={d.date} className="flex items-center gap-3">
                  <span className="text-[12px] font-mono w-24 flex-shrink-0" style={{ color: 'var(--crm-muted)' }}>{d.date}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--crm-sand-2)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((d.hours / 10) * 100, 100)}%`,
                        background: 'var(--crm-forest)',
                      }}
                    />
                  </div>
                  <span className="text-[12px] font-semibold w-10 text-right crm-tabular" style={{ color: 'var(--crm-ink)' }}>
                    {d.hours}h
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity type breakdown */}
        {data.activityTypes && Object.keys(data.activityTypes).length > 0 && (
          <div className="crm-card-v2 p-6">
            <h2 className="text-[14px] font-semibold mb-4" style={{ color: 'var(--crm-ink)' }}>Activity breakdown</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(data.activityTypes as Record<string, number>)
                .filter(([k]) => k !== 'heartbeat')
                .map(([type, count]) => (
                  <div key={type} className="p-3 rounded-xl" style={{ background: 'var(--crm-sand)' }}>
                    <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--crm-muted)' }}>
                      {type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[18px] font-semibold crm-tabular"
                      style={{ fontFamily: 'var(--font-serif)', color: 'var(--crm-ink)' }}>
                      {count}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
