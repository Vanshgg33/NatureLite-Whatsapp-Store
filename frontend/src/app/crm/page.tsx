'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Users, Phone, TrendingUp, AlertTriangle, Clock, Flame, CalendarDays, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }

const SEG_PRIORITY: Record<string, { bg: string; accent: string; label: string }> = {
  today:    { bg: '#FFF9EC', accent: '#D97706', label: 'Due Today' },
  overdue:  { bg: '#FFF5F5', accent: '#DC2626', label: 'Overdue' },
  upcoming: { bg: '#EFF6FF', accent: '#2563EB', label: 'Upcoming 7d' },
};

function KpiCard({
  label, value, sub, icon: Icon, accent, href, delay = 0,
}: {
  label: string; value: string; sub?: string; icon: any; accent: string; href?: string; delay?: number;
}) {
  const inner = (
    <div
      className="crm-card crm-count-in group relative overflow-hidden transition-all duration-200"
      style={{ animationDelay: `${delay}ms` }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = `0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px ${accent}30`;
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = '';
        el.style.transform = '';
      }}
    >
      {/* Top accent line */}
      <div className="h-0.5 w-full absolute top-0 left-0" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}60)` }} />

      <div className="p-5 pt-6">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${accent}14` }}>
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </div>
          {href && <ArrowUpRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accent }} />}
        </div>
        <p className="crm-display text-4xl font-semibold leading-none mb-1.5" style={{ color: '#1C1917', fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-0.5" style={{ color: accent }}>{label}</p>
        {sub && <p className="text-[11px]" style={{ color: '#A09A93' }}>{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function MetricCard({
  label, value, sub, icon: Icon, color, delay = 0,
}: {
  label: string; value: string; sub?: string; icon: any; color: string; delay?: number;
}) {
  return (
    <div className="crm-card crm-count-in p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}14` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: '#A09A93' }}>{label}</p>
      </div>
      <p className="text-3xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#1C1917' }}>{value}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: '#A09A93' }}>{sub}</p>}
    </div>
  );
}

const HEAT = [
  { bg: '#F0EDE7', text: '#A09A93' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#FDE68A', text: '#78350F' },
  { bg: '#F59E0B', text: '#ffffff' },
  { bg: '#D97706', text: '#ffffff' },
];
function heatLevel(n: number) { if (!n) return 0; if (n <= 3) return 1; if (n <= 8) return 2; if (n <= 15) return 3; return 4; }

function ReorderCalendar({ data }: { data: { date: string; count: number }[] }) {
  const countMap = new Map(data.map(d => [d.date, d.count]));
  const days: { date: string; label: string; day: string; count: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      label: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      day: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2),
      count: countMap.get(dateStr) ?? 0,
    });
  }
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="crm-card p-6 crm-count-in" style={{ animationDelay: '350ms' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: '#1C1917', fontFamily: "'DM Sans', system-ui" }}>
            <CalendarDays className="h-4 w-4" style={{ color: '#D4A017' }} />
            Reorder Calendar
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>Next 30 days · predicted customer reorders</p>
        </div>
        <div className="flex items-center gap-2">
          {[{ label: '0', level: 0 }, { label: '1–3', level: 1 }, { label: '4–8', level: 2 }, { label: '9–15', level: 3 }, { label: '16+', level: 4 }].map(h => (
            <div key={h.level} className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-sm" style={{ background: HEAT[h.level].bg, border: h.level === 0 ? '1px solid #E8E2D9' : 'none' }} />
              <span className="text-[9px] font-medium" style={{ color: '#A09A93' }}>{h.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-10 gap-1.5">
        {days.map(d => {
          const level = heatLevel(d.count);
          const h = HEAT[level];
          return (
            <div
              key={d.date}
              className="rounded-lg p-1.5 text-center cursor-default transition-transform duration-100 hover:scale-110"
              style={{ background: h.bg, border: level === 0 ? '1px solid #E8E2D9' : 'none' }}
              title={`${d.label}: ${d.count} customers`}
            >
              <p className="text-[8px] font-medium" style={{ color: h.text, opacity: 0.6 }}>{d.day}</p>
              <p className="text-[11px] font-semibold leading-tight" style={{ color: h.text }}>{d.label.split(' ')[1]}</p>
              <p className="text-[10px] font-mono" style={{ color: h.text, opacity: 0.8 }}>{d.count > 0 ? d.count : '·'}</p>
            </div>
          );
        })}
      </div>

      {/* Bar chart row */}
      <div className="mt-4 flex items-end gap-1 h-8">
        {days.map(d => {
          const pct = (d.count / maxCount) * 100;
          return (
            <div
              key={d.date}
              className="flex-1 rounded-t-sm transition-all duration-300"
              style={{ height: `${Math.max(pct, d.count > 0 ? 8 : 2)}%`, background: d.count > 0 ? '#D4A017' : '#E8E2D9', opacity: d.count > 0 ? 0.8 : 0.5 }}
              title={`${d.label}: ${d.count}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function CrmDashboardPage() {
  const { data: dash, isLoading: loadingDash } = useQuery({ queryKey: ['crm-dashboard'], queryFn: () => api.getCrmDashboard() });
  const { data: calendar = [], isLoading: loadingCal } = useQuery({ queryKey: ['crm-calendar'], queryFn: () => api.getCrmCalendar() });

  if (loadingDash) return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
        <p className="text-[12px]" style={{ color: '#A09A93' }}>Loading dashboard…</p>
      </div>
    </div>
  );

  const convRate = dash?.callsToday > 0 ? Math.round((dash.conversionsToday / dash.callsToday) * 100) : 0;

  return (
    <div className="crm-root min-h-full" style={{ background: '#F7F5F0' }}>
      {/* Page header */}
      <div className="bg-white px-7 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #E8E2D9' }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1C1917', fontFamily: "'DM Sans', system-ui" }}>Dashboard</h1>
          <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link href="/crm/queue" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-colors" style={{ background: '#1A3625', color: '#D4A017' }}>
          Open Queue <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="p-7 space-y-6">
        {/* Section label */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: '#A09A93' }}>Retargeting Pipeline</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard label="Due Today" value={String(dash?.dueTodayCount ?? 0)} icon={Clock} accent="#D97706" href="/crm/queue?tab=today" delay={0} />
            <KpiCard label="Overdue" value={String(dash?.overdueCount ?? 0)} icon={Flame} accent="#DC2626" href="/crm/queue?tab=overdue" delay={50} />
            <KpiCard label="Upcoming 7d" value={String(dash?.upcomingCount ?? 0)} icon={CalendarDays} accent="#2563EB" href="/crm/queue?tab=upcoming" delay={100} />
          </div>
        </div>

        {/* Business metrics */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: '#A09A93' }}>Business Overview</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Total Customers" value={String(dash?.totalCustomers ?? 0)} icon={Users} color="#1A3625" delay={150} />
            <MetricCard label="Repeat Rate" value={`${dash?.repeatRate ?? 0}%`} sub="customers with 2+ orders" icon={TrendingUp} color="#16A34A" delay={200} />
            <MetricCard label="Revenue at Risk" value={fmt(dash?.revenueAtRisk ?? 0)} sub="At Risk + Dormant segments" icon={AlertTriangle} color="#DC2626" delay={250} />
          </div>
        </div>

        {/* Today's activity */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: '#A09A93' }}>Today's Activity</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Calls */}
            <div className="crm-card crm-count-in p-5" style={{ animationDelay: '300ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,92,30,0.1)' }}>
                  <Phone className="h-4 w-4" style={{ color: '#7C5C1E' }} />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#A09A93' }}>Calls Today</p>
              </div>
              <p className="text-4xl font-semibold mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#1C1917' }}>{dash?.callsToday ?? 0}</p>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F0EDE7' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min((dash?.callsToday ?? 0) / 50 * 100, 100)}%`, background: 'linear-gradient(90deg, #7C5C1E, #D4A017)' }}
                />
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: '#A09A93' }}>Target: 50 calls/day</p>
            </div>

            {/* Conversions */}
            <div className="crm-card crm-count-in p-5" style={{ animationDelay: '340ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.1)' }}>
                  <CheckCircle2 className="h-4 w-4" style={{ color: '#16A34A' }} />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#A09A93' }}>Conversions</p>
              </div>
              <div className="flex items-end gap-3 mb-3">
                <p className="text-4xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#1C1917' }}>{dash?.conversionsToday ?? 0}</p>
                {convRate > 0 && (
                  <span className="text-sm font-semibold mb-1 px-2 py-0.5 rounded-full" style={{ background: '#DCFCE7', color: '#16A34A' }}>{convRate}% conv.</span>
                )}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F0EDE7' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(convRate * 2, 100)}%`, background: 'linear-gradient(90deg, #16A34A, #22C55E)' }}
                />
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: '#A09A93' }}>of {dash?.callsToday ?? 0} calls made today</p>
            </div>
          </div>
        </div>

        {/* Calendar */}
        {loadingCal ? (
          <div className="crm-card p-6 flex justify-center">
            <div className="h-6 w-6 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ReorderCalendar data={calendar} />
        )}
      </div>
    </div>
  );
}
