'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy, TrendingUp, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/header';

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TAG_COLORS: Record<string, string> = {
  B2B: 'bg-blue-100 text-blue-700',
  Transport: 'bg-orange-100 text-orange-700',
  'Home Delivery': 'bg-teal-100 text-teal-700',
  'Store/Retail': 'bg-purple-100 text-purple-700',
  Wholesale: 'bg-amber-100 text-amber-700',
  Retail: 'bg-pink-100 text-pink-700',
};

export default function InsightsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['billing-insights-customers'],
    queryFn: () => api.getBillingTopCustomers(200),
  });

  const totalRevenue = data.reduce((s: number, c: any) => s + c.totalPurchase, 0);

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header
        title="Customer Insights"
        description="Top customers ranked by total purchase value"
        icon={<Trophy className="h-6 w-6 text-amber-500" />}
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Top 3 podium */}
        {!isLoading && data.length >= 3 && (
          <div className="grid grid-cols-3 gap-3">
            {[data[1], data[0], data[2]].map((c: any, i) => {
              const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
              const medal = ['🥇', '🥈', '🥉'][rank - 1];
              const height = rank === 1 ? 'pt-2' : rank === 2 ? 'pt-6' : 'pt-10';
              return (
                <div key={c._id} className={`bg-white rounded-2xl shadow-sm p-4 text-center ${height}`}>
                  <div className="text-2xl mb-1">{medal}</div>
                  <div className="h-10 w-10 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-sm mx-auto mb-2">
                    {c.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="font-semibold text-gray-800 text-sm truncate">{c.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.phone}</div>
                  <div className="font-bold text-[#2d7a4f] mt-1 text-sm">{fmt(c.totalPurchase)}</div>
                  <div className="text-xs text-gray-400">{c.orderCount} orders</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-[#2d7a4f] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No customer purchase data yet.</div>
          ) : (
            <>
              <div className="flex gap-6 px-5 py-3 border-b bg-gray-50 text-sm">
                <span className="text-gray-500">{data.length} customers</span>
                <span className="font-semibold text-gray-800">{fmt(totalRevenue)} total revenue</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3 font-medium">#</th>
                      <th className="text-left px-4 py-3 font-medium">Customer</th>
                      <th className="text-left px-4 py-3 font-medium">Tags</th>
                      <th className="text-right px-4 py-3 font-medium">Orders</th>
                      <th className="text-right px-4 py-3 font-medium">Total Purchased</th>
                      <th className="text-right px-4 py-3 font-medium">Avg Order</th>
                      <th className="text-right px-4 py-3 font-medium">Outstanding</th>
                      <th className="text-right px-4 py-3 font-medium">Share %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.map((c: any, i: number) => {
                      const avg = c.orderCount > 0 ? c.totalPurchase / c.orderCount : 0;
                      const share = totalRevenue > 0 ? (c.totalPurchase / totalRevenue) * 100 : 0;
                      return (
                        <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-[#e8f5ee] flex items-center justify-center text-[#2d7a4f] font-bold text-xs shrink-0">
                                {c.name?.[0]?.toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-gray-800">{c.name}</div>
                                <div className="text-xs text-gray-400">{c.phone}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(c.tags ?? []).map((t: string) => (
                                <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TAG_COLORS[t] ?? 'bg-gray-100 text-gray-600'}`}>{t}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{c.orderCount}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800">
                            <div className="flex items-center justify-end gap-1">
                              {i < 3 && <TrendingUp className="h-3 w-3 text-green-500" />}
                              {fmt(c.totalPurchase)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">{fmt(avg)}</td>
                          <td className="px-4 py-3 text-right">
                            {c.outstanding > 0 ? (
                              <span className="text-red-600 font-medium flex items-center justify-end gap-1">
                                <AlertCircle className="h-3 w-3" />{fmt(c.outstanding)}
                              </span>
                            ) : (
                              <span className="text-green-500 text-xs">Nil</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 text-xs">{share.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
