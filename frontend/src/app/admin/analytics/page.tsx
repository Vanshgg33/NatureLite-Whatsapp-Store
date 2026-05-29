'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { flushSync } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  ChevronRight,
  FlaskConical,
  FileText,
  Download,
  BarChart3,
  Pencil,
  FileSpreadsheet,
  Copy,
  Check,
  Clock,
  History,
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { formatCurrency, getProductTotalStock } from '@/lib/utils';
import { useAdminAuthStore } from '@/lib/admin-store';
import { EmailReportButton } from '@/components/admin/email-report-button';
import { generateReportPdfBase64 } from '@/lib/report-pdf';
import type { RevenueDataPoint, ProductAnalytics, OrderAnalytics, Product, CustomerAnalytics, StockSnapshotItem, RawMaterialDailyItem, Store, MonthOverMonthData, TopCustomer, DailyAnalyticsReportResponse, AnalyticsNarrativeResponse, RawMaterial } from '@/types';

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [stockTab, setStockTab] = useState(false);
  const [selectedStockDate, setSelectedStockDate] = useState<string>('');
  const [stockStoreId, setStockStoreId] = useState<string>('');
  const [rawTab, setRawTab] = useState(false);
  const [selectedRawDate, setSelectedRawDate] = useState<string>('');
  const [rawStoreId, setRawStoreId] = useState<string>('');
  const [rmsTab, setRmsTab] = useState(false);
  const [stockEdit, setStockEdit] = useState<{
    item: StockSnapshotItem;
    stockInDelta: string;
    returnedDelta: string;
    damagedDelta: string;
    saleLogDelta: string;
    totalStock: string;
    adminPassword: string;
  } | null>(null);
  const [rawEdit, setRawEdit] = useState<{
    item: RawMaterialDailyItem;
    openingStock: string;
    stockIn: string;
    processed: string;
    outputLitres: string;
    closing: string;
    adminPassword: string;
  } | null>(null);
  const { user } = useAdminAuthStore();

  const [expandedImsRows, setExpandedImsRows] = useState<Record<string, boolean>>({});
  const [expandedPmsRows, setExpandedPmsRows] = useState<Record<string, boolean>>({});

  const toggleImsRow = (id: string) => {
    setExpandedImsRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const togglePmsRow = (id: string) => {
    setExpandedPmsRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [sheetsModal, setSheetsModal] = useState<{ type: 'ims' | 'pms' | 'rms'; storeId: string; date?: string } | null>(null);
  const [sheetsLinks, setSheetsLinks] = useState<{ imsLink: string; pmsLink: string; rmsLink: string } | null>(null);
  const [copiedFormula, setCopiedFormula] = useState(false);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [sheetsSyncOption, setSheetsSyncOption] = useState<'live' | 'date'>('live');

  useEffect(() => {
    if (sheetsModal) {
      setSheetsSyncOption(sheetsModal.date ? 'date' : 'live');
    }
  }, [sheetsModal]);

  useEffect(() => {
    if (sheetsModal?.storeId) {
      setIsLoadingLinks(true);
      api.getSheetsLinks(sheetsModal.storeId)
        .then((links) => {
          setSheetsLinks(links);
        })
        .catch((err) => {
          console.error('Failed to load Google Sheets links:', err);
          toast({
            title: 'Error loading connection links',
            description: 'Could not fetch secure sync links from server.',
            variant: 'destructive',
          });
          setSheetsLinks(null);
        })
        .finally(() => {
          setIsLoadingLinks(false);
        });
    } else {
      setSheetsLinks(null);
    }
    setCopiedFormula(false);
  }, [sheetsModal?.storeId, toast]);

  const activeExportUrl = useMemo(() => {
    if (!sheetsModal || !sheetsLinks) return '';
    const { type, date } = sheetsModal;
    
    if (type === 'rms') {
      return sheetsLinks.rmsLink;
    }
    
    const baseLink = type === 'ims' ? sheetsLinks.imsLink : sheetsLinks.pmsLink;
    if (sheetsSyncOption === 'date' && date) {
      return `${baseLink}&date=${date}`;
    }
    return baseLink;
  }, [sheetsModal, sheetsLinks, sheetsSyncOption]);

  const handleCopyFormula = () => {
    if (!activeExportUrl) return;
    const formula = `=IMPORTDATA("${activeExportUrl}")`;
    navigator.clipboard.writeText(formula)
      .then(() => {
        setCopiedFormula(true);
        toast({
          title: 'Formula copied!',
          description: 'Paste this into cell A1 of your Google Sheet.',
        });
        setTimeout(() => setCopiedFormula(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy to clipboard:', err);
        toast({
          title: 'Copy failed',
          description: 'Please copy the formula manually.',
          variant: 'destructive',
        });
      });
  };

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');
  const canEditAnalytics = user?.role === 'superadmin' || (user?.role === 'admin' && !user?.departmentType);
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

  const { data: rawMaterials = [], isLoading: rawMaterialsLoading } = useQuery<RawMaterial[]>({
    queryKey: ['raw-materials-for-analytics', activeRawStoreId],
    queryFn: () => api.getRawMaterials(activeRawStoreId),
    enabled: !!activeRawStoreId,
  });

  const stockAnalyticsEditMutation = useMutation({
    mutationFn: (data: {
      id: string;
      stockInDelta: number;
      returnedDelta: number;
      damagedDelta: number;
      saleLogDelta: number;
      totalStock: number;
      adminPassword: string;
    }) => api.updateStockAnalytics(data.id, {
      stockInDelta: data.stockInDelta,
      returnedDelta: data.returnedDelta,
      damagedDelta: data.damagedDelta,
      saleLogDelta: data.saleLogDelta,
      totalStock: data.totalStock,
      adminPassword: data.adminPassword,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-analytics-day'] });
      setStockEdit(null);
      toast({ title: 'IMS analytics updated' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update analytics';
      toast({
        title: 'Error updating IMS analytics',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  const rawAnalyticsEditMutation = useMutation({
    mutationFn: (data: {
      id: string;
      openingStock: number;
      stockIn: number;
      processed: number;
      outputLitres: number;
      closing: number;
      adminPassword: string;
    }) => api.updateRawMaterialAnalytics(data.id, {
      openingStock: data.openingStock,
      stockIn: data.stockIn,
      processed: data.processed,
      outputLitres: data.outputLitres,
      closing: data.closing,
      adminPassword: data.adminPassword,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-analytics-day'] });
      setRawEdit(null);
      toast({ title: 'Raw material analytics updated' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update analytics';
      toast({
        title: 'Error updating production analytics',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  function openStockEdit(item: StockSnapshotItem) {
    setStockEdit({
      item,
      stockInDelta: String(item.stockInDelta ?? 0),
      returnedDelta: String(item.returnedDelta ?? 0),
      damagedDelta: String(item.damagedDelta ?? 0),
      saleLogDelta: String(item.saleLogDelta ?? 0),
      totalStock: String(item.totalStock ?? 0),
      adminPassword: '',
    });
  }

  function openRawEdit(item: RawMaterialDailyItem) {
    setRawEdit({
      item,
      openingStock: String(item.openingStock ?? 0),
      stockIn: String(item.stockIn ?? 0),
      processed: String(item.processed ?? 0),
      outputLitres: String(item.outputLitres ?? 0),
      closing: String(item.closing ?? 0),
      adminPassword: '',
    });
  }

  function toNumber(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  const { data: topCustomersOverall } = useQuery({
    queryKey: ['top-customers-overall'],
    queryFn: () => api.getTopCustomersOverall(),
  });

  const { data: monthOverMonthData } = useQuery({
    queryKey: ['month-over-month'],
    queryFn: () => api.getMonthOverMonthByStore(),
  });

  const { data: dailyReport, isLoading: dailyReportLoading } = useQuery<DailyAnalyticsReportResponse | null>({
    queryKey: ['daily-analytics-report'],
    queryFn: () => api.getLatestDailyAnalyticsReport(),
  });

  const pdfReportRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showPdfTemplate, setShowPdfTemplate] = useState(false);
  const [pdfNarrative, setPdfNarrative] = useState<AnalyticsNarrativeResponse | null>(null);
  const [pdfNarrativeMeta, setPdfNarrativeMeta] = useState<{ title: string; summary: string; highlights: string[]; watchouts: string[]; actions: string[] } | null>(null);

  useEffect(() => {
    setPdfNarrative(null);
    setPdfNarrativeMeta(null);
  }, [days]);

  function downloadJsonFile(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function buildAnalyticsPdfBase64(): Promise<string> {
    const topSelling = (productAnalytics?.topSelling ?? []).slice(0, 12) as Array<{
      product?: { name?: string }; name?: string;
      sold?: number; totalSold?: number; count?: number; revenue?: number;
    }>;
    const hasProducts = topSelling.length > 0;

    const tableRows: Array<Array<string | number>> = hasProducts
      ? topSelling.map((p) => [
          p.product?.name || p.name || 'Unknown',
          p.sold ?? p.totalSold ?? p.count ?? 0,
          formatCurrency(p.revenue || 0),
        ])
      : (revenueData ?? []).slice(-14).map((d: RevenueDataPoint) => [
          d.date,
          d.orders ?? 0,
          formatCurrency(d.revenue || 0),
        ]);

    return generateReportPdfBase64({
      title: pdfTitle || `${periodLabels[days] || `${days} Days`} Analytics Report`,
      subtitle: `${formatDateLocal(startDate)} – ${formatDateLocal(today)}`,
      meta: [
        { label: 'Period', value: periodLabels[days] || `${days} Days` },
        { label: 'From', value: startDate },
        { label: 'To', value: today },
        { label: 'Customers', value: stats?.totalCustomers ?? 0 },
      ],
      summary: [
        { label: 'Revenue', value: formatCurrency(totalRevenue) },
        { label: 'Orders', value: totalOrders },
        { label: 'Avg Order', value: formatCurrency(avgOrderValue) },
        { label: 'Low Stock', value: lowStockProducts?.length ?? 0 },
      ],
      table: {
        columns: hasProducts ? ['Product', 'Units Sold', 'Revenue'] : ['Date', 'Orders', 'Revenue'],
        rows: tableRows,
      },
      filename: `Analytics-Report-${today}.pdf`,
    });
  }

  async function downloadPdfReport() {
    setDownloadingPdf(true);
    try {
      flushSync(() => {
        setShowPdfTemplate(true);
      });

      const buildLocalNarrative = (): AnalyticsNarrativeResponse => ({
        headline: `${periodLabels[days] || `${days} Days`} Analytics Report`,
        summary: `Performance overview for the selected ${periodLabels[days] || `${days}-day`} period.`,
        highlights: [
          `Revenue for the selected period: ${formatCurrency(totalRevenue)}`,
          `Orders processed: ${totalOrders}`,
          `Active customers: ${stats?.totalCustomers || 0}`,
        ],
        watchouts: [
          `Low stock items: ${lowStockProducts?.length || 0}`,
          'Customer signals and support activity should be reviewed regularly.',
        ],
        actions: [
          'Prioritize top-selling products in replenishment planning.',
          'Review low stock inventory and restock ahead of demand spikes.',
        ],
        generatedBy: 'fallback',
      });

      let narrative = pdfNarrative;
      if (!narrative) {
        try {
          narrative = await api.getAnalyticsNarrative(startDate, today);
        } catch {
          narrative = buildLocalNarrative();
        }
        flushSync(() => {
          setPdfNarrative(narrative);
          setPdfNarrativeMeta({
            title: narrative!.headline,
            summary: narrative!.summary,
            highlights: narrative!.highlights,
            watchouts: narrative!.watchouts,
            actions: narrative!.actions,
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
      } else {
        flushSync(() => {
          setPdfNarrativeMeta({
            title: narrative!.headline,
            summary: narrative!.summary,
            highlights: narrative!.highlights,
            watchouts: narrative!.watchouts,
            actions: narrative!.actions,
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!pdfReportRef.current) return;

      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      const canvas = await html2canvas(pdfReportRef.current, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.88);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let remainingHeight = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      remainingHeight -= pageHeight;

      while (remainingHeight > 0) {
        position = remainingHeight - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        remainingHeight -= pageHeight;
      }

      const periodLabel = `${periodLabels[days] || `${days} days`}`.replace(/\s+/g, '-');
      pdf.save(`Analytics-Report-${periodLabel}.pdf`);
    } finally {
      setShowPdfTemplate(false);
      setDownloadingPdf(false);
    }
  }

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

  // Compute day-of-week average revenue pattern
  const dayOfWeekData = useMemo(() => {
    if (!revenueData) return [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets = days.map((day) => ({ day, revenue: 0, orders: 0, count: 0 }));
    revenueData.forEach((d: RevenueDataPoint) => {
      const dow = new Date(d.date + 'T00:00:00').getDay();
      buckets[dow].revenue += d.revenue;
      buckets[dow].orders += d.orders;
      buckets[dow].count++;
    });
    return buckets.map((b) => ({
      day: b.day,
      avgRevenue: b.count > 0 ? Math.round(b.revenue / b.count) : 0,
      avgOrders: b.count > 0 ? Math.round(b.orders / b.count) : 0,
    }));
  }, [revenueData]);

  // Cumulative revenue over period
  const cumulativeRevenueData = useMemo(() => {
    if (!revenueData) return [];
    let running = 0;
    return revenueData.map((d: RevenueDataPoint) => {
      running += d.revenue;
      return { date: d.date, cumulative: running };
    });
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

  const imsStoreName = stores.find((s) => s._id === activeStockStoreId)?.name || 'Main Store';
  const pmsStoreName = stores.find((s) => s._id === activeRawStoreId)?.name || 'Main Store';

  const imsDayItems = (stockAnalyticsDay?.items ?? []) as StockSnapshotItem[];
  const imsTotalStockIn = imsDayItems.reduce((s, i) => s + (i.stockInDelta ?? 0), 0);
  const imsTotalReturned = imsDayItems.reduce((s, i) => s + (i.returnedDelta ?? 0), 0);
  const imsTotalDamaged = imsDayItems.reduce((s, i) => s + (i.damagedDelta ?? 0), 0);
  const imsTotalSaleLog = imsDayItems.reduce((s, i) => s + (i.saleLogDelta ?? 0), 0);

  const pmsDayItems = (rawAnalyticsDay?.items ?? []) as RawMaterialDailyItem[];
  const pmsTotalStockIn = pmsDayItems.reduce((s, i) => s + (i.stockIn ?? 0), 0);
  const pmsTotalProcessed = pmsDayItems.reduce((s, i) => s + (i.processed ?? 0), 0);
  const pmsTotalOutput = pmsDayItems.reduce((s, i) => s + (i.outputLitres ?? 0), 0);

  const rmsGoodCount = rawMaterials.filter((m) => m.totalStock >= 20).length;
  const rmsLowCount = rawMaterials.filter((m) => m.totalStock > 0 && m.totalStock < 20).length;
  const rmsCriticalCount = rawMaterials.filter((m) => m.totalStock <= 0).length;

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

  const pdfTitle = pdfNarrativeMeta?.title || `${periodLabels[days] || `${days} Days`} Analytics Report`;
  const pdfSummary = pdfNarrativeMeta?.summary || `Performance overview for the selected ${periodLabels[days] || `${days}-day`} period.`;
  const pdfHighlights = pdfNarrativeMeta?.highlights || [
    `Revenue for the selected period: ${formatCurrency(totalRevenue)}`,
    `Orders processed: ${totalOrders}`,
    `Active customers: ${stats?.totalCustomers || 0}`,
  ];
  const pdfWatchouts = pdfNarrativeMeta?.watchouts || [
    `Low stock items: ${(lowStockProducts?.length || 0)}`,
    `Customer signals and support activity should be reviewed regularly.`,
  ];
  const pdfActions = pdfNarrativeMeta?.actions || [
    'Prioritize top-selling products in replenishment planning.',
    'Review low stock inventory and restock ahead of demand spikes.',
  ];

  return (
    <div>
      <Header title="Analytics" description="Track your store performance" />

      <div className="p-6 space-y-6">
        {/* Period Selector & Export Action */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4 flex-wrap"
        >
          <div className="flex items-center gap-2 flex-wrap">
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
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={downloadPdfReport}
              disabled={downloadingPdf}
              className="bg-gradient-to-r from-[#173125] to-[#2F6B47] text-white hover:opacity-90 shadow-md border-0 rounded-full px-5 py-2 flex items-center gap-2 font-semibold text-sm transition-all duration-300"
            >
              <Download className="h-4 w-4" />
              {downloadingPdf ? 'Generating PDF...' : 'Export Complete PDF Report'}
            </Button>
            <EmailReportButton
              generatePdfBase64={buildAnalyticsPdfBase64}
              filename={`Analytics-Report-${periodLabels[days] || `${days}d`}.pdf`}
              subject="Analytics Report"
              disabled={downloadingPdf}
              className="bg-gradient-to-r from-[#92400E] to-[#D97706] text-white hover:opacity-90 shadow-md border-0 rounded-full px-5 py-2 font-semibold text-sm transition-all duration-300 h-auto"
              variant="default"
              size="default"
            />
          </div>
        </motion.div>

        {/* Daily Report */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <Card className="rounded-2xl shadow-sm border-brand-green/15">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-brand-green/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-brand-green" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold">Daily Report</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Auto-generated every day at 12:00 AM (IST)
                  </p>
                </div>
              </div>
              {dailyReport?.report && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={downloadPdfReport}
                    disabled={downloadingPdf}
                  >
                    <Download className="h-4 w-4" />
                    {downloadingPdf ? 'Generating PDF…' : 'PDF'}
                  </Button>
                  <EmailReportButton
                    generatePdfBase64={buildAnalyticsPdfBase64}
                    filename={`Analytics-Report-${dailyReport.report?.date || 'daily'}.pdf`}
                    subject="Daily Analytics Report"
                    disabled={downloadingPdf}
                    className="bg-gradient-to-r from-[#92400E] to-[#D97706] text-white hover:opacity-90 shadow-sm border-0 rounded-md px-3 py-2 font-semibold text-sm h-9"
                    variant="default"
                    size="sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => downloadJsonFile(`daily-analytics-${dailyReport.report?.date || 'report'}.json`, dailyReport)}
                  >
                    <Download className="h-4 w-4" />
                    JSON
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {dailyReportLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />)}
                </div>
              ) : !dailyReport?.report ? (
                <p className="text-sm text-muted-foreground">No daily report found yet. It will appear after the next midnight run.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border p-3 bg-gray-50/50">
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className="text-lg font-bold text-brand-green">{formatCurrency(dailyReport.report.kpis.totalRevenue || 0)}</p>
                    </div>
                    <div className="rounded-xl border p-3 bg-gray-50/50">
                      <p className="text-xs text-muted-foreground">Orders</p>
                      <p className="text-lg font-bold">{dailyReport.report.kpis.totalOrders || 0}</p>
                    </div>
                    <div className="rounded-xl border p-3 bg-gray-50/50">
                      <p className="text-xs text-muted-foreground">Delivered Rate</p>
                      <p className="text-lg font-bold text-emerald-600">{(dailyReport.report.kpis.deliveredRate || 0).toFixed(1)}%</p>
                    </div>
                    <div className="rounded-xl border p-3 bg-gray-50/50">
                      <p className="text-xs text-muted-foreground">Low/Out Stock</p>
                      <p className="text-lg font-bold text-amber-600">
                        {(dailyReport.report.kpis.lowStockProducts || 0) + (dailyReport.report.kpis.outOfStockProducts || 0)}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Summary</p>
                    <pre className="text-xs whitespace-pre-wrap leading-relaxed text-gray-700 font-mono">{dailyReport.summary}</pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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

        {/* Day of Week Pattern + Cumulative Revenue */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Day of Week Revenue Pattern */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.46 }}
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Revenue by Day of Week</CardTitle>
                  <p className="text-sm text-muted-foreground">Avg per weekday over {days}-day period</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  {dayOfWeekData.some((d) => d.avgRevenue > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dayOfWeekData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                        <YAxis
                          axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }}
                          tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number, name: string) =>
                            name === 'avgRevenue'
                              ? [formatCurrency(value), 'Avg Revenue']
                              : [value, 'Avg Orders']}
                        />
                        <Bar dataKey="avgRevenue" fill="#2F6B47" radius={[6, 6, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Not enough data for pattern
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Cumulative Revenue Growth */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.48 }}
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Cumulative Revenue</CardTitle>
                  <p className="text-sm text-muted-foreground">Running total over period</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Period Total</p>
                  <p className="text-base font-bold text-brand-green">{formatCurrency(totalRevenue)}</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  {cumulativeRevenueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cumulativeRevenueData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="cumulGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2F6B47" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#2F6B47" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(val) => { const d = new Date(val); return `${d.getDate()}/${d.getMonth() + 1}`; }}
                          axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }}
                        />
                        <YAxis
                          axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }}
                          tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number) => [formatCurrency(value), 'Cumulative Revenue']}
                          labelFormatter={(label) => new Date(label).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        />
                        <Area
                          type="monotone"
                          dataKey="cumulative"
                          stroke="#2F6B47"
                          strokeWidth={2.5}
                          fill="url(#cumulGrad)"
                          dot={false}
                          activeDot={{ r: 4, fill: '#2F6B47', stroke: '#fff', strokeWidth: 2 }}
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
        {/* Top Customers + Month-over-Month */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Customers Spending */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.57 }}
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader className="flex flex-row items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Users className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold">Top Customers</CardTitle>
                  <p className="text-sm text-muted-foreground">By total spend</p>
                </div>
              </CardHeader>
              <CardContent>
                {topCustomersOverall && topCustomersOverall.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topCustomersOverall.slice(0, 7).map((c: TopCustomer) => ({
                          name: (c.customerName || c._id || '?').slice(0, 16),
                          spent: c.totalSpent,
                          orders: c.totalOrders,
                        }))}
                        layout="vertical"
                        margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis
                          type="number"
                          axisLine={false} tickLine={false}
                          tick={{ fontSize: 11, fill: '#888' }}
                          tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                        />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#555' }} width={100} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number, name: string) =>
                            name === 'spent' ? [formatCurrency(value), 'Total Spent'] : [value, 'Orders']}
                        />
                        <Bar dataKey="spent" fill="#F97316" radius={[0, 6, 6, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm">
                    <Users className="h-8 w-8 mb-2 opacity-30" />
                    No customer data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Month-over-Month Store Comparison */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.59 }}
          >
            <Card className="rounded-2xl shadow-sm h-full">
              <CardHeader className="flex flex-row items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold">Month vs Last Month</CardTitle>
                  <p className="text-sm text-muted-foreground">Revenue comparison by store</p>
                </div>
              </CardHeader>
              <CardContent>
                {monthOverMonthData && monthOverMonthData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthOverMonthData.map((d: MonthOverMonthData) => ({
                          store: d.storeName.length > 12 ? d.storeName.slice(0, 12) + '…' : d.storeName,
                          thisMonth: d.thisMonth,
                          lastMonth: d.lastMonth,
                          change: d.changePercent,
                        }))}
                        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="store" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} />
                        <YAxis
                          axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }}
                          tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value: number, name: string) => [
                            formatCurrency(value),
                            name === 'thisMonth' ? 'This Month' : 'Last Month',
                          ]}
                        />
                        <Legend
                          formatter={(v) => (
                            <span style={{ fontSize: '12px', color: '#666' }}>
                              {v === 'thisMonth' ? 'This Month' : 'Last Month'}
                            </span>
                          )}
                        />
                        <Bar dataKey="thisMonth" fill="#2F6B47" radius={[4, 4, 0, 0]} maxBarSize={30} />
                        <Bar dataKey="lastMonth" fill="#E8A838" radius={[4, 4, 0, 0]} maxBarSize={30} opacity={0.75} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm">
                    <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
                    No comparison data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* IMS Analytics - Stock History */}
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
                  <CardTitle className="text-base font-semibold">IMS Analytics — Product Stock History</CardTitle>
                  <p className="text-xs text-muted-foreground font-normal mt-0.5">Track packed inventory, stock-in, returned, damaged and sales day-wise</p>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${stockTab ? 'rotate-180' : ''}`} />
            </CardHeader>

            {stockTab && (
              <CardContent className="space-y-5 pt-2">
                {/* Store + Date selectors */}
                <div className="flex flex-wrap items-end justify-between w-full gap-3">
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

                  {activeStockStoreId && (
                    <Button
                      variant="outline"
                      className="h-9 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 gap-2 rounded-xl text-xs font-semibold px-4 shadow-sm"
                      onClick={() => setSheetsModal({ type: 'ims', storeId: activeStockStoreId, date: selectedStockDate })}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>Google Sheets Sync</span>
                    </Button>
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
                              {canEditAnalytics && <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Edit</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(stockAnalyticsDay.items as StockSnapshotItem[]).map((item) => {
                              const isExpanded = !!expandedImsRows[item._id];
                              return (
                                <Fragment key={item._id}>
                                  <tr className="hover:bg-gray-50/60 transition-colors border-b">
                                    <td className="px-4 py-3.5">
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => toggleImsRow(item._id)}
                                          className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1.5 text-left font-semibold text-gray-900"
                                          title="View detailed change logs"
                                        >
                                          {isExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-blue-500 shrink-0" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4 shrink-0" />
                                          )}
                                          <span className="hover:underline">{item.productName || '—'}</span>
                                        </button>
                                        {item.entries && item.entries.length > 0 && (
                                          <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100/50 text-[10px] px-1.5 py-0 rounded-full font-bold">
                                            {item.entries.length} {item.entries.length === 1 ? 'change' : 'changes'}
                                          </Badge>
                                        )}
                                      </div>
                                    </td>
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
                                    {canEditAnalytics && (
                                      <td className="px-4 py-3.5 text-right">
                                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openStockEdit(item)}>
                                          <Pencil className="h-3.5 w-3.5" /> Edit
                                        </Button>
                                      </td>
                                    )}
                                  </tr>

                                  {isExpanded && (
                                    <tr className="bg-gray-50/40">
                                      <td colSpan={canEditAnalytics ? 8 : 7} className="px-6 py-4 border-b">
                                        <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm space-y-3">
                                          <div className="flex items-center justify-between border-b pb-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                                              <Clock className="h-3.5 w-3.5 text-blue-500" /> Audit Log (Changes Today)
                                            </h4>
                                            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                              {item.entries?.length || 0} updates
                                            </span>
                                          </div>
                                          
                                          {!item.entries || item.entries.length === 0 ? (
                                            <p className="text-xs text-gray-400 text-center py-2">No modification history for this day.</p>
                                          ) : (
                                            <div className="overflow-x-auto">
                                              <table className="w-full text-xs text-left">
                                                <thead>
                                                  <tr className="text-gray-450 border-b">
                                                    <th className="py-2 font-semibold">Time (IST)</th>
                                                    <th className="py-2 font-semibold">Logged By</th>
                                                    {item.entries?.some(e => e.variantSku) && <th className="py-2 font-semibold">SKU / Variant</th>}
                                                    <th className="py-2 font-semibold text-right text-emerald-600">Stock In</th>
                                                    <th className="py-2 font-semibold text-right text-blue-500">Returned</th>
                                                    <th className="py-2 font-semibold text-right text-amber-500">Damaged</th>
                                                    <th className="py-2 font-semibold text-right text-red-500">Sales Log</th>
                                                    <th className="py-2 font-semibold text-right text-gray-700">Resulting Stock</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                  {item.entries.map((entry, idx) => (
                                                    <tr key={entry._id || idx} className="hover:bg-gray-50/50">
                                                      <td className="py-2 text-gray-500">
                                                        {new Date(entry.loggedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                      </td>
                                                      <td className="py-2 font-medium text-gray-700">
                                                        {entry.loggedByName || 'System'}
                                                      </td>
                                                      {item.entries?.some(e => e.variantSku) && (
                                                        <td className="py-2 text-gray-500 font-mono text-[10px]">
                                                          {entry.variantSku || '—'}
                                                        </td>
                                                      )}
                                                      <td className="py-2 text-right">
                                                        {entry.stockInDelta > 0 ? (
                                                          <span className="text-emerald-600 font-semibold">+{entry.stockInDelta}</span>
                                                        ) : (
                                                          <span className="text-gray-300">—</span>
                                                        )}
                                                      </td>
                                                      <td className="py-2 text-right">
                                                        {entry.returnedDelta > 0 ? (
                                                          <span className="text-blue-500 font-semibold">+{entry.returnedDelta}</span>
                                                        ) : (
                                                          <span className="text-gray-300">—</span>
                                                        )}
                                                      </td>
                                                      <td className="py-2 text-right">
                                                        {entry.damagedDelta > 0 ? (
                                                          <span className="text-amber-500 font-semibold">+{entry.damagedDelta}</span>
                                                        ) : (
                                                          <span className="text-gray-300">—</span>
                                                        )}
                                                      </td>
                                                      <td className="py-2 text-right">
                                                        {entry.saleLogDelta > 0 ? (
                                                          <span className="text-red-500 font-semibold">−{entry.saleLogDelta}</span>
                                                        ) : (
                                                          <span className="text-gray-300">—</span>
                                                        )}
                                                      </td>
                                                      <td className="py-2 text-right font-bold text-gray-800">
                                                        {entry.resultingStock}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
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

        {/* PMS Analytics - Production Logs */}
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
                  <CardTitle className="text-base font-semibold">PMS Analytics — Production History</CardTitle>
                  <p className="text-xs text-muted-foreground font-normal mt-0.5">Track raw materials processed and finished oil output day-wise</p>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${rawTab ? 'rotate-180' : ''}`} />
            </CardHeader>

            {rawTab && (
              <CardContent className="space-y-5 pt-2">
                {/* Store + Date selectors */}
                <div className="flex flex-wrap items-end justify-between w-full gap-3">
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

                  {activeRawStoreId && (
                    <Button
                      variant="outline"
                      className="h-9 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 gap-2 rounded-xl text-xs font-semibold px-4 shadow-sm"
                      onClick={() => setSheetsModal({ type: 'pms', storeId: activeRawStoreId, date: selectedRawDate })}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>Google Sheets Sync</span>
                    </Button>
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
                                  {canEditAnalytics && <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Edit</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {items.map((item) => {
                                  const closing = item.closing;
                                  const isExpanded = !!expandedPmsRows[item._id];
                                  const badge = closing <= 0
                                    ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                                    : closing < 10
                                    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                                    : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
                                  return (
                                    <Fragment key={item._id}>
                                      <tr className="hover:bg-gray-50/60 transition-colors border-b">
                                        <td className="px-4 py-3.5">
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => togglePmsRow(item._id)}
                                              className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-amber-600 transition-colors flex items-center gap-1.5 text-left font-semibold text-gray-900"
                                              title="View detailed change logs"
                                            >
                                              {isExpanded ? (
                                                <ChevronDown className="h-4 w-4 text-amber-500 shrink-0" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0" />
                                              )}
                                              <span className="hover:underline">{item.materialName || '—'}</span>
                                            </button>
                                            {item.entries && item.entries.length > 0 && (
                                              <Badge variant="secondary" className="bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100/50 text-[10px] px-1.5 py-0 rounded-full font-bold">
                                                {item.entries.length} {item.entries.length === 1 ? 'log' : 'logs'}
                                              </Badge>
                                            )}
                                          </div>
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
                                        {canEditAnalytics && (
                                          <td className="px-4 py-3.5 text-right">
                                            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openRawEdit(item)}>
                                              <Pencil className="h-3.5 w-3.5" /> Edit
                                            </Button>
                                          </td>
                                        )}
                                      </tr>

                                      {isExpanded && (
                                        <tr className="bg-gray-50/40">
                                          <td colSpan={canEditAnalytics ? 7 : 6} className="px-6 py-4 border-b">
                                            <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm space-y-3">
                                              <div className="flex items-center justify-between border-b pb-2">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                                                  <Clock className="h-3.5 w-3.5 text-amber-500" /> Audit Log (Production Entries)
                                                </h4>
                                                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                                  {item.entries?.length || 0} updates
                                                </span>
                                              </div>
                                              
                                              {!item.entries || item.entries.length === 0 ? (
                                                <p className="text-xs text-gray-400 text-center py-2">No production entry history for this day.</p>
                                              ) : (
                                                <div className="overflow-x-auto">
                                                  <table className="w-full text-xs text-left">
                                                    <thead>
                                                      <tr className="text-gray-450 border-b">
                                                        <th className="py-2 font-semibold">Time (IST)</th>
                                                        <th className="py-2 font-semibold">Logged By</th>
                                                        <th className="py-2 font-semibold text-center">Opening</th>
                                                        <th className="py-2 font-semibold text-center text-emerald-600">Stock In</th>
                                                        <th className="py-2 font-semibold text-center text-orange-500">Processed</th>
                                                        {item.entries?.some(e => e.outputLitres > 0) && (
                                                          <th className="py-2 font-semibold text-center text-amber-600">Oil Output (L)</th>
                                                        )}
                                                        <th className="py-2 font-semibold text-center text-gray-700">Closing</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                      {item.entries.map((entry, idx) => (
                                                        <tr key={entry._id || idx} className="hover:bg-gray-50/50">
                                                          <td className="py-2 text-gray-500">
                                                            {new Date(entry.loggedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                          </td>
                                                          <td className="py-2 font-medium text-gray-700">
                                                            {entry.loggedByName || 'System'}
                                                          </td>
                                                          <td className="py-2 text-center text-gray-600">
                                                            {entry.openingStock}
                                                          </td>
                                                          <td className="py-2 text-center">
                                                            {entry.stockIn > 0 ? (
                                                              <span className="text-emerald-600 font-semibold">+{entry.stockIn}</span>
                                                            ) : (
                                                              <span className="text-gray-300">—</span>
                                                            )}
                                                          </td>
                                                          <td className="py-2 text-center">
                                                            {entry.processed > 0 ? (
                                                              <span className="text-orange-500 font-semibold">−{entry.processed}</span>
                                                            ) : (
                                                              <span className="text-gray-300">—</span>
                                                            )}
                                                          </td>
                                                          {item.entries?.some(e => e.outputLitres > 0) && (
                                                            <td className="py-2 text-center text-amber-600 font-medium">
                                                              {entry.outputLitres > 0 ? `${entry.outputLitres} L` : '—'}
                                                            </td>
                                                          )}
                                                          <td className="py-2 text-center font-bold text-gray-800">
                                                            {entry.closing}
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
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

        {/* RMS Analytics - Raw Material Inventory */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardHeader
              className="flex flex-row items-center justify-between cursor-pointer select-none hover:bg-gray-50/60 transition-colors"
              onClick={() => setRmsTab(!rmsTab)}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Package className="h-4.5 w-4.5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">RMS Analytics — Raw Material Stock Levels</CardTitle>
                  <p className="text-xs text-muted-foreground font-normal mt-0.5">Track current factory raw material inventory levels and statuses</p>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${rmsTab ? 'rotate-180' : ''}`} />
            </CardHeader>

            {rmsTab && (
              <CardContent className="space-y-5 pt-2">
                {/* Store selector */}
                <div className="flex flex-wrap items-end justify-between w-full gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    {isSuperadmin && rawStores.length > 0 && (
                      <div className="w-52">
                        <label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Store / Factory</label>
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
                  </div>

                  {activeRawStoreId && (
                    <Button
                      variant="outline"
                      className="h-9 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 gap-2 rounded-xl text-xs font-semibold px-4 shadow-sm"
                      onClick={() => setSheetsModal({ type: 'rms', storeId: activeRawStoreId })}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>Google Sheets Sync</span>
                    </Button>
                  )}
                </div>

                {rawMaterialsLoading ? (
                  <div className="space-y-2 py-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
                  </div>
                ) : !activeRawStoreId ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <FlaskConical className="h-10 w-10 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Select a store to view raw material stock</p>
                  </div>
                ) : rawMaterials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <FlaskConical className="h-10 w-10 text-gray-200 mb-3" />
                    <p className="text-sm font-medium text-gray-500">No raw material stock logged</p>
                    <p className="text-xs text-gray-400 mt-1">Add raw materials in PMS to view current stock here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Status metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Materials', value: rawMaterials.length, tone: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
                        { label: 'Good Stock (>=20)', value: rmsGoodCount, tone: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                        { label: 'Low Stock (<20)', value: rmsLowCount, tone: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
                        { label: 'Critical / Zero', value: rmsCriticalCount, tone: 'text-red-700', bg: 'bg-red-50', border: 'border-red-100' },
                      ].map((stat) => (
                        <div key={stat.label} className={`rounded-xl border ${stat.border} ${stat.bg} px-4 py-3 shadow-sm`}>
                          <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wider">{stat.label}</p>
                          <p className={`text-xl font-bold ${stat.tone}`}>{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Stock Table */}
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Material</th>
                            <th className="text-center px-3 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Unit</th>
                            <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Current Stock</th>
                            <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {rawMaterials.map((m) => {
                            const totalStock = m.totalStock ?? 0;
                            const isCritical = totalStock <= 0;
                            const isLow = totalStock > 0 && totalStock < 20;
                            return (
                              <tr key={m._id} className="hover:bg-gray-50/60 transition-colors">
                                <td className="px-4 py-3 font-semibold text-gray-950">{m.name}</td>
                                <td className="px-3 py-3 text-center text-gray-400 font-mono text-xs">{m.unit || 'kg'}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-base font-black ${isCritical ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    {totalStock}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {isCritical ? (
                                    <Badge className="bg-red-100 text-red-700 border-0">Critical</Badge>
                                  ) : isLow ? (
                                    <Badge className="bg-amber-100 text-amber-700 border-0">Low Stock</Badge>
                                  ) : (
                                    <Badge className="bg-emerald-100 text-emerald-700 border-0">Good</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </motion.div>

        <Dialog open={!!stockEdit} onOpenChange={(open) => !open && setStockEdit(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit IMS Analytics</DialogTitle>
            </DialogHeader>
            {stockEdit && (
              <div className="space-y-4 py-1">
                <div className="rounded-xl border bg-gray-50 px-4 py-3">
                  <p className="font-semibold text-gray-900">{stockEdit.item.productName || 'Product'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedStockDate ? formatDateLocalLong(selectedStockDate) : stockEdit.item.date}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Stock In', key: 'stockInDelta' as const },
                    { label: 'Returned', key: 'returnedDelta' as const },
                    { label: 'Damaged', key: 'damagedDelta' as const },
                    { label: 'Sale Log', key: 'saleLogDelta' as const },
                    { label: 'Total Stock', key: 'totalStock' as const },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">{field.label}</label>
                      <Input
                        type="number"
                        min="0"
                        value={stockEdit[field.key]}
                        onChange={(e) => setStockEdit({ ...stockEdit, [field.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Admin Password</label>
                  <Input
                    type="password"
                    value={stockEdit.adminPassword}
                    onChange={(e) => setStockEdit({ ...stockEdit, adminPassword: e.target.value })}
                    placeholder="Required to edit analytics"
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStockEdit(null)}>Cancel</Button>
              <Button
                disabled={!stockEdit?.adminPassword.trim() || stockAnalyticsEditMutation.isPending}
                onClick={() => stockEdit && stockAnalyticsEditMutation.mutate({
                  id: stockEdit.item._id,
                  stockInDelta: toNumber(stockEdit.stockInDelta),
                  returnedDelta: toNumber(stockEdit.returnedDelta),
                  damagedDelta: toNumber(stockEdit.damagedDelta),
                  saleLogDelta: toNumber(stockEdit.saleLogDelta),
                  totalStock: toNumber(stockEdit.totalStock),
                  adminPassword: stockEdit.adminPassword,
                })}
              >
                {stockAnalyticsEditMutation.isPending ? 'Saving...' : 'Save Analytics'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!rawEdit} onOpenChange={(open) => !open && setRawEdit(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit PMS/RMS Analytics</DialogTitle>
            </DialogHeader>
            {rawEdit && (
              <div className="space-y-4 py-1">
                <div className="rounded-xl border bg-gray-50 px-4 py-3">
                  <p className="font-semibold text-gray-900">{rawEdit.item.materialName || 'Raw material'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedRawDate ? formatDateLocalLong(selectedRawDate) : rawEdit.item.date}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Opening', key: 'openingStock' as const },
                    { label: 'Stock In', key: 'stockIn' as const },
                    { label: 'Processed', key: 'processed' as const },
                    { label: 'Output Litres', key: 'outputLitres' as const },
                    { label: 'Closing', key: 'closing' as const },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">{field.label}</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rawEdit[field.key]}
                        onChange={(e) => setRawEdit({ ...rawEdit, [field.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Admin Password</label>
                  <Input
                    type="password"
                    value={rawEdit.adminPassword}
                    onChange={(e) => setRawEdit({ ...rawEdit, adminPassword: e.target.value })}
                    placeholder="Required to edit analytics"
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRawEdit(null)}>Cancel</Button>
              <Button
                disabled={!rawEdit?.adminPassword.trim() || rawAnalyticsEditMutation.isPending}
                onClick={() => rawEdit && rawAnalyticsEditMutation.mutate({
                  id: rawEdit.item._id,
                  openingStock: toNumber(rawEdit.openingStock),
                  stockIn: toNumber(rawEdit.stockIn),
                  processed: toNumber(rawEdit.processed),
                  outputLitres: toNumber(rawEdit.outputLitres),
                  closing: toNumber(rawEdit.closing),
                  adminPassword: rawEdit.adminPassword,
                })}
              >
                {rawAnalyticsEditMutation.isPending ? 'Saving...' : 'Save Analytics'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!sheetsModal} onOpenChange={(open) => !open && setSheetsModal(null)}>
          <DialogContent className="max-w-xl bg-white border border-gray-100 rounded-3xl shadow-2xl p-6">
            <DialogHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100/50">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600 animate-pulse" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-gray-900">
                    Google Sheets & CSV Sync
                  </DialogTitle>
                  <p className="text-xs text-gray-400">
                    Establish a secure, live data connection with your spreadsheet
                  </p>
                </div>
              </div>
            </DialogHeader>

            {isLoadingLinks ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <div className="h-8 w-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                <p className="text-xs text-gray-400 font-medium">Generating secure encryption tokens...</p>
              </div>
            ) : !sheetsLinks ? (
              <div className="py-10 text-center space-y-2">
                <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
                <p className="text-sm font-semibold text-gray-800">Connection Failed</p>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Unable to connect to the backend server to generate secure integration links.
                </p>
              </div>
            ) : (
              <div className="space-y-6 mt-4">
                {/* Information Callout */}
                <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-2xl p-4 flex gap-3 text-emerald-800 text-xs">
                  <Warehouse className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">How it works</p>
                    <p className="text-emerald-700/90 leading-relaxed">
                      Google Sheets will dynamically query this secure feed using 128-bit SHA-256 tokens unique to your store. Your credentials remain hidden, and data is updated live.
                    </p>
                  </div>
                </div>

                {/* Option Selector (only for IMS/PMS with dates) */}
                {sheetsModal?.type !== 'rms' && sheetsModal?.date && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Sync Scope</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSheetsSyncOption('live')}
                        className={`flex flex-col text-left p-3.5 rounded-2xl border transition-all ${
                          sheetsSyncOption === 'live'
                            ? 'border-emerald-600 bg-emerald-50/20 shadow-sm ring-1 ring-emerald-600/30'
                            : 'border-gray-100 hover:border-gray-200 bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${sheetsSyncOption === 'live' ? 'bg-emerald-500 animate-ping' : 'bg-gray-300'}`} />
                          Live Stock Feed
                        </span>
                        <span className="text-[10px] text-gray-400 mt-1 leading-normal">
                          Always fetches current stock and pricing status dynamically.
                        </span>
                      </button>

                      <button
                        onClick={() => setSheetsSyncOption('date')}
                        className={`flex flex-col text-left p-3.5 rounded-2xl border transition-all ${
                          sheetsSyncOption === 'date'
                            ? 'border-emerald-600 bg-emerald-50/20 shadow-sm ring-1 ring-emerald-600/30'
                            : 'border-gray-100 hover:border-gray-200 bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                          Day Snapshot
                        </span>
                        <span className="text-[10px] text-gray-400 mt-1 leading-normal">
                          Locks spreadsheet query to history of {formatDateLocal(sheetsModal.date)}.
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Main integration panels */}
                <div className="space-y-4">
                  {/* Step 1: Direct Download */}
                  <div className="border border-gray-100 rounded-2xl p-4 flex items-center justify-between bg-gray-50/30">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-gray-900">Manual CSV Export</p>
                      <p className="text-[10px] text-gray-400">Download formatted table file instantly.</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white hover:bg-gray-50 border-gray-200 gap-1.5 text-xs rounded-xl h-9"
                      onClick={() => window.open(activeExportUrl, '_blank')}
                    >
                      <Download className="h-3.5 w-3.5 text-gray-600" />
                      <span>Download CSV</span>
                    </Button>
                  </div>

                  {/* Step 2: Live Google Sheets formula */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-900">Live Google Sheets connection formula</p>
                    <p className="text-[10px] text-gray-400 leading-normal">
                      Copy the formula below, open a blank Google Sheet, and paste it into cell <strong className="text-gray-900">A1</strong>.
                    </p>

                    <div className="relative mt-2 rounded-2xl bg-gray-950 p-4 border border-gray-900 group">
                      <code className="text-xs font-mono text-emerald-400 block pr-12 select-all break-all leading-relaxed whitespace-pre-wrap">
                        {`=IMPORTDATA("${activeExportUrl}")`}
                      </code>
                      <button
                        onClick={handleCopyFormula}
                        className="absolute right-3.5 top-3.5 h-8 w-8 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition-all shadow-md active:scale-95"
                        title="Copy to clipboard"
                      >
                        {copiedFormula ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-gray-400 text-center leading-normal border-t border-gray-50 pt-4">
                  Note: Google Sheets typically auto-refreshes dynamic IMPORTDATA URLs every 1-2 hours. Keep your secret link secure to protect your business data privacy.
                </div>
              </div>
            )}
            
            <DialogFooter className="border-t border-gray-50 pt-4 mt-6">
              <Button
                className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-10 text-xs font-semibold"
                onClick={() => setSheetsModal(null)}
              >
                Close Connection Panel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {showPdfTemplate && (
        <div
          ref={pdfReportRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-12000px',
            top: 0,
            width: '1120px',
            background: '#ffffff',
            color: '#0f172a',
            pointerEvents: 'none',
          }}
        >
          <div className="space-y-6" style={{ padding: '0', background: '#f8faf9' }}>
            {/* ── PDF HEADER ── no overflow:hidden — html2canvas can't render inside clipped containers */}
            <div style={{ background: '#0F2318' }}>
              {/* Gold top accent bar */}
              <div style={{ height: '5px', background: 'linear-gradient(90deg,#C8900A,#E8A838,#D4A017,#C8900A)', width: '100%' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', padding: '36px 48px 44px' }}>
                <div style={{ flex: 1 }}>
                  {/* Brand pill */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(212,160,23,0.15)', border: '1px solid rgba(212,160,23,0.35)', borderRadius: '8px', padding: '5px 14px', marginBottom: '16px' }}>
                    <span style={{ color: '#D4A017', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' }}>Nature Lite</span>
                    <span style={{ color: 'rgba(255,255,255,0.25)', margin: '0 8px', fontSize: '11px' }}>|</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Admin Panel</span>
                  </div>
                  <div style={{ height: '1px', background: 'linear-gradient(90deg,rgba(212,160,23,0.5),rgba(212,160,23,0.1),transparent)', marginBottom: '14px', width: '300px' }} />
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '10px' }}>Analytics Report · Confidential</p>
                  <h1 style={{ color: '#fff', fontSize: '34px', fontWeight: '900', lineHeight: '1.15', margin: '0 0 14px', letterSpacing: '-0.5px' }}>{pdfTitle}</h1>
                  <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', lineHeight: '1.7', maxWidth: '560px', margin: 0 }}>{pdfSummary}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', flexShrink: 0 }}>
                  <div style={{ background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.28)', borderRadius: '14px', padding: '16px 20px', textAlign: 'right' }}>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 6px' }}>Period</p>
                    <p style={{ color: '#fff', fontSize: '18px', fontWeight: '700', margin: '0 0 4px' }}>{periodLabels[days] || `${days} Days`}</p>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', margin: 0 }}>{formatDateLocal(startDate)} – {formatDateLocal(today)}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '10px 16px', textAlign: 'right' }}>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 4px' }}>Generated</p>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', margin: 0 }}>{new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '0 40px' }} className="space-y-6">

            {/* ── SECTION LABEL ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ height: '2px', flex: 1, background: 'linear-gradient(90deg,#2F6B47,transparent)' }} />
              <span style={{ color: '#2F6B47', fontSize: '10px', fontWeight: '700', letterSpacing: '3px', textTransform: 'uppercase' }}>Sales Analytics</span>
              <div style={{ height: '2px', flex: 1, background: 'linear-gradient(90deg,transparent,#2F6B47)' }} />
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Revenue', value: formatCurrency(totalRevenue), hint: `${days}-day total`, numColor: '#1E5C38', accent: '#2F6B47', bg: '#EEF7F1' },
                { label: 'Orders', value: String(totalOrders), hint: 'Completed + pending', numColor: '#1e293b', accent: '#475569', bg: '#F8FAFC' },
                { label: 'Avg Order Value', value: formatCurrency(avgOrderValue), hint: 'Revenue / orders', numColor: '#1D4ED8', accent: '#3B82F6', bg: '#EFF6FF' },
                { label: 'Customers', value: String(stats?.totalCustomers || 0), hint: 'All active profiles', numColor: '#C2410C', accent: '#F97316', bg: '#FFF7ED' },
              ].map((card) => (
                <div key={card.label} style={{ borderRadius: '16px', border: '1px solid #e2e8f0', background: card.bg, padding: '0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ height: '4px', background: card.accent, borderRadius: '16px 16px 0 0' }} />
                  <div style={{ padding: '16px 18px' }}>
                    <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', margin: '0 0 8px' }}>{card.label}</p>
                    <p style={{ fontSize: '26px', fontWeight: '900', color: card.numColor, margin: '0 0 6px', lineHeight: 1 }}>{card.value}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{card.hint}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div style={{ borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: 'linear-gradient(135deg,#1a3a27,#2F6B47)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '20px 20px 0 0' }}>
                  <div>
                    <h2 style={{ color: '#fff', fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Revenue &amp; Orders</h2>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', margin: '3px 0 0' }}>Trend over the selected period</p>
                  </div>
                  <BarChart3 style={{ color: 'rgba(255,255,255,0.4)' }} className="h-5 w-5" />
                </div>
                <div className="h-72" style={{ padding: '12px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={revenueData || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pdfRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2F6B47" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#2F6B47" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(val) => { const d = new Date(val); return `${d.getDate()}/${d.getMonth() + 1}`; }} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis yAxisId="revenue" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                      <YAxis yAxisId="orders" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#2F6B47" strokeWidth={2.5} fill="url(#pdfRevenueGrad)" dot={false} />
                      <Bar yAxisId="orders" dataKey="orders" fill="#E8A838" radius={[4, 4, 0, 0]} maxBarSize={24} opacity={0.9} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>{/* end card div */}

              <div style={{ borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#2563EB)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '20px 20px 0 0' }}>
                  <div>
                    <h2 style={{ color: '#fff', fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>AOV &amp; Week Pattern</h2>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', margin: '3px 0 0' }}>Avg order value and weekday rhythm</p>
                  </div>
                  <TrendingUp style={{ color: 'rgba(255,255,255,0.4)' }} className="h-5 w-5" />
                </div>
                <div style={{ padding: '12px' }} className="grid grid-rows-2 gap-4">
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={avgOrderTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pdfAovGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(val) => { const d = new Date(val); return `${d.getDate()}/${d.getMonth() + 1}`; }} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => `₹${v}`} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Area type="monotone" dataKey="aov" stroke="#3B82F6" strokeWidth={2} fill="url(#pdfAovGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dayOfWeekData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="avgRevenue" fill="#2F6B47" radius={[6, 6, 0, 0]} maxBarSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>{/* end grid-rows-2 + padding */}
              </div>{/* end card */}
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div style={{ borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: 'linear-gradient(135deg,#7c2d12,#D97706)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '20px 20px 0 0' }}>
                  <div>
                    <h2 style={{ color: '#fff', fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Payment Mix</h2>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', margin: '3px 0 0' }}>Distribution by payment method</p>
                  </div>
                  <CreditCard style={{ color: 'rgba(255,255,255,0.4)' }} className="h-5 w-5" />
                </div>
                <div className="h-64" style={{ padding: '12px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentMethodData} cx="50%" cy="50%" innerRadius={52} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                        {paymentMethodData.map((_, index: number) => (
                          <Cell key={index} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend verticalAlign="bottom" iconType="circle" iconSize={8} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: 'linear-gradient(135deg,#1a3a27,#2F6B47)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '20px 20px 0 0' }}>
                  <div>
                    <h2 style={{ color: '#fff', fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Top Products</h2>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', margin: '3px 0 0' }}>Best sellers in the selected window</p>
                  </div>
                  <Package style={{ color: 'rgba(255,255,255,0.4)' }} className="h-5 w-5" />
                </div>
                <div className="h-64" style={{ padding: '12px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topSellingBarData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#334155' }} width={150} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="sold" fill="#2F6B47" radius={[0, 8, 8, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div style={{ borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: 'linear-gradient(135deg,#0F2318,#1E3D2B)', padding: '14px 20px', borderRadius: '20px 20px 0 0' }}>
                  <h2 style={{ color: '#fff', fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Executive Narrative</h2>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', margin: '3px 0 0' }}>AI-generated performance summary</p>
                </div>
                <div style={{ padding: '18px 20px' }}>
                  <p style={{ fontSize: '13px', lineHeight: '1.7', color: '#334155', margin: '0 0 16px', fontStyle: 'italic', borderLeft: '3px solid #2F6B47', paddingLeft: '12px' }}>{pdfSummary}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '10px 14px', border: '1px solid #BBF7D0' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#166534', margin: '0 0 6px' }}>✦ Highlights</p>
                      {pdfHighlights.map((item) => <p key={item} style={{ fontSize: '12px', color: '#166534', margin: '3px 0', display: 'flex', gap: '6px' }}>
                        <span style={{ color: '#22C55E', flexShrink: 0 }}>▸</span>{item}
                      </p>)}
                    </div>
                    <div style={{ background: '#FFFBEB', borderRadius: '10px', padding: '10px 14px', border: '1px solid #FDE68A' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#92400E', margin: '0 0 6px' }}>⚠ Watchouts</p>
                      {pdfWatchouts.map((item) => <p key={item} style={{ fontSize: '12px', color: '#78350F', margin: '3px 0', display: 'flex', gap: '6px' }}>
                        <span style={{ color: '#F59E0B', flexShrink: 0 }}>▸</span>{item}
                      </p>)}
                    </div>
                    <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '10px 14px', border: '1px solid #BFDBFE' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1E40AF', margin: '0 0 6px' }}>→ Actions</p>
                      {pdfActions.map((item) => <p key={item} style={{ fontSize: '12px', color: '#1E3A8A', margin: '3px 0', display: 'flex', gap: '6px' }}>
                        <span style={{ color: '#3B82F6', flexShrink: 0 }}>▸</span>{item}
                      </p>)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#7C3AED)', padding: '14px 20px', borderRadius: '20px 20px 0 0' }}>
                  <h2 style={{ color: '#fff', fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Customer Snapshot</h2>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', margin: '3px 0 0' }}>New vs returning breakdown</p>
                </div>
                <div style={{ padding: '18px 20px' }}>
                  <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '16px' }}>
                  <div style={{ borderRadius: '12px', background: '#EFF6FF', padding: '14px 16px', border: '1px solid #BFDBFE' }}>
                    <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>New Customers</p>
                    <p style={{ fontSize: '24px', fontWeight: '900', color: '#1D4ED8', margin: 0 }}>{customerAnalytics?.newCustomers || 0}</p>
                  </div>
                  <div style={{ borderRadius: '12px', background: '#EEF7F1', padding: '14px 16px', border: '1px solid #BBF7D0' }}>
                    <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Returning</p>
                    <p style={{ fontSize: '24px', fontWeight: '900', color: '#1E5C38', margin: 0 }}>{customerAnalytics?.returningCustomers || 0}</p>
                  </div>
                </div>
                <div className="mt-4 h-52">
                  {customerDonut.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={customerDonut} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={4} dataKey="value" stroke="none">
                          {customerDonut.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">No customer mix data</div>
                  )}
                </div>
                </div>{/* end content div */}
              </div>{/* end customer card */}
            </div>{/* end narrative + customer grid */}

            {/* PAGE 2: IMS Report */}
            <div style={{ marginTop: '32px' }} className="space-y-5">
              {/* IMS Section header */}
              <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#1D4ED8)', borderRadius: '16px', padding: '0', boxShadow: '0 4px 16px rgba(29,78,216,0.2)' }}>
                <div style={{ height: '4px', background: 'linear-gradient(90deg,#60A5FA,#2563EB,#60A5FA)', borderRadius: '16px 16px 0 0' }} />
                <div style={{ padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ color: 'rgba(147,197,253,0.8)', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 6px', fontWeight: '600' }}>Inventory Management System (IMS)</p>
                    <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '800', margin: '0 0 6px' }}>IMS Analytics — Product Stock History</h2>
                    <p style={{ color: 'rgba(147,197,253,0.7)', fontSize: '12px', margin: 0 }}>
                      Store: <strong style={{ color: '#fff' }}>{imsStoreName}</strong> &nbsp;·&nbsp; Date: <strong style={{ color: '#fff' }}>{selectedStockDate ? formatDateLocalLong(selectedStockDate) : 'N/A'}</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Products Logged', value: String(imsDayItems.length), numColor: '#1e293b', accent: '#475569', bg: '#F8FAFC' },
                  { label: 'Total Stock In', value: `+${imsTotalStockIn}`, numColor: '#1E5C38', accent: '#2F6B47', bg: '#EEF7F1' },
                  { label: 'Total Returned', value: `+${imsTotalReturned}`, numColor: '#1D4ED8', accent: '#3B82F6', bg: '#EFF6FF' },
                  { label: 'Total Damaged', value: `+${imsTotalDamaged}`, numColor: '#92400E', accent: '#D97706', bg: '#FFFBEB' },
                ].map((card) => (
                  <div key={card.label} style={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: card.bg, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ height: '3px', background: card.accent, borderRadius: '12px 12px 0 0' }} />
                    <div style={{ padding: '12px 16px' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', margin: '0 0 6px' }}>{card.label}</p>
                      <p style={{ fontSize: '22px', fontWeight: '900', color: card.numColor, margin: 0 }}>{card.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: '#1e3a5f', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '16px 16px 0 0' }}>
                  <h3 style={{ color: '#fff', fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Day-wise Product Stock Flow</h3>
                </div>
                {imsDayItems.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No inventory entries logged for this date.</p>
                ) : (
                  <div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: '#1D4ED8' }}>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'left', padding: '10px 16px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Product</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'left', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>SKU</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Stock In</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Returned</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Damaged</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Sale Log</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 16px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Total Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {imsDayItems.map((item, ri) => (
                          <tr key={item._id} style={{ background: ri % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 16px', fontWeight: '600', color: '#0f172a' }}>{item.productName || '—'}</td>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#94a3b8' }}>{item.productSku || '—'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>+{item.stockInDelta}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#2563EB' }}>+{item.returnedDelta}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#D97706' }}>+{item.damagedDelta}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#DC2626' }}>−{item.saleLogDelta}</td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>{item.totalStock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* PAGE 3: PMS Report */}
            <div style={{ marginTop: '32px' }} className="space-y-5">
              <div style={{ background: 'linear-gradient(135deg,#7c2d12,#B45309)', borderRadius: '16px', padding: '0', boxShadow: '0 4px 16px rgba(180,83,9,0.2)' }}>
                <div style={{ height: '4px', background: 'linear-gradient(90deg,#FCD34D,#D97706,#FCD34D)', borderRadius: '16px 16px 0 0' }} />
                <div style={{ padding: '20px 28px' }}>
                  <p style={{ color: 'rgba(253,230,138,0.8)', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 6px', fontWeight: '600' }}>Production Management System (PMS)</p>
                  <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '800', margin: '0 0 6px' }}>PMS Analytics — Production History</h2>
                  <p style={{ color: 'rgba(253,230,138,0.7)', fontSize: '12px', margin: 0 }}>
                    Store/Factory: <strong style={{ color: '#fff' }}>{pmsStoreName}</strong> &nbsp;·&nbsp; Date: <strong style={{ color: '#fff' }}>{selectedRawDate ? formatDateLocalLong(selectedRawDate) : 'N/A'}</strong>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Materials Logged', value: String(pmsDayItems.length), numColor: '#1e293b', accent: '#475569', bg: '#F8FAFC' },
                  { label: 'Total Stock In', value: `+${pmsTotalStockIn} kg`, numColor: '#1E5C38', accent: '#2F6B47', bg: '#EEF7F1' },
                  { label: 'Total Processed', value: `-${pmsTotalProcessed} kg`, numColor: '#C2410C', accent: '#F97316', bg: '#FFF7ED' },
                  { label: 'Total Oil Output', value: `${pmsTotalOutput} L`, numColor: '#1D4ED8', accent: '#3B82F6', bg: '#EFF6FF' },
                ].map((card) => (
                  <div key={card.label} style={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: card.bg, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ height: '3px', background: card.accent, borderRadius: '12px 12px 0 0' }} />
                    <div style={{ padding: '12px 16px' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', margin: '0 0 6px' }}>{card.label}</p>
                      <p style={{ fontSize: '22px', fontWeight: '900', color: card.numColor, margin: 0 }}>{card.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: '#7c2d12', padding: '12px 20px', borderRadius: '16px 16px 0 0' }}>
                  <h3 style={{ color: '#fff', fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Production Daily Entries</h3>
                </div>
                {pmsDayItems.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No production entries logged for this date.</p>
                ) : (
                  <div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: '#B45309' }}>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'left', padding: '10px 16px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Material</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Unit</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Opening</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Stock In</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Processed</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Output (L)</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 16px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pmsDayItems.map((item, ri) => (
                          <tr key={item._id} style={{ background: ri % 2 === 0 ? '#fff' : '#FFFBF5', borderBottom: '1px solid #fef3c7' }}>
                            <td style={{ padding: '10px 16px', fontWeight: '600', color: '#0f172a' }}>{item.materialName || '—'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace', color: '#94a3b8' }}>{item.materialUnit || 'kg'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>{item.openingStock}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#16a34a' }}>+{item.stockIn}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#EA580C' }}>−{item.processed}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#2563EB' }}>{item.outputLitres || 0} L</td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>{item.closing}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* PAGE 4: RMS Report */}
            <div style={{ marginTop: '32px' }} className="space-y-5">
              <div style={{ background: 'linear-gradient(135deg,#064e3b,#059669)', borderRadius: '16px', padding: '0', boxShadow: '0 4px 16px rgba(5,150,105,0.2)' }}>
                <div style={{ height: '4px', background: 'linear-gradient(90deg,#6EE7B7,#10B981,#6EE7B7)', borderRadius: '16px 16px 0 0' }} />
                <div style={{ padding: '20px 28px' }}>
                  <p style={{ color: 'rgba(167,243,208,0.8)', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 6px', fontWeight: '600' }}>Raw Material Stock (RMS)</p>
                  <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '800', margin: '0 0 6px' }}>RMS Analytics — Current Inventory Stock</h2>
                  <p style={{ color: 'rgba(167,243,208,0.7)', fontSize: '12px', margin: 0 }}>
                    Store/Factory: <strong style={{ color: '#fff' }}>{pmsStoreName}</strong>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Total Materials', value: String(rawMaterials.length), numColor: '#1e293b', accent: '#475569', bg: '#F8FAFC' },
                  { label: 'Good Stock', value: String(rmsGoodCount), numColor: '#1E5C38', accent: '#2F6B47', bg: '#EEF7F1' },
                  { label: 'Low Stock', value: String(rmsLowCount), numColor: '#92400E', accent: '#D97706', bg: '#FFFBEB' },
                  { label: 'Critical / Zero', value: String(rmsCriticalCount), numColor: '#B91C1C', accent: '#EF4444', bg: '#FEF2F2' },
                ].map((card) => (
                  <div key={card.label} style={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: card.bg, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ height: '3px', background: card.accent, borderRadius: '12px 12px 0 0' }} />
                    <div style={{ padding: '12px 16px' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', margin: '0 0 6px' }}>{card.label}</p>
                      <p style={{ fontSize: '22px', fontWeight: '900', color: card.numColor, margin: 0 }}>{card.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ background: '#064e3b', padding: '12px 20px', borderRadius: '16px 16px 0 0' }}>
                  <h3 style={{ color: '#fff', fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Current Raw Material Inventory</h3>
                </div>
                {rawMaterials.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No raw materials tracked.</p>
                ) : (
                  <div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: '#059669' }}>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'left', padding: '10px 16px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Material</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', padding: '10px 12px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Unit</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', padding: '10px 16px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Current Stock</th>
                          <th style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'right', padding: '10px 16px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rawMaterials.map((m, ri) => {
                          const totalStock = m.totalStock ?? 0;
                          const isCritical = totalStock <= 0;
                          const isLow = totalStock > 0 && totalStock < 20;
                          const statusLabel = isCritical ? 'Critical' : isLow ? 'Low Stock' : 'Good';
                          const statusStyle = isCritical
                            ? { color: '#B91C1C', background: '#FEF2F2', padding: '2px 8px', borderRadius: '20px', fontWeight: '700', fontSize: '10px' }
                            : isLow
                            ? { color: '#92400E', background: '#FFFBEB', padding: '2px 8px', borderRadius: '20px', fontWeight: '700', fontSize: '10px' }
                            : { color: '#1E5C38', background: '#EEF7F1', padding: '2px 8px', borderRadius: '20px', fontWeight: '700', fontSize: '10px' };
                          return (
                            <tr key={m._id} style={{ background: ri % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 16px', fontWeight: '600', color: '#0f172a' }}>{m.name}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontFamily: 'monospace' }}>{m.unit || 'kg'}</td>
                              <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: '700', color: '#334155' }}>{totalStock}</td>
                              <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                <span style={statusStyle}>{statusLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* PDF Footer */}
            <div style={{ background: '#0F2318', margin: '32px 0 0', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(212,160,23,0.15)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: '6px', padding: '4px 10px' }}>
                  <span style={{ color: '#D4A017', fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Nature Lite</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>|</span>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>Admin Panel — Confidential Report</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>Generated {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>

          </div>{/* end inner padding div */}
          </div>{/* end outer bg div */}
        </div>
        )}
      </div>
    </div>
  );
}
