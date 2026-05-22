'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  DollarSign,
  ShoppingCart,
  Receipt,
  Users,
  AlertTriangle,
  UserPlus,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Package,
  CreditCard,
  Warehouse,
  ChevronDown,
  Loader2,
  FlaskConical,
} from 'lucide-react';
import {
  ComposedChart,
  Area,
  Bar,
  BarChart,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatCurrency, getProductTotalStock } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import type { RevenueDataPoint, ProductAnalytics, OrderAnalytics, Product, CustomerAnalytics, StockSnapshotItem, RawMaterialDailyItem, Store } from '@/types';

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '10px 14px',
  fontSize: '13px',
};

const PAYMENT_COLORS = ['#2F6B47', '#E8A838', '#3B82F6', '#8B5CF6', '#06B6D4', '#6B7280'];

function formatDateLocal(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDateLocalLong(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [stockTab, setStockTab] = useState(false);
  const [selectedStockDate, setSelectedStockDate] = useState<string>('');
  const [stockStoreId, setStockStoreId] = useState<string>('');
  const [rawTab, setRawTab] = useState(false);
  const [selectedRawDate, setSelectedRawDate] = useState<string>('');
  const [rawStoreId, setRawStoreId] = useState<string>('');
  const { user } = useAdminAuthStore();

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');
  const defaultStoreId = user?.storeId || '';

  const today = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const { data: revenueData, isLoading } = useQuery({
    queryKey: ['revenue-analytics', days],
    queryFn: () => api.getRevenueByDay(days),
  });

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.getDashboardStats(),
  });

  const { data: productAnalytics } = useQuery({
    queryKey: ['product-analytics', startDate, today],
    queryFn: () => api.getProductAnalytics(startDate, today),
  });

  const { data: customerAnalytics } = useQuery({
    queryKey: ['customer-analytics', startDate, today],
    queryFn: () => api.getCustomerAnalytics(startDate, today),
  });

  const { data: orderAnalytics } = useQuery({
    queryKey: ['order-analytics', startDate, today],
    queryFn: () => api.getOrderAnalytics(startDate, today),
  });

  const { data: lowStockProducts } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => api.getLowStockProducts(),
  });

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['stores'],
    queryFn: () => api.getStores(),
    enabled: isSuperadmin && stockTab,
  });

  const activeStockStoreId = isSuperadmin ? stockStoreId : defaultStoreId;

  useEffect(() => {
    if (isSuperadmin && stores.length > 0 && !stockStoreId) {
      setStockStoreId(stores[0]._id);
    }
  }, [stores, isSuperadmin, stockStoreId]);

  const { data: stockAnalyticsDates, isLoading: datesLoading } = useQuery({
    queryKey: ['stock-analytics-dates', activeStockStoreId],
    queryFn: () => api.getStockAnalytics(activeStockStoreId),
    enabled: !!activeStockStoreId && stockTab,
  });

  useEffect(() => {
    if (stockAnalyticsDates?.dates && stockAnalyticsDates.dates.length > 0 && !selectedStockDate) {
      setSelectedStockDate(stockAnalyticsDates.dates[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockAnalyticsDates?.dates?.length]);

  useEffect(() => {
    setSelectedStockDate('');
  }, [activeStockStoreId]);

  const { data: stockAnalyticsDay, isLoading: dayLoading } = useQuery({
    queryKey: ['stock-analytics-day', activeStockStoreId, selectedStockDate],
    queryFn: () => api.getStockAnalytics(activeStockStoreId, { date: selectedStockDate }),
    enabled: !!activeStockStoreId && !!selectedStockDate,
  });

  // Raw Materials analytics
  const activeRawStoreId = isSuperadmin ? rawStoreId : defaultStoreId;

  const { data: rawStores = [] } = useQuery<Store[]>({
    queryKey: ['stores-for-analytics'],
    queryFn: () => api.getStores(),
    enabled: isSuperadmin && rawTab,
  });

  useEffect(() => {
    if (isSuperadmin && rawStores.length > 0 && !rawStoreId) {
      setRawStoreId(rawStores[0]._id);
    }
  }, [rawStores, isSuperadmin, rawStoreId]);

  const { data: rawAnalyticsDates, isLoading: rawDatesLoading } = useQuery({
    queryKey: ['raw-analytics-dates', activeRawStoreId],
    queryFn: () => api.getRawMaterialAnalytics(activeRawStoreId),
    enabled: !!activeRawStoreId && rawTab,
  });

  useEffect(() => {
    if (rawAnalyticsDates?.dates && rawAnalyticsDates.dates.length > 0 && !selectedRawDate) {
      setSelectedRawDate(rawAnalyticsDates.dates[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawAnalyticsDates?.dates?.length]);

  useEffect(() => {
    setSelectedRawDate('');
  }, [activeRawStoreId]);

  const { data: rawAnalyticsDay, isLoading: rawDayLoading } = useQuery({
    queryKey: ['raw-analytics-day', activeRawStoreId, selectedRawDate],
    queryFn: () => api.getRawMaterialAnalytics(activeRawStoreId, { date: selectedRawDate }),
    enabled: !!activeRawStoreId && !!selectedRawDate,
  });

  // Compute period-over-period comparison
  const periodComparison = useMemo(() => {
    if (!revenueData || revenueData.length < 2) return null;
    const half = Math.floor(revenueData.length / 2);
    const recent = revenueData.slice(half);
    const older = revenueData.slice(0, half);
    const recentRev = recent.reduce((s: number, d: RevenueDataPoint) => s + d.revenue, 0);
    const olderRev = older.reduce((s: number, d: RevenueDataPoint) => s + d.revenue, 0);
    const recentOrd = recent.reduce((s: number, d: RevenueDataPoint) => s + d.orders, 0);
    const olderOrd = older.reduce((s: number, d: RevenueDataPoint) => s + d.orders, 0);
    return {
      revenueChange: olderRev > 0 ? ((recentRev - olderRev) / olderRev) * 100 : 0,
      ordersChange: olderOrd > 0 ? ((recentOrd - olderOrd) / olderOrd) * 100 : 0,
    };
  }, [revenueData]);

  // Compute avg order value trend from revenue data
  const avgOrderTrend = useMemo(() => {
    if (!revenueData) return [];
    return revenueData
      .filter((d: RevenueDataPoint) => d.orders > 0)
      .map((d: RevenueDataPoint) => ({
        date: d.date,
        aov: Math.round(d.revenue / d.orders),
      }));
  }, [revenueData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-green" />
      </div>
    );
  }

  const totalRevenue =
    revenueData?.reduce((sum: number, day: RevenueDataPoint) => sum + day.revenue, 0) || 0;
  const totalOrders =
    revenueData?.reduce((sum: number, day: RevenueDataPoint) => sum + day.orders, 0) || 0;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const summaryCards = [
    {
      title: `${days}-Day Revenue`,
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      iconBg: 'bg-brand-green/10',
      iconColor: 'text-brand-green',
      change: periodComparison?.revenueChange,
    },
    {
      title: `${days}-Day Orders`,
      value: totalOrders,
      icon: ShoppingCart,
      iconBg: 'bg-brand-mustard/10',
      iconColor: 'text-brand-mustard',
      change: periodComparison?.ordersChange,
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(avgOrderValue),
      icon: Receipt,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      change: null,
    },
    {
      title: 'Total Customers',
      value: stats?.totalCustomers || 0,
      icon: Users,
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-600',
      change: null,
    },
  ];

  const topSellingBarData =
    productAnalytics?.topSelling?.slice(0, 6).map((p: { product?: Product; name?: string; _id?: string; sold?: number; totalSold?: number; count?: number; revenue?: number }) => ({
      name:
        ((p.product?.name || p.name || p._id || '') as string).length > 20
          ? ((p.product?.name || p.name || p._id || '') as string).slice(0, 20) + '…'
          : (p.product?.name || p.name || p._id || '') as string,
      sold: p.sold || p.totalSold || p.count || 0,
      revenue: p.revenue || 0,
    })) || [];

  const paymentMethodData =
    orderAnalytics?.ordersByPaymentMethod?.map((pm: { method?: string; _id?: string; count?: number }) => ({
      name: (pm.method || pm._id || 'Unknown')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase()),
      value: pm.count || 0,
    })) || [];

  // Customer new vs returning donut data
  const customerDonut = customerAnalytics
    ? [
        { name: 'New', value: customerAnalytics.newCustomers || 0, color: '#3B82F6' },
        { name: 'Returning', value: customerAnalytics.returningCustomers || 0, color: '#2F6B47' },
      ].filter((d) => d.value > 0)
    : [];

  const periodLabels: Record<number, string> = {
    7: '1 Week',
    14: '2 Weeks',
    30: '1 Month',
    60: '2 Months',
    90: '3 Months',
  };

  return (
    <div>
      <Header title="Analytics" description="Track your store performance" />

      <div className="p-6 space-y-6">
        {/* Period Selector */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 flex-wrap"
        >
          <span className="text-sm font-medium text-muted-foreground mr-1">Period:</span>
          {[7, 14, 30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                days === d
                  ? 'bg-brand-green text-white shadow-sm'
                  : 'bg-brand-cream text-brand-charcoal hover:bg-brand-green/10'
              }`}
            >
              {periodLabels[d] || `${d}d`}
            </button>
          ))}
        </motion.div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.iconBg}`}
                  >
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  {stat.change != null && (
                    <div className="flex items-center gap-1 mt-1">
                      {stat.change >= 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span
                        className={`text-xs font-medium ${
                          stat.change >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {stat.change >= 0 ? '+' : ''}
                        {stat.change.toFixed(1)}%
                      </span>
                      <span className="text-xs text-muted-foreground">vs prev half</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Revenue & Orders Composed Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Revenue &amp; Orders</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {periodLabels[days] || `${days} days`}
                </p>
              </div>
              <div className="flex items-center gap-5 text-right">
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-base font-bold text-brand-green">
                    {formatCurrency(totalRevenue)}
                  </p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="text-base font-bold text-brand-mustard">{totalOrders}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {revenueData && revenueData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={revenueData}
                      margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="analyticsRevenueGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#2F6B47" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#2F6B47" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f0f0f0"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#888' }}
                      />
                      <YAxis
                        yAxisId="revenue"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#888' }}
                        tickFormatter={(val) =>
                          `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                        }
                      />
                      <YAxis
                        yAxisId="orders"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#888' }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number, name: string) => [
                          name === 'revenue' ? formatCurrency(value) : value,
                          name === 'revenue' ? 'Revenue' : 'Orders',
                        ]}
                        labelFormatter={(label) => {
                          const d = new Date(label);
                          return d.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            weekday: 'short',
                          });
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span style={{ fontSize: '13px', color: '#666' }}>
                            {value === 'revenue' ? 'Revenue (₹)' : 'Orders (#)'}
                          </span>
                        )}
                      />
                      <Area
                        yAxisId="revenue"
                        type="monotone"
                        dataKey="revenue"
                        stroke="#2F6B47"
                        strokeWidth={2.5}
                        fill="url(#analyticsRevenueGrad)"
                        dot={false}
                        activeDot={{
                          r: 5,
                          fill: '#2F6B47',
                          stroke: '#fff',
                          strokeWidth: 2,
                        }}
                      />
                      <Bar
                        yAxisId="orders"
                        dataKey="orders"
                        fill="#E8A838"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                        opacity={0.8}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    No data available for this period
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Avg Order Value Trend + Payment Methods */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Avg Order Value Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Avg Order Value</CardTitle>
                  <p className="text-sm text-muted-foreground">Per-day trend</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Period Avg</p>
                  <p className="text-base font-bold text-blue-600">
                    {formatCurrency(avgOrderValue)}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  {avgOrderTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={avgOrderTrend}
                        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="aovGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f0f0f0"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(val) => {
                            const d = new Date(val);
                            return `${d.getDate()}/${d.getMonth() + 1}`;
                          }}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#888' }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#888' }}
                          tickFormatter={(val) => `₹${val}`}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number) => [formatCurrency(value), 'AOV']}
                          labelFormatter={(label) => {
                            const d = new Date(label);
                            return d.toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            });
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="aov"
                          stroke="#3B82F6"
                          strokeWidth={2}
                          fill="url(#aovGrad)"
                          dot={false}
                          activeDot={{
                            r: 4,
                            fill: '#3B82F6',
                            stroke: '#fff',
                            strokeWidth: 2,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Not enough data
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Payment Methods Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg font-semibold">Payment Methods</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {paymentMethodData.length > 0 ? (
                  <div className="h-56 flex items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentMethodData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          {paymentMethodData.map((_, index: number) => (
                            <Cell
                              key={index}
                              fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend
                          verticalAlign="bottom"
                          iconType="circle"
                          iconSize={8}
                          formatter={(value) => (
                            <span style={{ fontSize: '12px', color: '#666' }}>{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-56 flex flex-col items-center justify-center text-muted-foreground text-sm">
                    <CreditCard className="h-8 w-8 mb-2 opacity-30" />
                    No payment data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Product Performance + Customer Insights */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Selling Products */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg font-semibold">Top Products</CardTitle>
                </div>
                {productAnalytics?.totalProducts != null && (
                  <Badge variant="secondary" className="rounded-lg">
                    {productAnalytics.totalProducts} total
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                {topSellingBarData.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topSellingBarData}
                        layout="vertical"
                        margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f0f0f0"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: '#888' }}
                          allowDecimals={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#555' }}
                          width={140}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => {
                            if (name === 'revenue') return [formatCurrency(value), 'Revenue'];
                            return [value, 'Units Sold'];
                          }}
                        />
                        <Bar
                          dataKey="sold"
                          fill="#2F6B47"
                          radius={[0, 6, 6, 0]}
                          maxBarSize={22}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-72 flex flex-col items-center justify-center text-muted-foreground text-sm">
                    <Package className="h-8 w-8 mb-2 opacity-30" />
                    No product sales data for this period
                  </div>
                )}

                {/* Low Stock Alert */}
                {lowStockProducts && lowStockProducts.length > 0 && (
                  <div className="mt-5 pt-5 border-t">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded-md bg-red-50 flex items-center justify-center">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      </div>
                      <h4 className="text-sm font-semibold text-red-600">
                        Low Stock ({lowStockProducts.length})
                      </h4>
                    </div>
                    <div className="space-y-1.5">
                      {lowStockProducts.slice(0, 4).map((p: Product) => (
                        <div
                          key={p._id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-red-50/50"
                        >
                          <span className="text-sm truncate flex-1">{p.name}</span>
                          <Badge variant="destructive" className="rounded-lg text-xs">
                            {getProductTotalStock(p)} left
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Customer Insights */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Customer Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {customerAnalytics ? (
                  <>
                    {/* New vs Returning Mini Chart */}
                    <div className="flex items-center gap-6">
                      {customerDonut.length > 0 && (
                        <div className="w-24 h-24 flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={customerDonut}
                                cx="50%"
                                cy="50%"
                                innerRadius={26}
                                outerRadius={40}
                                paddingAngle={4}
                                dataKey="value"
                                stroke="none"
                              >
                                {customerDonut.map((entry, i) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={TOOLTIP_STYLE} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-blue-50/70">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center">
                              <UserPlus className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">New</p>
                          <p className="text-xl font-bold">
                            {customerAnalytics.newCustomers ?? 0}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-brand-green/5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="h-7 w-7 rounded-lg bg-brand-green/10 flex items-center justify-center">
                              <UserCheck className="h-3.5 w-3.5 text-brand-green" />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">Returning</p>
                          <p className="text-xl font-bold">
                            {customerAnalytics.returningCustomers ?? 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Top Customers */}
                    {customerAnalytics.topCustomers &&
                      customerAnalytics.topCustomers.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Top Customers</h4>
                          <div className="space-y-2">
                            {customerAnalytics.topCustomers
                              .slice(0, 5)
                              .map((c: { customer?: { name?: string }; name?: string; email?: string; _id?: string; totalSpent?: number; orderCount?: number }, i: number) => {
                                const rawName =
                                  c.customer?.name || c.name || c.email || c._id || '?';
                                const name = String(rawName);
                                const spent = c.totalSpent || 0;
                                const orders = c.orderCount || 0;
                                return (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50/80 hover:bg-gray-100/80 transition-colors"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="h-8 w-8 rounded-full bg-brand-green/10 flex items-center justify-center text-xs font-bold text-brand-green flex-shrink-0">
                                        {name.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{name}</p>
                                        {orders > 0 && (
                                          <p className="text-xs text-muted-foreground">
                                            {orders} order{orders !== 1 ? 's' : ''}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className="rounded-lg font-medium flex-shrink-0 ml-2"
                                    >
                                      {formatCurrency(spent)}
                                    </Badge>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                  </>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-sm">
                    <Users className="h-8 w-8 mb-2 opacity-30" />
                    No customer analytics for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
        {/* Stock Analytics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardHeader
              className="flex flex-row items-center justify-between cursor-pointer select-none hover:bg-gray-50/60 transition-colors"
              onClick={() => setStockTab(!stockTab)}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Warehouse className="h-4.5 w-4.5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Product Stock History</CardTitle>
                  <p className="text-xs text-muted-foreground font-normal mt-0.5">Day-wise snapshot</p>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${stockTab ? 'rotate-180' : ''}`} />
            </CardHeader>

            {stockTab && (
              <CardContent className="space-y-5 pt-2">
                {/* Store + Date selectors */}
                <div className="flex flex-wrap items-end gap-3">
                  {isSuperadmin && stores.length > 0 && (
                    <div className="w-52">
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Store</label>
                      <Select value={stockStoreId} onValueChange={(v) => setStockStoreId(v)}>
                        <SelectTrigger className="h-9 bg-white">
                          <SelectValue placeholder="Select store" />
                        </SelectTrigger>
                        <SelectContent>
                          {stores.filter((s) => s._id).map((store) => (
                            <SelectItem key={store._id} value={store._id}>
                              {store.name} {store.isMainStore ? '(Main)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {stockAnalyticsDates?.dates && stockAnalyticsDates.dates.length > 0 && (
                    <div className="w-52">
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Date</label>
                      <Select value={selectedStockDate} onValueChange={setSelectedStockDate}>
                        <SelectTrigger className="h-9 bg-white">
                          <SelectValue placeholder="Select date" />
                        </SelectTrigger>
                        <SelectContent>
                          {stockAnalyticsDates.dates.map((date) => (
                            <SelectItem key={date} value={date}>{formatDateLocal(date)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {datesLoading ? (
                  <div className="space-y-2 py-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
                  </div>
                ) : !activeStockStoreId ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Warehouse className="h-10 w-10 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Select a store to view stock history</p>
                  </div>
                ) : !stockAnalyticsDates?.dates || stockAnalyticsDates.dates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Warehouse className="h-10 w-10 text-gray-200 mb-3" />
                    <p className="text-sm font-medium text-gray-500">No stock history yet</p>
                    <p className="text-xs text-gray-400 mt-1">Stock updates will appear here day-wise.</p>
                  </div>
                ) : selectedStockDate ? (
                  <>
                    <div className="flex items-center justify-between py-2 border-t">
                      <p className="text-sm font-semibold text-gray-800">{formatDateLocalLong(selectedStockDate)}</p>
                      <Badge variant="secondary" className="rounded-full text-xs">
                        {(stockAnalyticsDay?.items as StockSnapshotItem[])?.length ?? 0} products
                      </Badge>
                    </div>

                    {dayLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
                      </div>
                    ) : !stockAnalyticsDay?.items || (stockAnalyticsDay.items as StockSnapshotItem[]).length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">No data for this date.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Product</th>
                              <th className="text-left px-3 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">SKU</th>
                              <th className="text-right px-3 py-3 font-semibold text-emerald-600 text-xs uppercase tracking-wide">Stock In</th>
                              <th className="text-right px-3 py-3 font-semibold text-blue-500 text-xs uppercase tracking-wide">Returned</th>
                              <th className="text-right px-3 py-3 font-semibold text-amber-500 text-xs uppercase tracking-wide">Damaged</th>
                              <th className="text-right px-3 py-3 font-semibold text-red-500 text-xs uppercase tracking-wide">Sale Log</th>
                              <th className="text-right px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wide">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(stockAnalyticsDay.items as StockSnapshotItem[]).map((item) => (
                              <tr key={item._id} className="hover:bg-gray-50/60 transition-colors">
                                <td className="px-4 py-3.5 font-semibold text-gray-900">{item.productName || '—'}</td>
                                <td className="px-3 py-3.5 font-mono text-gray-400 text-xs">{item.productSku || '—'}</td>
                                <td className="px-3 py-3.5 text-right">
                                  {item.stockInDelta > 0
                                    ? <span className="text-emerald-600 font-semibold">+{item.stockInDelta}</span>
                                    : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-3.5 text-right">
                                  {item.returnedDelta > 0
                                    ? <span className="text-blue-500 font-semibold">+{item.returnedDelta}</span>
                                    : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-3.5 text-right">
                                  {item.damagedDelta > 0
                                    ? <span className="text-amber-500 font-semibold">+{item.damagedDelta}</span>
                                    : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-3.5 text-right">
                                  {item.saleLogDelta > 0
                                    ? <span className="text-red-500 font-semibold">−{item.saleLogDelta}</span>
                                    : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-3.5 text-right">
                                  <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold min-w-[40px] ${
                                    item.totalStock <= 0
                                      ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                                      : item.totalStock < 10
                                      ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                                      : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                                  }`}>{item.totalStock}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : null}
              </CardContent>
            )}
          </Card>
        </motion.div>

        {/* Raw Materials Analytics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardHeader
              className="flex flex-row items-center justify-between cursor-pointer select-none hover:bg-gray-50/60 transition-colors"
              onClick={() => setRawTab(!rawTab)}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
                  <FlaskConical className="h-4.5 w-4.5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Raw Materials History</CardTitle>
                  <p className="text-xs text-muted-foreground font-normal mt-0.5">Day-wise entries</p>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${rawTab ? 'rotate-180' : ''}`} />
            </CardHeader>

            {rawTab && (
              <CardContent className="space-y-5 pt-2">
                {/* Store + Date selectors */}
                <div className="flex flex-wrap items-end gap-3">
                  {isSuperadmin && rawStores.length > 0 && (
                    <div className="w-52">
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Store</label>
                      <Select value={rawStoreId} onValueChange={(v) => setRawStoreId(v)}>
                        <SelectTrigger className="h-9 bg-white">
                          <SelectValue placeholder="Select store" />
                        </SelectTrigger>
                        <SelectContent>
                          {rawStores.filter((s) => s._id).map((store) => (
                            <SelectItem key={store._id} value={store._id}>
                              {store.name} {store.isMainStore ? '(Main)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {rawAnalyticsDates?.dates && rawAnalyticsDates.dates.length > 0 && (
                    <div className="w-52">
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Date</label>
                      <Select value={selectedRawDate} onValueChange={setSelectedRawDate}>
                        <SelectTrigger className="h-9 bg-white">
                          <SelectValue placeholder="Select date" />
                        </SelectTrigger>
                        <SelectContent>
                          {rawAnalyticsDates.dates.map((date) => (
                            <SelectItem key={date} value={date}>{formatDateLocal(date)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {rawDatesLoading ? (
                  <div className="space-y-2 py-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
                  </div>
                ) : !activeRawStoreId ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <FlaskConical className="h-10 w-10 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Select a store to view raw material history</p>
                  </div>
                ) : !rawAnalyticsDates?.dates || rawAnalyticsDates.dates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <FlaskConical className="h-10 w-10 text-gray-200 mb-3" />
                    <p className="text-sm font-medium text-gray-500">No raw material history yet</p>
                    <p className="text-xs text-gray-400 mt-1">Daily entries will appear here once logged.</p>
                  </div>
                ) : selectedRawDate ? (
                  <>
                    <div className="flex items-center justify-between py-2 border-t">
                      <p className="text-sm font-semibold text-gray-800">{formatDateLocalLong(selectedRawDate)}</p>
                      <Badge variant="secondary" className="rounded-full text-xs">
                        {(rawAnalyticsDay?.items as RawMaterialDailyItem[])?.length ?? 0} materials
                      </Badge>
                    </div>

                    {rawDayLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
                      </div>
                    ) : !rawAnalyticsDay?.items || (rawAnalyticsDay.items as RawMaterialDailyItem[]).length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">No entries for this date.</p>
                    ) : (() => {
                      const items = rawAnalyticsDay.items as RawMaterialDailyItem[];
                      const totalStockIn = items.reduce((s, i) => s + i.stockIn, 0);
                      const totalProcessed = items.reduce((s, i) => s + i.processed, 0);
                      const totalClosing = items.reduce((s, i) => s + i.closing, 0);
                      return (
                        <div className="space-y-4">
                          {/* Summary stats */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-emerald-50 rounded-xl border border-emerald-100 px-4 py-3">
                              <p className="text-xs text-emerald-600 font-medium mb-1">Total Stock In</p>
                              <p className="text-xl font-bold text-emerald-700">+{totalStockIn}</p>
                            </div>
                            <div className="bg-orange-50 rounded-xl border border-orange-100 px-4 py-3">
                              <p className="text-xs text-orange-600 font-medium mb-1">Total Processed</p>
                              <p className="text-xl font-bold text-orange-600">−{totalProcessed}</p>
                            </div>
                            <div className={`rounded-xl border px-4 py-3 ${totalClosing <= 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                              <p className={`text-xs font-medium mb-1 ${totalClosing <= 0 ? 'text-red-500' : 'text-gray-500'}`}>Total Closing</p>
                              <p className={`text-xl font-bold ${totalClosing <= 0 ? 'text-red-600' : 'text-gray-800'}`}>{totalClosing}</p>
                            </div>
                          </div>

                          {/* Table */}
                          <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b">
                                  <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Material</th>
                                  <th className="text-center px-3 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Unit</th>
                                  <th className="text-center px-3 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Opening</th>
                                  <th className="text-center px-3 py-3 font-semibold text-emerald-600 text-xs uppercase tracking-wide">Stock In</th>
                                  <th className="text-center px-3 py-3 font-semibold text-orange-500 text-xs uppercase tracking-wide">Processed</th>
                                  <th className="text-center px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wide">Closing</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {items.map((item) => {
                                  const closing = item.closing;
                                  const badge = closing <= 0
                                    ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                                    : closing < 10
                                    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                                    : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
                                  return (
                                    <tr key={item._id} className="hover:bg-gray-50/60 transition-colors">
                                      <td className="px-4 py-3.5">
                                        <p className="font-semibold text-gray-900">{item.materialName || '—'}</p>
                                      </td>
                                      <td className="px-3 py-3.5 text-center text-gray-400 text-xs">{item.materialUnit || '—'}</td>
                                      <td className="px-3 py-3.5 text-center font-medium text-gray-600">{item.openingStock}</td>
                                      <td className="px-3 py-3.5 text-center">
                                        {item.stockIn > 0
                                          ? <span className="font-semibold text-emerald-600">+{item.stockIn}</span>
                                          : <span className="text-gray-300">—</span>}
                                      </td>
                                      <td className="px-3 py-3.5 text-center">
                                        {item.processed > 0
                                          ? <span className="font-semibold text-orange-500">−{item.processed}</span>
                                          : <span className="text-gray-300">—</span>}
                                      </td>
                                      <td className="px-4 py-3.5 text-center">
                                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold min-w-[44px] ${badge}`}>
                                          {closing}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : null}
              </CardContent>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
