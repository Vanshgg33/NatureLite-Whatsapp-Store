'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Users, FileText, AlertCircle, TrendingUp, IndianRupee, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';

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

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${ICON_BG[color] ?? 'bg-gray-100'}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['billing-dashboard'],
    queryFn: () => api.getBillingDashboard(),
    refetchInterval: 60000,
  });

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header
        title="Dashboard"
        description="Billing overview and quick actions"
        icon={<LayoutDashboard className="h-6 w-6 text-[#2d7a4f]" />}
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* All time */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">All Time</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Revenue" value={fmt(data?.allTime?.total ?? 0)} sub={`${data?.allTime?.count ?? 0} bills`} icon={Globe} color="text-violet-600" />
                <StatCard label="Total Collected" value={fmt(data?.allTime?.collected ?? 0)} icon={TrendingUp} color="text-green-600" />
                <StatCard label="Outstanding Dues" value={fmt(data?.outstanding ?? 0)} icon={AlertCircle} color="text-red-500" />
                <StatCard label="Total Customers" value={String(data?.customerCount ?? 0)} icon={Users} color="text-blue-600" />
              </div>
            </div>

            {/* Today */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Today</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Today's Sales" value={fmt(data?.today?.total ?? 0)} sub={`${data?.today?.count ?? 0} bills`} icon={IndianRupee} color="text-[#2d7a4f]" />
                <StatCard label="Collected Today" value={fmt(data?.today?.collected ?? 0)} icon={TrendingUp} color="text-green-600" />
                <StatCard label="Pending Today" value={fmt((data?.today?.total ?? 0) - (data?.today?.collected ?? 0))} icon={AlertCircle} color="text-red-500" />
              </div>
            </div>

            {/* This month */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">This Month</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Month Sales" value={fmt(data?.month?.total ?? 0)} sub={`${data?.month?.count ?? 0} bills`} icon={FileText} color="text-[#2d7a4f]" />
                <StatCard label="Month Collected" value={fmt(data?.month?.collected ?? 0)} icon={TrendingUp} color="text-green-600" />
                <StatCard label="Month Due" value={fmt(data?.month?.due ?? 0)} icon={AlertCircle} color="text-red-500" />
              </div>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'New Bill', href: '/billing/new', icon: FileText, color: 'bg-[#2d7a4f] text-white' },
                { label: 'Customers', href: '/billing/customers', icon: Users, color: 'bg-blue-50 text-blue-700' },
                { label: 'Unpaid Dues', href: '/billing/dues', icon: AlertCircle, color: 'bg-red-50 text-red-600' },
                { label: 'Sales Reports', href: '/billing/reports', icon: TrendingUp, color: 'bg-amber-50 text-amber-700' },
              ].map(q => (
                <Link key={q.href} href={q.href} className={`${q.color} rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:opacity-90 transition-opacity`}>
                  <q.icon className="h-5 w-5 shrink-0" />
                  <span className="font-medium text-sm">{q.label}</span>
                </Link>
              ))}
            </div>

            {/* Recent bills */}
            {(data?.recentBills ?? []).length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide font-semibold">
                  Recent Bills
                </div>
                <div className="divide-y divide-gray-50">
                  {data.recentBills.map((b: any) => (
                    <div key={b._id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-xs shrink-0">
                        {b.customerName?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm">{b.customerName}</div>
                        <div className="text-xs text-gray-400 font-mono">{b.invoiceNo}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-gray-800 text-sm">{fmt(b.grandTotal)}</div>
                        <div className={`text-xs font-medium ${b.paymentStatus === 'paid' ? 'text-green-500' : b.paymentStatus === 'partial' ? 'text-yellow-500' : 'text-red-500'}`}>
                          {b.paymentStatus}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
