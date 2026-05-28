'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FlaskConical, Search, FileText, TrendingDown, AlertTriangle, CheckCircle2,
  Calendar,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { downloadReportPdf, generateReportPdfBase64 } from '@/lib/report-pdf';
import { EmailReportButton } from '@/components/admin/email-report-button';
import type { Store, RawMaterial, RawMaterialDailyItem } from '@/types';

function stockStatus(stock: number): { label: string; color: string; bg: string } {
  if (stock <= 0) return { label: 'Critical', color: 'text-red-700', bg: 'bg-red-100' };
  if (stock < 20) return { label: 'Low', color: 'text-amber-700', bg: 'bg-amber-100' };
  return { label: 'Good', color: 'text-emerald-700', bg: 'bg-emerald-100' };
}

export default function RMSPage() {
  const { user } = useAdminAuthStore();
  const { toast } = useToast();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user?.storeId || '');
  const [search, setSearch] = useState('');
  const [reportDate, setReportDate] = useState('');

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['stores'],
    queryFn: () => api.getStores(),
    enabled: isSuperadmin,
  });

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0 && isSuperadmin) setSelectedStoreId(stores[0]._id);
  }, [stores, selectedStoreId, isSuperadmin]);

  const storeName = isSuperadmin
    ? stores.find((s) => s._id === selectedStoreId)?.name || 'Store'
    : user?.storeName || 'Store';

  const { data: materials = [], isLoading } = useQuery<RawMaterial[]>({
    queryKey: ['raw-materials', selectedStoreId, search],
    queryFn: () => api.getRawMaterials(selectedStoreId, search ? { search } : undefined),
    enabled: !!selectedStoreId,
  });

  const { data: datesData } = useQuery({
    queryKey: ['raw-analytics-dates', selectedStoreId],
    queryFn: () => api.getRawMaterialAnalytics(selectedStoreId),
    enabled: !!selectedStoreId,
  });

  const availableDates = (datesData?.dates ?? []) as string[];

  useEffect(() => {
    if (!reportDate && availableDates.length > 0) setReportDate(availableDates[0]);
  }, [availableDates, reportDate]);

  const criticalCount = materials.filter((m) => m.totalStock <= 0).length;
  const lowCount = materials.filter((m) => m.totalStock > 0 && m.totalStock < 20).length;
  const goodCount = materials.filter((m) => m.totalStock >= 20).length;

  async function buildRmsReportOptions() {
    if (reportDate) {
      const res = await api.getRawMaterialAnalytics(selectedStoreId, { date: reportDate });
      const items = (res.items ?? []) as RawMaterialDailyItem[];
      const formattedDate = new Date(reportDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
      return {
        title: 'RMS - Raw Material Entry Report',
        subtitle: 'Daily raw material stock movements',
        meta: [
          { label: 'Store', value: storeName },
          { label: 'Date', value: formattedDate },
          { label: 'Generated', value: 'Admin Panel' },
        ],
        summary: [
          { label: 'Materials Logged', value: items.length },
          { label: 'Total Entries', value: items.reduce((s, i) => s + (i.entryCount ?? i.entries?.length ?? 0), 0) },
          { label: 'Stock In', value: items.reduce((s, i) => s + i.stockIn, 0) },
          { label: 'Processed', value: items.reduce((s, i) => s + i.processed, 0) },
        ],
        table: {
          columns: ['Material', 'Unit', 'Entries', 'Opening', 'Stock In', 'Processed', 'Closing'],
          rows: items.map((i) => [
            i.materialName ?? '-',
            i.materialUnit ?? '-',
            i.entryCount ?? i.entries?.length ?? 0,
            i.openingStock,
            i.stockIn,
            i.processed,
            i.closing,
          ]),
        },
        filename: `RMS-Entry-Report-${storeName}-${reportDate}.pdf`,
      };
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    return {
      title: 'RMS - Raw Material Stock Report',
      subtitle: 'Current raw material stock levels',
      meta: [
        { label: 'Store', value: storeName },
        { label: 'Date', value: dateStr },
        { label: 'Generated', value: 'Admin Panel' },
      ],
      summary: [
        { label: 'Total Materials', value: materials.length },
        { label: 'Good Stock', value: goodCount },
        { label: 'Low Stock', value: lowCount },
        { label: 'Critical', value: criticalCount },
      ],
      table: {
        columns: ['Material', 'Unit', 'Stock', 'Status'],
        rows: materials.map((m) => {
          const s = stockStatus(m.totalStock);
          return [m.name, m.unit, m.totalStock, s.label];
        }),
      },
      filename: `RMS-Raw-Material-Report-${storeName}-${now.toISOString().split('T')[0]}.pdf`,
    };
  }

  async function generateReport() {
    try {
      const opts = await buildRmsReportOptions();
      await downloadReportPdf(opts);
    } catch {
      toast({ title: 'Failed to download raw material report', variant: 'destructive' });
    }
  }

  async function generateRmsPdfBase64(): Promise<string> {
    const opts = await buildRmsReportOptions();
    return generateReportPdfBase64(opts);
  }

  const statCards = [
    { label: 'Total Materials', value: materials.length, icon: FlaskConical, color: 'text-gray-700', bg: 'bg-gray-50' },
    { label: 'Good Stock', value: goodCount, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Low Stock', value: lowCount, icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Critical / Zero', value: criticalCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-[#1E3D2B] flex items-center justify-center">
              <FlaskConical className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">RMS</h1>
            <span className="text-sm text-gray-400 font-normal">— Raw Material Stock</span>
          </div>
          <p className="text-gray-500 text-sm">Current raw material stock levels at the factory</p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperadmin && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Select store" /></SelectTrigger>
              <SelectContent>
                {stores.filter((s) => s._id).map((store) => (
                  <SelectItem key={store._id} value={store._id}>{store.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {availableDates.length > 0 && (
            <Select value={reportDate} onValueChange={setReportDate}>
              <SelectTrigger className="w-40 h-9">
                <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                <SelectValue placeholder="Report date" />
              </SelectTrigger>
              <SelectContent>
                {availableDates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={generateReport} disabled={!selectedStoreId || materials.length === 0} variant="outline" className="gap-2 h-9">
            <FileText className="h-4 w-4" /> Generate Report
          </Button>
          <EmailReportButton
            generatePdfBase64={generateRmsPdfBase64}
            filename={reportDate ? `RMS-Entry-Report-${storeName}-${reportDate}.pdf` : `RMS-Raw-Material-Report-${storeName}.pdf`}
            subject="RMS Report"
            className="h-9"
            disabled={!selectedStoreId || materials.length === 0}
          />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className={`p-4 ${s.bg} rounded-xl`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials…" className="pl-9 bg-white" />
      </div>

      {/* Materials Grid / Table */}
      {!selectedStoreId ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            <FlaskConical className="h-12 w-12 mx-auto mb-3 text-gray-200" />
            <p>Select a store to view stock</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : materials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FlaskConical className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="text-gray-500 font-medium">{search ? 'No materials found' : 'No raw materials yet'}</p>
            {!search && <p className="text-gray-400 text-sm mt-1">Add materials in PMS to track stock here</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {materials.map((m) => {
            const { label, color, bg } = stockStatus(m.totalStock);
            const todayEntry = m.todayEntry;
            return (
              <Card key={m._id} className="overflow-hidden shadow-sm border hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  {/* Status bar */}
                  <div className={`h-1 w-full ${m.totalStock <= 0 ? 'bg-red-400' : m.totalStock < 20 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-gray-900 text-sm leading-tight">{m.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Unit: {m.unit}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg} ${color}`}>{label}</span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Current Stock</p>
                        <p className={`text-3xl font-black ${color}`}>{m.totalStock}</p>
                        <p className="text-xs text-gray-400">{m.unit}</p>
                      </div>
                      {todayEntry && (
                        <div className="text-right text-xs text-gray-400 space-y-0.5">
                          <p>Today in: <span className="text-emerald-600 font-medium">+{todayEntry.stockIn}</span></p>
                          <p>Processed: <span className="text-orange-500 font-medium">{todayEntry.processed}</span></p>
                          {(todayEntry.outputLitres ?? 0) > 0 && (
                            <p>Output: <span className="text-blue-600 font-medium">{todayEntry.outputLitres}L</span></p>
                          )}
                        </div>
                      )}
                    </div>
                    {!todayEntry && (
                      <p className="text-xs text-gray-300 mt-2 italic">No entry logged today</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}
