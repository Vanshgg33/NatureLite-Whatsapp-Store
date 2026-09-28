'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Users, Phone, TrendingUp, AlertTriangle, Clock, Flame, CalendarDays, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }

const ICON_BG: Record<string, string> = {
  'text-amber-600': 'bg-amber-50',
  'text-red-500': 'bg-red-50',
  'text-blue-600': 'bg-blue-50',
  'text-green-600': 'bg-green-50',
  'text-violet-600': 'bg-violet-50',
  'text-[#7C5C1E]': 'bg-[#D4A017]/10',
};

function StatCard({
  label, value, sub, icon: Icon, color, href,
}: {
  label: string; value: string; sub?: string; icon: any; color: string; href?: string;
}) {
  const inner = (
    <div className={cn(
      'bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3',
      href && 'hover:border-[#D4A017]/50 hover:bg-[#FAF7F2] transition-colors cursor-pointer',
    )}>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
        <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', ICON_BG[color] ?? 'bg-gray-100')}>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const HEAT_COLORS = [
  'bg-gray-100 text-gray-400',
  'bg-amber-100 text-amber-700',
  'bg-amber-200 text-amber-800',
  'bg-amber-400 text-white',
  'bg-amber-600 text-white',
];

function heatLevel(count: number) {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 8) return 2;
  if (count <= 15) return 3;
  return 4;
}

function ReorderCalendar({ data }: { data: { date: string; count: number }[] }) {
  const countMap = new Map(data.map(d => [d.date, d.count]));

  const days: { date: string; label: string; day: string; count: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      label: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      count: countMap.get(dateStr) ?? 0,
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#D4A017]" /> Reorder Calendar
        </h2>
        <p className="text-[11px] text-gray-400">Next 30 days · customers expected to reorder</p>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
        {days.map(d => (
          <div
            key={d.date}
            className={cn('rounded-lg p-2 text-center', HEAT_COLORS[heatLevel(d.count)])}
            title={`${d.label}: ${d.count} customers`}
          >
            <p className="text-[9px] font-medium opacity-60">{d.day}</p>
            <p className="text-[11px] font-semibold leading-tight">{d.label.split(' ')[1]}</p>
            <p className="text-[10px] font-mono mt-0.5">{d.count > 0 ? d.count : '—'}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <p className="text-[10px] text-gray-400 font-medium">Intensity:</p>
        {['None', '1–3', '4–8', '9–15', '16+'].map((label, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className={cn('h-3 w-3 rounded-sm', HEAT_COLORS[i].split(' ')[0])} />
            <span className="text-[10px] text-gray-500">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CrmDashboardPage() {
  const { data: dash, isLoading: loadingDash } = useQuery({
    queryKey: ['crm-dashboard'],
    queryFn: () => api.getCrmDashboard(),
  });

  const { data: calendar = [], isLoading: loadingCal } = useQuery({
    queryKey: ['crm-calendar'],
    queryFn: () => api.getCrmCalendar(),
  });

  if (loadingDash) return (
    <div className="flex justify-center py-24">
      <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-full">
      <div className="border-b bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview · today</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Retargeting row */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Retargeting</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Due Today" value={String(dash?.dueTodayCount ?? 0)} icon={Clock} color="text-amber-600" href="/crm/queue?tab=today" />
            <StatCard label="Overdue" value={String(dash?.overdueCount ?? 0)} icon={Flame} color="text-red-500" href="/crm/queue?tab=overdue" />
            <StatCard label="Upcoming (7d)" value={String(dash?.upcomingCount ?? 0)} icon={CalendarDays} color="text-blue-600" href="/crm/queue?tab=upcoming" />
          </div>
        </div>

        {/* Business row */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Business</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total Customers" value={String(dash?.totalCustomers ?? 0)} icon={Users} color="text-[#7C5C1E]" href="/crm/customers" />
            <StatCard label="Repeat Rate" value={`${dash?.repeatRate ?? 0}%`} sub="2+ orders" icon={TrendingUp} color="text-green-600" />
            <StatCard label="Revenue at Risk" value={fmt(dash?.revenueAtRisk ?? 0)} sub="At Risk + Dormant LTV" icon={AlertTriangle} color="text-red-500" />
          </div>
        </div>

        {/* Today's activity row */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Today's Activity</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Calls Today" value={String(dash?.callsToday ?? 0)} icon={Phone} color="text-violet-600" />
            <StatCard
              label="Conversions Today"
              value={String(dash?.conversionsToday ?? 0)}
              sub={dash?.callsToday > 0 ? `${Math.round((dash.conversionsToday / dash.callsToday) * 100)}% conv. rate` : undefined}
              icon={CheckCircle2}
              color="text-green-600"
            />
          </div>
        </div>

        {/* Calendar */}
        {loadingCal ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex justify-center">
            <div className="h-6 w-6 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ReorderCalendar data={calendar} />
        )}
      </div>
    </div>
  );
}
