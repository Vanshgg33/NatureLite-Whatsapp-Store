'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Users, FileText, AlertCircle, TrendingUp, TrendingDown, IndianRupee, Globe, ChevronRight, AlertTriangle } from 'lucide-react';
import { billsViewHref } from '@/lib/billing/bill-views';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';
import { WaSendButton } from '@/components/billing/wa-send-button';
import { useCountUp } from '@/lib/useCountUp';

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ICON_BG: Record<string, string> = {
  'text-[#2d7a4f]': 'bg-[#e8f5ee]',
  'text-green-600': 'bg-green-100',
  'text-blue-600': 'bg-blue-100',
  'text-red-500': 'bg-red-100',
  'text-violet-600': 'bg-violet-100',
};

const TAG_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  B2B:            { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  Transport:      { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  'Home Delivery':{ bg: 'bg-teal-50',   text: 'text-teal-700',   dot: 'bg-teal-400' },
  'Store/Retail': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  Wholesale:      { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  Retail:         { bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-400' },
  'B2B Order':    { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  'Transport Order': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  'Home Delivery Order': { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-400' },
  'Store Order':  { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
};

// every card opens the full list behind its number (same filters, so the totals match)
const CARD = 'group block bg-white border border-gray-200 rounded-lg p-4 transition-all duration-150 hover:border-[#2d7a4f]/40 hover:shadow-sm hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/50';

function StatCard({ label, amount, show = fmt, sub, icon: Icon, color, href }: { label: string; amount: number; show?: (n: number) => string; sub?: string; icon: any; color: string; href: string }) {
  const shown = useCountUp(amount);
  const value = show(amount);
  return (
    <Link href={href} className={`${CARD} nl-card--hover`} aria-label={`${label}: ${value}. Open details`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
          <p className={`text-[28px] leading-tight font-bold tabular-nums nl-title ${color}`}>{show(shown)}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
          <p className="text-[11px] text-[#2d7a4f] mt-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
            View details <ChevronRight className="h-3 w-3" />
          </p>
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${ICON_BG[color] ?? 'bg-gray-100'}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['billing-dashboard'],
    queryFn: () => api.getBillingDashboard(),
    refetchInterval: 60000,
  });

  return (
    <div className="min-h-full">
      <Header
        title="Dashboard"
        description="Billing overview"
        icon={<LayoutDashboard className="h-5 w-5 text-[#2d7a4f]" />}
      />

      <div className="p-4 md:p-5 space-y-4">
        {isLoading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3" role="status" aria-label="Loading dashboard">
            <div className="nl-skeleton w-1/3" /><div className="nl-skeleton w-2/3" /><div className="nl-skeleton w-1/2" />
          </div>
        ) : isError ? (
          <div role="alert" className="nl-error bg-white border border-red-200 rounded-lg p-6 text-center text-sm text-red-600">
            <AlertTriangle className="inline h-4 w-4 mr-1" /> Could not load the dashboard. <button onClick={() => refetch()} className="underline">Try again</button>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            {/* All time */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">All Time</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard href={billsViewHref('revenue')} label="Total Revenue" amount={data?.allTime?.total ?? 0} sub={`${data?.allTime?.count ?? 0} bills`} icon={Globe} color="text-violet-600" />
                <StatCard href={billsViewHref('collected')} label="Total Collected" amount={data?.allTime?.collected ?? 0} icon={TrendingUp} color="text-green-600" />
                <StatCard href={billsViewHref('outstanding')} label="Outstanding Dues" amount={data?.outstanding ?? 0} icon={AlertCircle} color="text-red-500" />
                <StatCard href="/billing/customers" label="Total Customers" amount={data?.customerCount ?? 0} show={(n) => Math.round(n).toLocaleString('en-IN')} icon={Users} color="text-blue-600" />
              </div>
            </div>

            {/* Today */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Today</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard href={billsViewHref('today')} label="Today's Sales" amount={data?.today?.total ?? 0} sub={`${data?.today?.count ?? 0} bills`} icon={IndianRupee} color="text-[#2d7a4f]" />
                <StatCard href={billsViewHref('today-collected')} label="Collected Today" amount={data?.today?.collected ?? 0} icon={TrendingUp} color="text-green-600" />
                <StatCard href={billsViewHref('today-pending')} label="Pending Today" amount={(data?.today?.total ?? 0) - (data?.today?.collected ?? 0)} icon={AlertCircle} color="text-red-500" />
              </div>
            </div>

            {/* This month */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">This Month</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard href={billsViewHref('month')} label="Month Sales" amount={data?.month?.total ?? 0} sub={`${data?.month?.count ?? 0} bills`} icon={FileText} color="text-[#2d7a4f]" />
                <StatCard href={billsViewHref('month-collected')} label="Month Collected" amount={data?.month?.collected ?? 0} icon={TrendingUp} color="text-green-600" />
                <StatCard href={billsViewHref('month-due')} label="Month Due" amount={data?.month?.due ?? 0} icon={AlertCircle} color="text-red-500" />
              </div>
            </div>

            {/* Tag breakdown — this month */}
            {(data?.tagStats ?? []).length > 0 && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">This Month — By Tag</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {(data.tagStats as any[]).map((t: any) => {
                    const colors = TAG_COLORS[t.tag] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' };
                    return (
                      <Link key={t.tag ?? 'none'} href={t.tag ? billsViewHref('channel', { channel: t.tag }) : billsViewHref('month')}
                        aria-label={`${t.tag ?? 'No channel'}: ${fmt(t.total)} this month. Open bills`}
                        className={`${colors.bg} block border border-white rounded-lg p-3 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/50`}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`h-2 w-2 rounded-full ${colors.dot} shrink-0`} />
                          <span className={`text-[10px] font-semibold truncate ${colors.text}`}>{t.tag}</span>
                        </div>
                        <p className={`text-base font-bold tabular-nums ${colors.text}`}>{fmt(t.total)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{t.count} bills</p>
                        {t.trend !== null && (
                          <div className={`flex items-center gap-0.5 mt-1 text-[10px] font-medium ${t.trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {t.trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {t.trend >= 0 ? '+' : ''}{t.trend}% vs last month
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'New Bill', href: '/billing/new', icon: FileText, color: 'bg-[#2d7a4f] text-white' },
                { label: 'Customers', href: '/billing/customers', icon: Users, color: 'bg-blue-50 text-blue-700 border border-blue-200' },
                { label: 'Unpaid Dues', href: '/billing/dues', icon: AlertCircle, color: 'bg-red-50 text-red-600 border border-red-200' },
                { label: 'Sales Reports', href: '/billing/reports', icon: TrendingUp, color: 'bg-amber-50 text-amber-700 border border-amber-200' },
              ].map(q => (
                <Link key={q.href} href={q.href} className={`${q.color} rounded-lg p-3.5 flex items-center gap-2.5 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#2d7a4f]/50`}>
                  <q.icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium text-sm">{q.label}</span>
                </Link>
              ))}
            </div>

            {/* Recent bills */}
            {(data?.recentBills ?? []).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide font-semibold flex items-center">
                  Recent Bills
                  <Link href="/billing/bills" className="ml-auto normal-case tracking-normal text-[11px] text-[#2d7a4f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/50 rounded">All bills →</Link>
                </div>
                <div className="divide-y divide-gray-100">
                  {data.recentBills.map((b: any) => (
                    <div key={b._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                      {/* the row opens the bill; WhatsApp stays a separate button (no button inside a link) */}
                      <Link href={`/billing/invoice/${b._id}`} aria-label={`Open ${b.invoiceNo} for ${b.customerName}`}
                        className="flex flex-1 min-w-0 items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d7a4f]/50">
                      <div className="h-8 w-8 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-xs shrink-0">
                        {(b.customerName || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm">{b.customerName}</div>
                        <div className="text-xs text-gray-400 font-mono">{b.invoiceNo}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-gray-800 text-sm">{fmt(b.grandTotal)}</div>
                        <span className="nl-pill mt-0.5" data-status={b.paymentStatus}>{b.paymentStatus}</span>
                      </div>
                      </Link>
                      <WaSendButton billId={b._id} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
