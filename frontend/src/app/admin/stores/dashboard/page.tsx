'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ShoppingBag,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { StoreRevenueToday, StoreStockSummary, MonthOverMonthData, TopSellingProduct, TopCustomer } from '@/types';

const STORE_COLORS: Record<string, string> = {
  raipur: '#16a34a',
  bhilai: '#d97706',
  store3: '#2563eb',
};

const STORE_BG_COLORS: Record<string, string> = {
  raipur: 'bg-green-50 border-green-200',
  bhilai: 'bg-amber-50 border-amber-200',
  store3: 'bg-blue-50 border-blue-200',
};

function formatCurrency(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString()}`;
}

export default function StoresDashboardPage() {
  const [topProductsStore, setTopProductsStore] = useState<string>('all');
  const [topCustomersStore, setTopCustomersStore] = useState<string>('all');

  const { data: todayRevenue = [], isLoading: loadingToday } = useQuery({
    queryKey: ['stores-today-revenue'],
    queryFn: () => api.getTodayRevenuePerStore(),
  });

  const { data: revenueComparison = [] } = useQuery({
    queryKey: ['stores-revenue-comparison'],
    queryFn: () => api.getMultiStoreRevenue(30),
  });

  const { data: stockSummary = [] } = useQuery({
    queryKey: ['stores-stock-summary'],
    queryFn: () => api.getStockSummaryPerStore(),
  });

  const { data: monthOverMonth = [] } = useQuery({
    queryKey: ['stores-month-over-month'],
    queryFn: () => api.getMonthOverMonthByStore(),
  });

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.getStores(),
  });

  const { data: topProductsAll = [] } = useQuery({
    queryKey: ['stores-top-products', topProductsStore],
    queryFn: () =>
      topProductsStore === 'all'
        ? api.getTopSellingOverall()
        : api.getTopSellingByStore(topProductsStore),
  });

  const { data: topCustomersAll = [] } = useQuery({
    queryKey: ['stores-top-customers', topCustomersStore],
    queryFn: () =>
      topCustomersStore === 'all'
        ? api.getTopCustomersOverall()
        : api.getTopCustomersByStore(topCustomersStore),
  });

  // Build chart data from revenue comparison
  const chartData = (() => {
    const dateMap = new Map<string, any>();
    revenueComparison.forEach((storeData: any) => {
      const code = stores.find((s) => s._id === storeData.storeId)?.code || storeData.storeId;
      storeData.data?.forEach((point: any) => {
        if (!dateMap.has(point.date)) {
          dateMap.set(point.date, { date: point.date });
        }
        dateMap.get(point.date)![code] = point.revenue;
      });
    });
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  })();

  const totalTodayRevenue = todayRevenue.reduce((s, r) => s + r.revenue, 0);
  const totalTodaySales = todayRevenue.reduce((s, r) => s + r.salesCount, 0);
  const totalThisMonth = monthOverMonth.reduce((s, m) => s + m.thisMonth, 0);
  const totalLastMonth = monthOverMonth.reduce((s, m) => s + m.lastMonth, 0);
  const overallChange = totalLastMonth > 0
    ? ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100
    : totalThisMonth > 0 ? 100 : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Multi-Store Dashboard</h1>
        <p className="text-gray-500 mt-1">Unified view across all store locations</p>
      </div>

      {/* Overall KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Today&apos;s Revenue</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalTodayRevenue)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Today&apos;s Sales</p>
                <p className="text-2xl font-bold mt-1">{totalTodaySales}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">This Month</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalThisMonth)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">MoM Change</p>
                <p className="text-2xl font-bold mt-1 flex items-center gap-1">
                  {overallChange >= 0 ? (
                    <ArrowUpRight className="h-5 w-5 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-5 w-5 text-red-500" />
                  )}
                  {Math.abs(Math.round(overallChange))}%
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Store Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stores.map((store) => {
          const revenue = todayRevenue.find((r) => r.storeId === store._id);
          const mom = monthOverMonth.find((m) => m.storeId === store._id);
          const colorClass = STORE_BG_COLORS[store.code] || 'bg-gray-50 border-gray-200';

          return (
            <Card key={store._id} className={`border-2 ${colorClass}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-lg">{store.name}</h3>
                  {store.isMainStore && (
                    <Badge variant="default" className="bg-primary text-xs">Main</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Today</p>
                    <p className="text-lg font-bold">{formatCurrency(revenue?.revenue || 0)}</p>
                    <p className="text-xs text-gray-500">{revenue?.salesCount || 0} sales</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">This Month</p>
                    <p className="text-lg font-bold">{formatCurrency(mom?.thisMonth || 0)}</p>
                    <div className="flex items-center gap-1 text-xs">
                      {(mom?.changePercent || 0) >= 0 ? (
                        <span className="text-green-600">+{mom?.changePercent || 0}%</span>
                      ) : (
                        <span className="text-red-600">{mom?.changePercent || 0}%</span>
                      )}
                      <span className="text-gray-400">vs last month</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Revenue Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Revenue Comparison - Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => `₹${value.toLocaleString()}`}
                  labelFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                />
                <Legend />
                {stores.map((store) => (
                  <Area
                    key={store.code}
                    type="monotone"
                    dataKey={store.code}
                    name={store.name}
                    stroke={STORE_COLORS[store.code] || '#6b7280'}
                    fill={STORE_COLORS[store.code] || '#6b7280'}
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No revenue data yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Month over Month Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">This Month vs Last Month</CardTitle>
        </CardHeader>
        <CardContent>
          {monthOverMonth.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={monthOverMonth.map((m) => ({
                  name: m.storeName,
                  'This Month': m.thisMonth,
                  'Last Month': m.lastMonth,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="This Month" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Last Month" fill="#d1d5db" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No comparison data yet
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Stock Summary by Store
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-gray-600">Store</th>
                    <th className="text-center py-2 font-medium text-gray-600">Total</th>
                    <th className="text-center py-2 font-medium text-gray-600">In Stock</th>
                    <th className="text-center py-2 font-medium text-gray-600">Out</th>
                    <th className="text-center py-2 font-medium text-gray-600">Low</th>
                  </tr>
                </thead>
                <tbody>
                  {stockSummary.map((s) => (
                    <tr key={s.storeId} className="border-b">
                      <td className="py-3 font-medium">{s.storeName}</td>
                      <td className="py-3 text-center">{s.totalProducts}</td>
                      <td className="py-3 text-center text-green-600 font-medium">{s.inStock}</td>
                      <td className="py-3 text-center text-red-600 font-medium">{s.outOfStock}</td>
                      <td className="py-3 text-center text-amber-600 font-medium">{s.lowStock}</td>
                    </tr>
                  ))}
                  {stockSummary.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-gray-400">No stock data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top Selling Products */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top Selling Products
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={topProductsStore === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTopProductsStore('all')}
                >
                  All
                </Button>
                {stores.map((s) => (
                  <Button
                    key={s._id}
                    variant={topProductsStore === s._id ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTopProductsStore(s._id)}
                  >
                    {s.name}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topProductsAll.slice(0, 8).map((p: TopSellingProduct, idx: number) => (
                <div key={p._id || idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-400 w-6">{idx + 1}.</span>
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">₹{p.revenue?.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{p.quantitySold} sold</p>
                  </div>
                </div>
              ))}
              {topProductsAll.length === 0 && (
                <p className="text-center text-gray-400 py-6">No sales data</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Customers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Top Customers
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant={topCustomersStore === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTopCustomersStore('all')}
              >
                All
              </Button>
              {stores.map((s) => (
                <Button
                  key={s._id}
                  variant={topCustomersStore === s._id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTopCustomersStore(s._id)}
                >
                  {s.name}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-gray-600">#</th>
                  <th className="text-left py-2 font-medium text-gray-600">Customer</th>
                  <th className="text-left py-2 font-medium text-gray-600">Phone</th>
                  <th className="text-right py-2 font-medium text-gray-600">Orders</th>
                  <th className="text-right py-2 font-medium text-gray-600">Total Spent</th>
                  <th className="text-right py-2 font-medium text-gray-600">Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {topCustomersAll.slice(0, 10).map((c: TopCustomer, idx: number) => (
                  <tr key={c._id || idx} className="border-b">
                    <td className="py-3 text-gray-500">{idx + 1}</td>
                    <td className="py-3 font-medium">{c.customerName || 'Unknown'}</td>
                    <td className="py-3 text-gray-600">{c._id}</td>
                    <td className="py-3 text-right">{c.totalOrders}</td>
                    <td className="py-3 text-right font-bold">₹{c.totalSpent?.toLocaleString()}</td>
                    <td className="py-3 text-right text-gray-500">
                      {c.lastPurchase
                        ? new Date(c.lastPurchase).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                          })
                        : '-'}
                    </td>
                  </tr>
                ))}
                {topCustomersAll.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-400">
                      No customer data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
