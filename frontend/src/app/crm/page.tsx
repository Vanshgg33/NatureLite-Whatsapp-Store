'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { useCrmMetrics } from '@/lib/crm/metrics';
import { formatINRCompact } from '@/lib/crm/format';
import { useAdminAuthStore } from '@/lib/admin-store';
import { ProgressRing } from '@/components/crm/ProgressRing';
import { StackedBar, type SegmentSlice } from '@/components/crm/StackedBar';

function istGreeting(name?: string) {
  const h = parseInt(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }), 10);
  const tod = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${tod}, ${name?.split(' ')[0] ?? 'there'}`;
}

const SEG_COLORS: Record<string, string> = {
  new: '#2A4434', active: '#1E7A46', due_soon: '#2457C5', due_today: '#8A5A00',
  overdue: '#B42318', at_risk: '#C05621', dormant: '#5E655F', lost: '#3E4540',
};

function PipelineTile({ count, label, color, href }: { count: number; label: string; color: string; href: string }) {
  return (
    <Link href={href} className="block">
      <div
        className="crm-card-v2 p-4 transition-all duration-150 hover:-translate-y-0.5"
        style={{ borderTop: `3px solid ${color}` }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color }}>{label}</p>
        <p
          className="crm-display text-4xl font-semibold leading-none"
          style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
        >{count}</p>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--crm-muted)' }}>customers</p>
      </div>
    </Link>
  );
}

function ForecastChart({ data }: { data: { date: string; count: number }[] }) {
  const countMap = new Map(data.map(d => [d.date, d.count]));
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return {
      dateStr,
      isToday: dateStr === todayIST,
      isWeekend: [0, 6].includes(d.getDay()),
      count: countMap.get(dateStr) ?? 0,
      label: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    };
  });
  const max = Math.max(...days.map(d => d.count), 1);

  return (
    <div className="crm-card-v2 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-[14px] font-semibold flex items-center gap-1.5"
            style={{ color: 'var(--crm-ink)' }}
          >
            <CalendarDays className="h-4 w-4" style={{ color: 'var(--crm-gold)' }} />
            Forecast · Next 30 Days
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>Predicted reorders per day</p>
        </div>
      </div>

      <div className="flex items-end gap-0.5 h-20">
        {days.map(d => {
          const pct = d.count > 0 ? Math.max((d.count / max) * 100, 8) : 3;
          const bg = d.isToday
            ? 'var(--crm-gold-bright)'
            : d.count > 0
            ? 'var(--crm-gold)'
            : 'var(--crm-sand-2)';
          return (
            <div
              key={d.dateStr}
              className="flex-1 rounded-t-sm transition-all duration-300"
              style={{
                height: `${pct}%`,
                background: bg,
                opacity: d.isWeekend && !d.isToday ? 0.55 : 1,
                minHeight: d.count > 0 ? 4 : 2,
              }}
              title={`${d.label}: ${d.count} customers`}
            />
          );
        })}
      </div>

      {/* X-axis label every 5 days */}
      <div className="flex gap-0.5 mt-1">
        {days.map((d, i) => (
          <div key={d.dateStr} className="flex-1 text-center overflow-hidden">
            {i % 5 === 0 && (
              <span
                className="text-[8px] whitespace-nowrap"
                style={{ color: d.isToday ? 'var(--crm-gold)' : 'var(--crm-muted)' }}
              >
                {d.label.split(' ')[1]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CrmDashboardPage() {
  const { data: m, isLoading } = useCrmMetrics();
  const { data: calendar = [] } = useQuery({
    queryKey: ['crm-calendar'],
    queryFn: () => api.getCrmCalendar(),
  });
  const user = useAdminAuthStore(s => s.user);

  const convRate = (m?.callsToday ?? 0) > 0
    ? Math.round(((m?.conversionsToday ?? 0) / m.callsToday) * 100)
    : 0;
  const remaining = Math.max((m?.target ?? 50) - (m?.callsToday ?? 0), 0);

  const stackSlices: SegmentSlice[] = [
    { label: 'New',      count: m?.new      ?? 0, color: SEG_COLORS.new },
    { label: 'Active',   count: m?.active   ?? 0, color: SEG_COLORS.active },
    { label: 'Due Soon', count: m?.dueSoon  ?? 0, color: SEG_COLORS.due_soon },
    { label: 'Due Today',count: m?.dueToday ?? 0, color: SEG_COLORS.due_today },
    { label: 'Overdue',  count: m?.overdue  ?? 0, color: SEG_COLORS.overdue },
    { label: 'At Risk',  count: m?.atRisk   ?? 0, color: SEG_COLORS.at_risk },
    { label: 'Dormant',  count: m?.dormant  ?? 0, color: SEG_COLORS.dormant },
    { label: 'Lost',     count: m?.lost     ?? 0, color: SEG_COLORS.lost },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="h-8 w-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      {/* § 3.1 Header */}
      <div
        className="px-7 py-5 flex items-center justify-between"
        style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}
      >
        <div>
          <h1
            className="text-[20px] font-semibold"
            style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}
          >
            {istGreeting(user?.name)}
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
            {new Date().toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>
        <Link
          href="/crm/queue"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
        >
          Start calling <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="p-7 space-y-6">
        {/* § 3.3 Hero row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Mission card — dark forest bg */}
          <div
            className="rounded-2xl p-6 flex gap-5 items-center"
            style={{ background: 'var(--crm-forest)' }}
          >
            <ProgressRing value={m?.callsToday ?? 0} target={m?.target ?? 50} />
            <div className="flex-1 min-w-0">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2"
                style={{ color: 'var(--crm-on-dark-muted)' }}
              >
                Today&apos;s Mission
              </p>
              <div className="flex items-baseline gap-2">
                <p
                  className="crm-display text-[34px] font-semibold leading-none"
                  style={{ color: 'var(--crm-gold-bright)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
                >
                  {m?.conversionsToday ?? 0}
                </p>
                <span className="text-[13px]" style={{ color: 'var(--crm-on-dark-muted)' }}>conversions</span>
              </div>
              {convRate > 0 && (
                <p className="text-[12px] mt-1" style={{ color: 'var(--crm-side-muted)' }}>
                  {convRate}% conversion rate
                </p>
              )}
              <p className="text-[11px] mt-2" style={{ color: 'var(--crm-side-text)' }}>
                Target: {m?.target ?? 50} calls ·{' '}
                {remaining > 0 ? `${remaining} remaining` : 'Done!'}
              </p>
            </div>
          </div>

          {/* Revenue at risk */}
          <div className="crm-card-v2 p-6 flex flex-col justify-between">
            <div>
              <p
                className="text-[11px] font-bold uppercase tracking-[0.14em] mb-1"
                style={{ color: 'var(--crm-muted)' }}
              >
                Revenue at Risk
              </p>
              <p
                className="crm-display text-[38px] font-semibold leading-none"
                style={{ color: 'var(--crm-danger)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
              >
                {formatINRCompact(m?.revenueAtRisk ?? 0)}
              </p>
              <p className="text-[12px] mt-1" style={{ color: 'var(--crm-muted)' }}>
                At Risk + Dormant LTV
              </p>
            </div>
            <div className="flex gap-6 mt-4 pt-4" style={{ borderTop: '1px solid var(--crm-line)' }}>
              <div>
                <p
                  className="crm-display text-[22px] font-semibold crm-tabular"
                  style={{ color: SEG_COLORS.at_risk, fontFamily: 'var(--font-serif, Fraunces)' }}
                >
                  {m?.atRisk ?? 0}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>At Risk</p>
              </div>
              <div>
                <p
                  className="crm-display text-[22px] font-semibold crm-tabular"
                  style={{ color: SEG_COLORS.dormant, fontFamily: 'var(--font-serif, Fraunces)' }}
                >
                  {m?.dormant ?? 0}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>Dormant</p>
              </div>
              <div>
                <p
                  className="crm-display text-[22px] font-semibold crm-tabular"
                  style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces)' }}
                >
                  {m?.repeatRate ?? 0}%
                </p>
                <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>Repeat Rate</p>
              </div>
            </div>
          </div>
        </div>

        {/* § 3.4 Pipeline tiles — 5 urgent segments */}
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3"
            style={{ color: 'var(--crm-muted)' }}
          >
            Retargeting Pipeline
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <PipelineTile count={m?.dueSoon  ?? 0} label="Due Soon"  color={SEG_COLORS.due_soon}  href="/crm/queue?segment=due_soon" />
            <PipelineTile count={m?.dueToday ?? 0} label="Due Today" color={SEG_COLORS.due_today} href="/crm/queue?segment=due_today" />
            <PipelineTile count={m?.overdue  ?? 0} label="Overdue"   color={SEG_COLORS.overdue}   href="/crm/queue?segment=overdue" />
            <PipelineTile count={m?.atRisk   ?? 0} label="At Risk"   color={SEG_COLORS.at_risk}   href="/crm/queue?segment=at_risk" />
            <PipelineTile count={m?.dormant  ?? 0} label="Dormant"   color={SEG_COLORS.dormant}   href="/crm/queue?segment=dormant" />
          </div>
        </div>

        {/* § 3.5 Health row — stacked bar + legend */}
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3"
            style={{ color: 'var(--crm-muted)' }}
          >
            Customer Health
          </p>
          <div className="crm-card-v2 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold" style={{ color: 'var(--crm-ink)' }}>
                Segment Distribution · {m?.total ?? 0} customers
              </p>
              <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>
                {m?.repeatRate ?? 0}% repeat
              </p>
            </div>
            <StackedBar segments={stackSlices} total={m?.total ?? 0} />
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
              {stackSlices.filter(s => s.count > 0).map(s => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>
                    {s.label}{' '}
                    <span className="font-semibold crm-tabular" style={{ color: 'var(--crm-ink-2)' }}>
                      {s.count}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* § 3.6 Forecast chart */}
        <ForecastChart data={calendar as { date: string; count: number }[]} />
      </div>
    </div>
  );
}
