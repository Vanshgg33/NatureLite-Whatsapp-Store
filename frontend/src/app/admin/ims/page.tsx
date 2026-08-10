'use client';

import { useState, useEffect, Fragment } from 'react';
import { useDebouncedValue } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes, Search, AlertTriangle, Package, FileText,
  TrendingDown, TrendingUp, CheckCircle2, Calendar, ChevronDown, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { getStoreItemTotalStock } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { downloadReportPdf, generateReportPdfBase64 } from '@/lib/report-pdf';
import { EmailReportButton } from '@/components/admin/email-report-button';
import type { Store, StoreStockItem, StockSnapshotItem } from '@/types';

/** Sentinel select value meaning "edit the base product stock", not a specific variant. */
const BASE_STOCK_KEY = '__base__';

export default function IMSPage() {
  const { user } = useAdminAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user?.storeId || '');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editItem, setEditItem] = useState<StoreStockItem | null>(null);
  const [editVariantKey, setEditVariantKey] = useState<string>(BASE_STOCK_KEY);
  const [editStockIn, setEditStockIn] = useState('');
  const [editReturned, setEditReturned] = useState('');
  const [editDamaged, setEditDamaged] = useState('');
  const [editSaleLog, setEditSaleLog] = useState('');
  const [editThreshold, setEditThreshold] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openEditDialog(item: StoreStockItem, variantKey: string = BASE_STOCK_KEY) {
    setEditItem(item);
    setEditVariantKey(variantKey);
    setEditStockIn('');
    setEditReturned('');
    setEditDamaged('');
    setEditSaleLog('');
    setEditThreshold((item.lowStockThreshold ?? 0).toString());
  }

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');
  const canEditAnalytics = user?.role === 'superadmin' || (user?.role === 'admin' && !user?.departmentType);

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['stores'],
    queryFn: () => api.getStores(),
    enabled: isSuperadmin,
  });

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0 && isSuperadmin) {
      setSelectedStoreId(stores[0]._id);
    }
  }, [stores, selectedStoreId, isSuperadmin]);

  const selectedStore = isSuperadmin ? stores.find((s) => s._id === selectedStoreId) : null;
  const storeName = selectedStore?.name || user?.storeName || 'Store';

  const { data: stockData, isLoading } = useQuery({
    queryKey: ['store-stock', selectedStoreId, page, debouncedSearch, lowStockOnly],
    queryFn: () => api.getStoreStock(selectedStoreId, { page, limit: 20, search: debouncedSearch, lowStockOnly }),
    enabled: !!selectedStoreId,
  });

  const { data: stockSummary } = useQuery({
    queryKey: ['store-stock-summary', selectedStoreId],
    queryFn: () => api.getStoreStockSummary(selectedStoreId),
    enabled: !!selectedStoreId,
  });

  const { data: stockDatesData } = useQuery({
    queryKey: ['stock-analytics-dates', selectedStoreId],
    queryFn: () => api.getStockAnalytics(selectedStoreId),
    enabled: !!selectedStoreId,
  });

  const availableDates = (stockDatesData?.dates ?? []) as string[];

  useEffect(() => {
    if (!reportDate && availableDates.length > 0) setReportDate(availableDates[0]);
  }, [availableDates, reportDate]);

  const updateStockMutation = useMutation({
    mutationFn: (data: { storeId: string; productId: string; stockInDelta?: number; returnedDelta?: number; damagedDelta?: number; saleLogDelta?: number; variantSku?: string; lowStockThreshold?: number; adminPassword?: string }) =>
      api.setStoreStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-stock'] });
      queryClient.invalidateQueries({ queryKey: ['store-stock-summary', selectedStoreId] });
      queryClient.invalidateQueries({ queryKey: ['stock-analytics-dates'] });
      setEditItem(null);
      toast({ title: 'Stock updated' });
    },
  });

  async function buildImsReportOptions() {
    if (reportDate) {
      const res = await api.getStockAnalytics(selectedStoreId, { date: reportDate });
      const items = (res.items ?? []) as StockSnapshotItem[];
      const formattedDate = new Date(reportDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
      const totalEntries = items.reduce((sum, item) => sum + (item.entryCount ?? item.entries?.length ?? 0), 0);
      return {
        title: 'IMS - Inventory Entry Report',
        subtitle: 'Daily product and variant entry activity',
        meta: [
          { label: 'Store', value: storeName },
          { label: 'Date', value: formattedDate },
          { label: 'Generated', value: 'Admin Panel' },
        ],
        summary: [
          { label: 'Products Logged', value: items.length },
          { label: 'Total Entries', value: totalEntries },
          { label: 'Stock In', value: items.reduce((s, i) => s + i.stockInDelta, 0) },
          { label: 'Sale Logs', value: items.reduce((s, i) => s + i.saleLogDelta, 0) },
        ],
        table: {
          columns: ['Product', 'SKU', 'Entries', 'Stock In', 'Returned', 'Damaged', 'Sale Log', 'Closing'],
          rows: items.map((i) => [
            i.productName ?? '-',
            i.productSku ?? '-',
            i.entryCount ?? i.entries?.length ?? 0,
            i.stockInDelta,
            i.returnedDelta,
            i.damagedDelta,
            i.saleLogDelta,
            i.totalStock,
          ]),
        },
        filename: `IMS-Entry-Report-${storeName}-${reportDate}.pdf`,
      };
    }

    const allData = await api.getStoreStock(selectedStoreId, { page: 1, limit: 5000 });
    const items = (allData?.items ?? stockData?.items ?? []) as StoreStockItem[];
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const inStock = items.filter((i) => getStoreItemTotalStock(i) > i.lowStockThreshold);
    const low = items.filter((i) => { const s = getStoreItemTotalStock(i); return s > 0 && s <= i.lowStockThreshold; });
    const out = items.filter((i) => getStoreItemTotalStock(i) <= 0);
    return {
      title: 'IMS - Inventory Management Report',
      subtitle: 'Packed goods stock available for sale',
      meta: [
        { label: 'Store', value: storeName },
        { label: 'Date', value: dateStr },
        { label: 'Generated', value: 'Admin Panel' },
      ],
      summary: [
        { label: 'Total Products', value: items.length },
        { label: 'In Stock', value: inStock.length },
        { label: 'Low Stock', value: low.length },
        { label: 'Out of Stock', value: out.length },
      ],
      table: {
        columns: ['Product', 'SKU', 'Stock', 'Threshold', 'Status'],
        rows: items.map((i) => {
          const stock = getStoreItemTotalStock(i);
          const status = stock <= 0 ? 'Out' : stock <= i.lowStockThreshold ? 'Low' : 'OK';
          return [i.productName ?? '-', i.productSku ?? '-', stock, i.lowStockThreshold, status];
        }),
      },
      filename: `IMS-Inventory-Report-${storeName}-${now.toISOString().split('T')[0]}.pdf`,
    };
  }

  async function generateReport() {
    const opts = await buildImsReportOptions();
    await downloadReportPdf(opts);
  }

  async function generateImsPdfBase64(): Promise<string> {
    const opts = await buildImsReportOptions();
    return generateReportPdfBase64(opts);
  }

  const statCards = [
    {
      label: 'Total Products',
      value: stockSummary?.total ?? stockData?.total ?? 0,
      icon: Package,
      color: 'text-gray-700',
      bg: 'bg-gray-50',
    },
    {
      label: 'Low Stock',
      value: stockSummary?.lowStock ?? 0,
      icon: TrendingDown,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Out of Stock',
      value: stockSummary?.outOfStock ?? 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'Healthy Stock',
      value: stockSummary?.healthyStock ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ];

  const editVariants = editItem?.productVariants ?? [];
  const editHasVariants = editVariants.length > 0;
  const editSelectionStock = editItem
    ? (editVariantKey === BASE_STOCK_KEY
        ? editItem.stock
        : editItem.variantStocks?.find((v) => v.variantSku === editVariantKey)?.stock ?? 0)
    : 0;
  const editSelectionLabel = editVariantKey === BASE_STOCK_KEY
    ? 'Base product'
    : editVariants.find((v) => v.sku === editVariantKey)?.name ?? 'Variant';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-[#1E3D2B] flex items-center justify-center">
              <Boxes className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">IMS</h1>
            <span className="text-sm text-gray-400 font-normal">— Inventory Management</span>
          </div>
          <p className="text-gray-500 text-sm">Track packed goods available for sale in store</p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperadmin && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="Select store" />
              </SelectTrigger>
              <SelectContent>
                {stores.filter((s) => s._id).map((store) => (
                  <SelectItem key={store._id} value={store._id}>
                    {store.name}
                  </SelectItem>
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
          <Button
            onClick={generateReport}
            disabled={!selectedStoreId}
            variant="outline"
            className="gap-2 h-9"
          >
            <FileText className="h-4 w-4" /> Generate Report
          </Button>
          <EmailReportButton
            generatePdfBase64={generateImsPdfBase64}
            filename={reportDate ? `IMS-Entry-Report-${storeName}-${reportDate}.pdf` : `IMS-Inventory-Report-${storeName}.pdf`}
            subject="IMS Inventory Report"
            className="h-9"
            disabled={!selectedStoreId}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by product name or SKU..."
            className="pl-10 bg-white"
          />
        </div>
        <Button
          variant={lowStockOnly ? 'default' : 'outline'}
          onClick={() => { setLowStockOnly(!lowStockOnly); setPage(1); }}
          className="gap-2"
        >
          <AlertTriangle className="h-4 w-4" />
          Low Stock Only
        </Button>
        {!canEditAnalytics && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Read-only mode: only full admin can update IMS values.
          </p>
        )}
      </div>

      {/* Table */}
      {!selectedStoreId ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            <Boxes className="h-12 w-12 mx-auto mb-3 text-gray-200" />
            <p>Select a store to view inventory</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Product</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">SKU</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Price</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Stock</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Threshold</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stockData?.items?.map((item: StoreStockItem) => {
                  const totalStock = getStoreItemTotalStock(item);
                  const isLow = totalStock <= item.lowStockThreshold && totalStock > 0;
                  const isOut = totalStock <= 0;
                  const variants = item.productVariants ?? [];
                  const hasVariants = variants.length > 0;
                  const isExpanded = expandedIds.has(item._id);
                  return (
                    <Fragment key={item._id}>
                      <tr className="hover:bg-gray-50/60 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {hasVariants ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(item._id)}
                                className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            ) : (
                              <span className="w-4 flex-shrink-0" />
                            )}
                            {item.productImages?.[0] ? (
                              <img src={item.productImages[0] as string} alt="" className="h-9 w-9 rounded-lg object-cover" />
                            ) : (
                              <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center">
                                <Package className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                            <div>
                              <span className="font-medium text-gray-900">{item.productName}</span>
                              {hasVariants && (
                                <p className="text-[11px] text-gray-400">{variants.length} variant{variants.length > 1 ? 's' : ''}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-gray-500">{item.productSku}</td>
                        <td className="px-4 py-3.5 font-medium text-gray-700">₹{item.productPrice?.toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`text-base font-black ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {totalStock}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center text-gray-400 text-sm">{item.lowStockThreshold}</td>
                        <td className="px-4 py-3.5 text-center">
                          {isOut ? (
                            <Badge className="bg-red-100 text-red-700 border-0">Out of Stock</Badge>
                          ) : isLow ? (
                            <Badge className="bg-amber-100 text-amber-700 border-0">Low Stock</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 border-0">In Stock</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {canEditAnalytics ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs opacity-70 group-hover:opacity-100"
                              onClick={() => openEditDialog(item)}
                            >
                              Update
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-400">View only</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <>
                          <tr className="bg-gray-50/40 text-sm">
                            <td className="pl-14 pr-5 py-2 text-gray-500">Base product</td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2 text-center font-semibold text-gray-700">{item.stock}</td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2" />
                            <td className="px-5 py-2 text-right">
                              {canEditAnalytics && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-gray-500"
                                  onClick={() => openEditDialog(item, BASE_STOCK_KEY)}
                                >
                                  Update
                                </Button>
                              )}
                            </td>
                          </tr>
                          {variants.map((v) => {
                            const vStock = item.variantStocks?.find((vs) => vs.variantSku === v.sku)?.stock ?? 0;
                            return (
                              <tr key={`${item._id}-${v.sku}`} className="bg-gray-50/40 text-sm">
                                <td className="pl-14 pr-5 py-2 text-gray-600">
                                  {v.name}
                                  <span className="text-gray-400 font-mono text-[11px] ml-1.5">{v.sku}</span>
                                </td>
                                <td className="px-4 py-2" />
                                <td className="px-4 py-2" />
                                <td className="px-4 py-2 text-center font-semibold text-gray-700">{vStock}</td>
                                <td className="px-4 py-2" />
                                <td className="px-4 py-2" />
                                <td className="px-5 py-2 text-right">
                                  {canEditAnalytics && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-gray-500"
                                      onClick={() => openEditDialog(item, v.sku)}
                                    >
                                      Update
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      )}
                    </Fragment>
                  );
                })}
                {(!stockData?.items || stockData.items.length === 0) && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      {search ? 'No products match your search' : 'No stock records found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {stockData && stockData.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/50">
              <p className="text-sm text-gray-500">Page {stockData.page} of {stockData.totalPages} ({stockData.total} items)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!stockData.hasPrevious} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={!stockData.hasNext} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Edit Stock Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {editItem?.productImages?.[0] ? (
                <img src={editItem.productImages[0] as string} alt="" className="h-12 w-12 rounded-xl object-cover flex-shrink-0 border" />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 border">
                  <Package className="h-6 w-6 text-gray-400" />
                </div>
              )}
              <div>
                <DialogTitle className="leading-tight">{editItem?.productName}</DialogTitle>
                <p className="text-xs text-gray-400 mt-0.5">Update stock entry</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border">
              <span className="text-sm font-medium text-gray-600">Total Stock (all variants)</span>
              <span className="text-xl font-black text-gray-900">{editItem ? getStoreItemTotalStock(editItem) : 0}</span>
            </div>

            {editHasVariants && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Editing</label>
                <Select value={editVariantKey} onValueChange={setEditVariantKey}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BASE_STOCK_KEY}>Base product — {editItem?.stock ?? 0} in stock</SelectItem>
                    {editVariants.map((v) => {
                      const vStock = editItem?.variantStocks?.find((vs) => vs.variantSku === v.sku)?.stock ?? 0;
                      return (
                        <SelectItem key={v.sku} value={v.sku}>
                          {v.name} — {vStock} in stock
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">Entries below apply only to the selected variant.</p>
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border">
              <span className="text-sm font-medium text-gray-600">{editSelectionLabel} Stock</span>
              <span className="text-xl font-black text-gray-900">{editSelectionStock}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Stock In', state: editStockIn, setter: setEditStockIn, note: 'Increases total', positive: true },
                { label: 'Returned', state: editReturned, setter: setEditReturned, note: 'Increases total', positive: true },
                { label: 'Damaged', state: editDamaged, setter: setEditDamaged, note: 'Increases total', positive: true },
                { label: 'Sale Log', state: editSaleLog, setter: setEditSaleLog, note: 'Decreases total', positive: false },
              ].map((f) => (
                <div key={f.label}>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">{f.label}</label>
                  <Input type="number" min="0" placeholder="0" value={f.state} onChange={(e) => f.setter(e.target.value)} />
                  <p className={`text-xs mt-1 ${f.positive ? 'text-gray-400' : 'text-red-400'}`}>{f.note}</p>
                </div>
              ))}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Low Stock Threshold</label>
              <Input type="number" min="0" value={editThreshold} onChange={(e) => setEditThreshold(e.target.value)} />
              {editHasVariants && (
                <p className="text-xs text-gray-400 mt-1">Applies to the product's total stock across all variants.</p>
              )}
            </div>
            {(editStockIn || editReturned || editDamaged || editSaleLog) && (() => {
              const net = (parseInt(editStockIn) || 0) + (parseInt(editReturned) || 0) + (parseInt(editDamaged) || 0) - (parseInt(editSaleLog) || 0);
              const newSelectionStock = Math.max(0, editSelectionStock + net);
              return (
                <div className={`text-sm font-medium px-3 py-2.5 rounded-xl ${net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  Net change: {net >= 0 ? '+' : ''}{net} → New {editSelectionLabel.toLowerCase()} stock: <strong>{newSelectionStock}</strong>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editItem) return;
                const si = parseInt(editStockIn) || 0;
                const re = parseInt(editReturned) || 0;
                const da = parseInt(editDamaged) || 0;
                const sl = parseInt(editSaleLog) || 0;
                const threshold = parseInt(editThreshold);
                const thresholdChanged = !isNaN(threshold) && threshold !== editItem.lowStockThreshold;
                const hasDelta = si > 0 || re > 0 || da > 0 || sl > 0;
                if (!hasDelta && !thresholdChanged) { setEditItem(null); return; }
                updateStockMutation.mutate({
                  storeId: selectedStoreId,
                  productId: typeof editItem.product === 'string' ? editItem.product : (editItem.product as { _id: string })._id,
                  ...(si > 0 && { stockInDelta: si }),
                  ...(re > 0 && { returnedDelta: re }),
                  ...(da > 0 && { damagedDelta: da }),
                  ...(sl > 0 && { saleLogDelta: sl }),
                  // Only tag the variant when there's an actual delta to apply — sending
                  // variantSku with no delta hits the backend's absolute-set path and would
                  // zero out that variant's stock (dto.stock defaults to 0 when unset).
                  ...(editVariantKey !== BASE_STOCK_KEY && hasDelta && { variantSku: editVariantKey }),
                  ...(!isNaN(threshold) && { lowStockThreshold: threshold }),
                });
              }}
              disabled={updateStockMutation.isPending}
            >
              {updateStockMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
