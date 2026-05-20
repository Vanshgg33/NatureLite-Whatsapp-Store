'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ShoppingCart,
  DollarSign,
  Users,
  Clock,
  TrendingUp,
  TrendingDown,
  Inbox,
  ArrowRight,
  Package,
  Eye,
  Building2,
  Receipt,
  MapPin,
  Bell,
  X,
  FlaskConical,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { formatCurrency, formatDate, getStatusColor, getProductTotalStock, getStoreItemTotalStock } from '@/lib/utils';
import type { RevenueDataPoint, Reminder, StoreSale, StoreStockItem, Product } from '@/types';

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '10px 14px',
  fontSize: '13px',
};

const STATUS_COLORS: Record<string, string> = {
  placed: '#F59E0B',
  confirmed: '#3B82F6',
  preparing: '#8B5CF6',
  out_for_delivery: '#6366F1',
  delivered: '#2F6B47',
  cancelled: '#EF4444',
  returned: '#F97316',
  refunded: '#6B7280',
};

function CenterLabel({ viewBox, total }: { viewBox?: { cx?: number; cy?: number }; total: number }) {
  if (!viewBox) return null;
  const { cx, cy } = viewBox;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-6" fontSize="22" fontWeight="700" fill="#1a1a1a">
        {total}
      </tspan>
      <tspan x={cx} dy="20" fontSize="11" fill="#888">
        Total
      </tspan>
    </text>
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAdminAuthStore();
  const isStoreAdmin = !!user?.storeId;
  const isSuperAdmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

  // Global dashboard data (superadmin only)
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.getDashboardStats(),
    enabled: !isStoreAdmin,
  });

  const { data: revenueData } = useQuery({
    queryKey: ['revenue-chart'],
    queryFn: () => api.getRevenueByDay(14),
    enabled: !isStoreAdmin,
  });

  const { data: ordersByStatus } = useQuery({
    queryKey: ['orders-by-status'],
    queryFn: () => api.getOrdersByStatus(),
    enabled: !isStoreAdmin,
  });

  const { data: lowStockProducts } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => api.getLowStockProducts(),
    enabled: !isStoreAdmin,
  });

  // Store-scoped dashboard data (store admin only)
  const { data: storeStats, isLoading: storeLoading } = useQuery({
    queryKey: ['store-dashboard-stats', user?.storeId],
    queryFn: () => api.getStoreDashboardStats(user!.storeId!),
    enabled: isStoreAdmin,
  });

  const { data: storeSaleStats } = useQuery({
    queryKey: ['store-sale-stats', user?.storeId],
    queryFn: () => api.getSaleStats(user!.storeId!),
    enabled: isStoreAdmin,
  });

  const { data: dueReminders = [], refetch: refetchReminders } = useQuery({
    queryKey: ['due-reminders'],
    queryFn: () => api.getDueReminders(),
    refetchInterval: 60000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    enabled: isSuperAdmin,
  });
  const isMockMode = !!settingsData?.mockData?.enabled;

  const dismissReminderMutation = useMutation({
    mutationFn: (id: string) => api.dismissReminder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['due-reminders'] });
    },
  });

  // Compute real period stats from revenue data
  const periodStats = useMemo(() => {
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

  if (isStoreAdmin ? storeLoading : isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-green" />
      </div>
    );
  }

  const statCards = isStoreAdmin
    ? [
        {
          title: "Today's Sales",
          value: storeStats?.todaySales || 0,
          icon: ShoppingCart,
          iconBg: 'bg-brand-green/10',
          iconColor: 'text-brand-green',
        },
        {
          title: "Today's Revenue",
          value: formatCurrency(storeStats?.todayRevenue || 0),
          icon: DollarSign,
          iconBg: 'bg-brand-mustard/10',
          iconColor: 'text-brand-mustard',
        },
        {
          title: 'Monthly Sales',
          value: storeStats?.monthSales || 0,
          icon: Users,
          iconBg: 'bg-blue-50',
          iconColor: 'text-blue-600',
        },
        {
          title: 'Monthly Revenue',
          value: formatCurrency(storeStats?.monthRevenue || 0),
          icon: Clock,
          iconBg: 'bg-orange-50',
          iconColor: 'text-orange-600',
        },
      ]
    : [
        {
          title: "Today's Orders",
          value: stats?.todayOrders || 0,
          icon: ShoppingCart,
          iconBg: 'bg-brand-green/10',
          iconColor: 'text-brand-green',
        },
        {
          title: "Today's Revenue",
          value: formatCurrency(stats?.todayRevenue || 0),
          icon: DollarSign,
          iconBg: 'bg-brand-mustard/10',
          iconColor: 'text-brand-mustard',
        },
        {
          title: 'Total Customers',
          value: stats?.totalCustomers || 0,
          icon: Users,
          iconBg: 'bg-blue-50',
          iconColor: 'text-blue-600',
        },
        {
          title: 'Pending Orders',
          value: stats?.pendingOrders || 0,
          icon: Clock,
          iconBg: 'bg-orange-50',
          iconColor: 'text-orange-600',
        },
      ];

  const pieData = ordersByStatus
    ? Object.entries(ordersByStatus)
        .filter(([, count]) => (count as number) > 0)
        .map(([status, count]) => ({
          name: status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          value: count as number,
          color: STATUS_COLORS[status] || '#6B7280',
        }))
    : [];

  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const totalRevenue14d = revenueData?.reduce((s: number, d: RevenueDataPoint) => s + d.revenue, 0) || 0;
  const totalOrders14d = revenueData?.reduce((s: number, d: RevenueDataPoint) => s + d.orders, 0) || 0;
  const avgOrderValue = totalOrders14d > 0 ? totalRevenue14d / totalOrders14d : 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div>
      <Header
        title={isStoreAdmin && user?.storeName ? `${user.storeName} Dashboard` : 'Dashboard'}
        description={isStoreAdmin ? `Overview of ${user?.storeName} store performance` : 'Overview of your store performance'}
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Welcome + Date */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-brand-charcoal">
              {greeting} 👋
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground">
                {new Date().toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              {isStoreAdmin && user?.storeName && (
                <Badge variant="outline" className="rounded-full text-xs gap-1 border-brand-green/30 text-brand-green">
                  <MapPin className="h-3 w-3" />
                  {user.storeName}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isMockMode && (
              <Link href="/admin/settings">
                <Badge className="rounded-full gap-1.5 bg-violet-100 text-violet-700 border border-violet-300 hover:bg-violet-200 cursor-pointer px-3 py-1 text-xs font-medium">
                  <FlaskConical className="h-3 w-3" />
                  Mock Mode ON
                </Badge>
              </Link>
            )}
            {isStoreAdmin && (
              <Link href="/admin/sales">
                <Button size="sm" className="rounded-full gap-1.5 bg-brand-green hover:bg-brand-green/90">
                  <Receipt className="h-3.5 w-3.5" />
                  Log Sale
                </Button>
              </Link>
            )}
            {isSuperAdmin && (
              <Link href="/admin/stores/dashboard">
                <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Stores Dashboard
                </Button>
              </Link>
            )}
            <Link href="/admin/analytics">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                View Analytics
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Due Reminders – shown 1hr before */}
        {dueReminders.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Reminders (due within 24 hours)
            </h3>
            <div className="space-y-2">
              {dueReminders.map((r: Reminder) => (
                <Card key={r._id} className="rounded-xl border-amber-200 bg-amber-50/50">
                  <CardContent className="py-4 px-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-amber-900">{r.message}</p>
                      <p className="text-sm text-amber-700 mt-1">
                        Sale #{r.sale?.saleNumber} · {r.store?.name}
                        {r.sale?.customerName && ` · ${r.sale.customerName}`}
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Due {new Date(r.dueAt).toLocaleString('en-IN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-amber-700 hover:bg-amber-100"
                      onClick={() => dismissReminderMutation.mutate(r._id)}
                      disabled={dismissReminderMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* Stat Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border-transparent hover:border-brand-green/10">
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
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Monthly Summary + 14-day KPIs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card className="rounded-2xl shadow-sm bg-gradient-to-r from-brand-green/5 via-white to-brand-mustard/5 overflow-hidden">
            <CardContent className="grid grid-cols-2 md:grid-cols-4 divide-x py-5 px-0">
              {isStoreAdmin ? (
                <>
                  <div className="px-6">
                    <p className="text-xs text-muted-foreground">Walk-in Sales</p>
                    <p className="text-xl font-bold mt-1">{storeSaleStats?.walkInSales || 0}</p>
                  </div>
                  <div className="px-6">
                    <p className="text-xs text-muted-foreground">Walk-in Revenue</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(storeSaleStats?.walkInRevenue || 0)}</p>
                  </div>
                  <div className="px-6">
                    <p className="text-xs text-muted-foreground">Delivery Sales</p>
                    <p className="text-xl font-bold mt-1">{storeSaleStats?.deliverySales || 0}</p>
                  </div>
                  <div className="px-6">
                    <p className="text-xs text-muted-foreground">Avg Sale Value</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(storeSaleStats?.avgSaleValue || 0)}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-6">
                    <p className="text-xs text-muted-foreground">Monthly Revenue</p>
                    <p className="text-xl font-bold mt-1">
                      {formatCurrency(stats?.monthRevenue || 0)}
                    </p>
                  </div>
                  <div className="px-6">
                    <p className="text-xs text-muted-foreground">Monthly Orders</p>
                    <p className="text-xl font-bold mt-1">{stats?.monthOrders || 0}</p>
                  </div>
                  <div className="px-6">
                    <p className="text-xs text-muted-foreground">14-Day Avg Order</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(avgOrderValue)}</p>
                  </div>
                  <div className="px-6">
                    <p className="text-xs text-muted-foreground">Revenue Trend (7d)</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <p className="text-xl font-bold">
                        {periodStats
                          ? `${periodStats.revenueChange >= 0 ? '+' : ''}${periodStats.revenueChange.toFixed(1)}%`
                          : '—'}
                      </p>
                      {periodStats && (
                        periodStats.revenueChange >= 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Store Admin: Recent Sales & Low Stock */}
        {isStoreAdmin && (
          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="rounded-2xl shadow-sm h-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-semibold">Recent Sales</CardTitle>
                  <Link href="/admin/sales">
                    <Button variant="ghost" size="sm" className="rounded-full text-xs gap-1">
                      View All <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  {storeStats?.recentSales && storeStats.recentSales.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sale #</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {storeStats.recentSales.slice(0, 5).map((sale: StoreSale) => (
                          <TableRow key={sale._id} className="hover:bg-muted/30">
                            <TableCell className="font-medium text-sm">{sale.saleNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="rounded-lg text-xs capitalize">
                                {sale.saleType?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm">
                              {formatCurrency(sale.total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="rounded-2xl bg-muted/30 p-5 mb-4">
                        <Inbox className="h-10 w-10 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm font-medium">No sales yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Log your first sale from the Sales page.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {storeStats?.lowStockProducts && storeStats.lowStockProducts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                <Card className="rounded-2xl shadow-sm border-red-100">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                        <Package className="h-4 w-4 text-red-500" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-red-600">
                        Low Stock ({storeStats.lowStockProducts.length})
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {storeStats.lowStockProducts.slice(0, 6).map((p: StoreStockItem) => (
                        <div
                          key={p._id}
                          className="flex items-center justify-between p-2 rounded-xl bg-red-50/50"
                        >
                          <span className="text-sm truncate flex-1 pr-2">{p.productName}</span>
                          <Badge variant="destructive" className="rounded-lg text-xs">
                            {getStoreItemTotalStock(p)} left
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <Link href="/admin/store-stock">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-3 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl text-xs"
                      >
                        View all stock
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        )}

        {/* Charts Row (superadmin only) */}
        {!isStoreAdmin && <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Area Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Revenue Trend</CardTitle>
                  <p className="text-sm text-muted-foreground">Last 14 days</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold text-brand-green">
                    {formatCurrency(totalRevenue14d)}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {revenueData && revenueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={revenueData}
                        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2F6B47" stopOpacity={0.3} />
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
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: '#888' }}
                          tickFormatter={(val) =>
                            `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                          }
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number) => [formatCurrency(value), 'Revenue']}
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
                          dataKey="revenue"
                          stroke="#2F6B47"
                          strokeWidth={2.5}
                          fill="url(#revenueGradient)"
                          dot={false}
                          activeDot={{
                            r: 5,
                            fill: '#2F6B47',
                            stroke: '#fff',
                            strokeWidth: 2,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      No revenue data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Orders Bar Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Daily Orders</CardTitle>
                  <p className="text-sm text-muted-foreground">Last 14 days</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold text-brand-mustard">{totalOrders14d}</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {revenueData && revenueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={revenueData}
                        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                      >
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
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: '#888' }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number) => [value, 'Orders']}
                          labelFormatter={(label) => {
                            const d = new Date(label);
                            return d.toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            });
                          }}
                        />
                        <Bar
                          dataKey="orders"
                          fill="#E8A838"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={40}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      No order data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>}

        {/* Bottom Row: Donut + Recent Orders + Low Stock (superadmin only) */}
        {!isStoreAdmin && <div className="grid gap-6 lg:grid-cols-3">
          {/* Order Status Donut */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="lg:col-span-1 space-y-6"
          >
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Order Status</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="45%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                          <CenterLabel total={pieTotal} />
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend
                          verticalAlign="bottom"
                          iconType="circle"
                          iconSize={8}
                          formatter={(value) => (
                            <span style={{ fontSize: '12px', color: '#888' }}>{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No order data yet
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Low Stock Alert */}
            {lowStockProducts && lowStockProducts.length > 0 && (
              <Card className="rounded-2xl shadow-sm border-red-100">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                      <Package className="h-4 w-4 text-red-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-red-600">
                      Low Stock ({lowStockProducts.length})
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {lowStockProducts.slice(0, 4).map((p: Product) => (
                      <div
                        key={p._id}
                        className="flex items-center justify-between p-2 rounded-xl bg-red-50/50"
                      >
                        <span className="text-sm truncate flex-1 pr-2">{p.name}</span>
                        <Badge variant="destructive" className="rounded-lg text-xs">
                          {getProductTotalStock(p)} left
                        </Badge>
                      </div>
                    ))}
                  </div>
                  {lowStockProducts.length > 4 && (
                    <Link href="/admin/products">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-3 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl text-xs"
                      >
                        View all {lowStockProducts.length} items
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}
          </motion.div>

          {/* Recent Orders */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="lg:col-span-2"
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold">Recent Orders</CardTitle>
                <Link href="/admin/orders">
                  <Button variant="ghost" size="sm" className="rounded-full text-xs gap-1">
                    View All <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {stats?.recentOrders && stats.recentOrders.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.recentOrders.map((order) => (
                        <TableRow key={order._id} className="hover:bg-muted/30">
                          <TableCell>
                            <p className="font-medium text-sm">{order.orderNumber}</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(order.createdAt)}
                            </p>
                          </TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            {formatCurrency(order.total)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={`${getStatusColor(order.status)} rounded-lg text-xs`}>
                              {order.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="rounded-2xl bg-muted/30 p-5 mb-4">
                      <Inbox className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium">No orders yet</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-[240px]">
                      Orders will appear here once customers start purchasing.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>}
      </div>
    </div>
  );
}
