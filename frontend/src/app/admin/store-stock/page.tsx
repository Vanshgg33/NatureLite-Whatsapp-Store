'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Warehouse, Search, AlertTriangle, Package, Plus, Trash2, FlaskConical, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { getStoreItemTotalStock } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { Store, StoreStockItem, RawMaterial, RawMaterialPrefill, RawMaterialDailyItem } from '@/types';

// ─── Product Stock Tab ──────────────────────────────────────────────────────

function ProductStockTab({ selectedStoreId, isSuperadmin, stores }: {
  selectedStoreId: string;
  isSuperadmin: boolean;
  stores: Store[];
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editItem, setEditItem] = useState<StoreStockItem | null>(null);
  const [editStockIn, setEditStockIn] = useState('');
  const [editReturned, setEditReturned] = useState('');
  const [editDamaged, setEditDamaged] = useState('');
  const [editSaleLog, setEditSaleLog] = useState('');
  const [editThreshold, setEditThreshold] = useState('');

  const { data: stockData, isLoading } = useQuery({
    queryKey: ['store-stock', selectedStoreId, page, search, lowStockOnly],
    queryFn: () => api.getStoreStock(selectedStoreId, { page, limit: 20, search, lowStockOnly }),
    enabled: !!selectedStoreId,
  });

  const updateStockMutation = useMutation({
    mutationFn: (data: { storeId: string; productId: string; stockInDelta?: number; returnedDelta?: number; damagedDelta?: number; saleLogDelta?: number; lowStockThreshold?: number }) =>
      api.setStoreStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-stock'] });
      setEditItem(null);
    },
  });

  return (
    <>
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search by product name or SKU..."
                  className="pl-10"
                />
              </div>
            </div>
            <Button
              variant={lowStockOnly ? 'default' : 'outline'}
              onClick={() => { setLowStockOnly(!lowStockOnly); setPage(1); }}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Low Stock Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stock Table */}
      {!selectedStoreId ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Warehouse className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Select a store to view stock</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Product</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">SKU</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Category</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Price</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Stock</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Threshold</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-600">Status</th>
                    <th className="text-right p-4 text-sm font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stockData?.items?.map((item: StoreStockItem) => {
                    const totalStock = getStoreItemTotalStock(item);
                    const isLow = totalStock <= item.lowStockThreshold;
                    const isOut = totalStock <= 0;
                    return (
                      <tr key={item._id} className="border-b hover:bg-gray-50/50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {item.productImages?.[0] ? (
                              <img src={item.productImages[0] as string} alt="" className="h-10 w-10 rounded-lg object-cover" />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                <Package className="h-5 w-5 text-gray-400" />
                              </div>
                            )}
                            <span className="font-medium text-sm">{item.productName}</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm font-mono text-gray-600">{item.productSku}</td>
                        <td className="p-4 text-sm text-gray-600">{item.categoryName || '-'}</td>
                        <td className="p-4 text-sm font-medium">₹{item.productPrice?.toLocaleString()}</td>
                        <td className="p-4">
                          <span className={`text-sm font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-green-600'}`}>
                            {totalStock}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-gray-500">{item.lowStockThreshold}</td>
                        <td className="p-4">
                          {isOut ? (
                            <Badge variant="destructive">Out of Stock</Badge>
                          ) : isLow ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">Low Stock</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">In Stock</Badge>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditItem(item);
                              setEditStockIn('');
                              setEditReturned('');
                              setEditDamaged('');
                              setEditSaleLog('');
                              setEditThreshold(item.lowStockThreshold.toString());
                            }}
                          >
                            Update
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!stockData?.items || stockData.items.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500">
                        {search ? 'No products found matching your search' : 'No stock records found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {stockData && stockData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-gray-500">
                  Page {stockData.page} of {stockData.totalPages} ({stockData.total} items)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={!stockData.hasPrevious} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={!stockData.hasNext} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Stock Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Stock — {editItem?.productName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border">
              <span className="text-sm font-medium text-gray-700">Total Stock</span>
              <span className="text-lg font-bold text-gray-900">{editItem?.stock ?? 0}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Stock In</label>
                <Input type="number" min="0" placeholder="0" value={editStockIn} onChange={(e) => setEditStockIn(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Increases total</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Returned</label>
                <Input type="number" min="0" placeholder="0" value={editReturned} onChange={(e) => setEditReturned(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Increases total</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Damaged</label>
                <Input type="number" min="0" placeholder="0" value={editDamaged} onChange={(e) => setEditDamaged(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Increases total</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Sale Log</label>
                <Input type="number" min="0" placeholder="0" value={editSaleLog} onChange={(e) => setEditSaleLog(e.target.value)} />
                <p className="text-xs text-red-400 mt-1">Decreases total</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Low Stock Threshold</label>
              <Input type="number" min="0" value={editThreshold} onChange={(e) => setEditThreshold(e.target.value)} />
            </div>
            {(editStockIn || editReturned || editDamaged || editSaleLog) && (() => {
              const net = (parseInt(editStockIn) || 0) + (parseInt(editReturned) || 0) + (parseInt(editDamaged) || 0) - (parseInt(editSaleLog) || 0);
              const newTotal = Math.max(0, (editItem?.stock ?? 0) + net);
              const willClamp = (editItem?.stock ?? 0) + net < 0;
              return (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${net >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  <div>Net change: {net >= 0 ? '+' : ''}{net} → New total: {newTotal}</div>
                  {willClamp && <div className="text-xs text-red-500 mt-0.5">Sale log exceeds stock — total will be clamped to 0</div>}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
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
                const hasAnyChange = si > 0 || re > 0 || da > 0 || sl > 0 || thresholdChanged;
                if (!hasAnyChange) { setEditItem(null); return; }
                updateStockMutation.mutate({
                  storeId: selectedStoreId,
                  productId: typeof editItem.product === 'string' ? editItem.product : (editItem.product as { _id: string })._id,
                  ...(si > 0 && { stockInDelta: si }),
                  ...(re > 0 && { returnedDelta: re }),
                  ...(da > 0 && { damagedDelta: da }),
                  ...(sl > 0 && { saleLogDelta: sl }),
                  ...(!isNaN(threshold) && { lowStockThreshold: threshold }),
                });
              }}
              disabled={updateStockMutation.isPending}
            >
              {updateStockMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function closingBadge(closing: number) {
  if (closing <= 0) return 'bg-red-100 text-red-700 ring-1 ring-red-200';
  if (closing < 10) return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
}

// ─── Raw Materials Tab ──────────────────────────────────────────────────────

function RawMaterialsTab({ selectedStoreId }: { selectedStoreId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [addDialog, setAddDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('kg');
  const [editMaterial, setEditMaterial] = useState<RawMaterial | null>(null);
  const [prefill, setPrefill] = useState<RawMaterialPrefill | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [entryOpening, setEntryOpening] = useState('');
  const [entryStockIn, setEntryStockIn] = useState('');
  const [entryProcessed, setEntryProcessed] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsDate, setAnalyticsDate] = useState('');
  const prefillRequestRef = useRef(0);
  const { toast } = useToast();

  const { data: materials = [], isLoading } = useQuery<RawMaterial[]>({
    queryKey: ['raw-materials', selectedStoreId, search],
    queryFn: () => api.getRawMaterials(selectedStoreId, search ? { search } : undefined),
    enabled: !!selectedStoreId,
  });

  const { data: datesData } = useQuery({
    queryKey: ['raw-analytics-dates', selectedStoreId],
    queryFn: () => api.getRawMaterialAnalytics(selectedStoreId),
    enabled: !!selectedStoreId && showAnalytics,
  });

  const availableDates = (datesData?.dates ?? []) as string[];

  useEffect(() => {
    if (availableDates.length > 0 && !analyticsDate) {
      setAnalyticsDate(availableDates[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDates.length]);

  const { data: dayData, isLoading: dayLoading } = useQuery({
    queryKey: ['raw-analytics-day', selectedStoreId, analyticsDate],
    queryFn: () => api.getRawMaterialAnalytics(selectedStoreId, { date: analyticsDate }),
    enabled: !!selectedStoreId && !!analyticsDate,
  });

  const dayItems = (dayData?.items ?? []) as RawMaterialDailyItem[];

  const createMutation = useMutation({
    mutationFn: () => api.createRawMaterial({
      storeId: selectedStoreId,
      name: newName.trim(),
      unit: newUnit.trim() || 'kg',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
      setAddDialog(false);
      setNewName(''); setNewUnit('kg');
    },
  });

  const entryMutation = useMutation({
    mutationFn: (data: { id: string; openingStock: number; stockIn: number; processed: number }) =>
      api.upsertRawMaterialEntry(data.id, { openingStock: data.openingStock, stockIn: data.stockIn, processed: data.processed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
      queryClient.invalidateQueries({ queryKey: ['raw-analytics-dates'] });
      queryClient.invalidateQueries({ queryKey: ['raw-analytics-day'] });
      setEditMaterial(null);
      setPrefill(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRawMaterial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
      setDeleteTarget(null);
    },
  });

  async function openUpdateDialog(m: RawMaterial) {
    const requestId = ++prefillRequestRef.current;
    setEditMaterial(m);
    setPrefill(null);
    setEntryOpening('');
    setEntryStockIn('');
    setEntryProcessed('');
    setPrefillLoading(true);
    try {
      const p = await api.getRawMaterialPrefill(m._id);
      if (requestId !== prefillRequestRef.current) return; // stale — a newer dialog opened
      setPrefill(p);
      setEntryOpening(p.openingStock.toString());
      setEntryStockIn(p.stockIn.toString());
      setEntryProcessed(p.processed.toString());
    } catch {
      if (requestId !== prefillRequestRef.current) return;
      setEditMaterial(null);
      toast({ title: 'Failed to load entry data', description: 'Please try again.', variant: 'destructive' });
    } finally {
      if (requestId === prefillRequestRef.current) setPrefillLoading(false);
    }
  }

  const entryOpVal = parseFloat(entryOpening) || 0;
  const entryStVal = parseFloat(entryStockIn) || 0;
  const entryPrVal = parseFloat(entryProcessed) || 0;
  const entryClosing = Math.max(0, entryOpVal + entryStVal - entryPrVal);
  const overdrawn = entryOpVal + entryStVal - entryPrVal < 0;

  // Analytics summary stats
  const totalProcessed = dayItems.reduce((s, i) => s + i.processed, 0);
  const totalStockIn = dayItems.reduce((s, i) => s + i.stockIn, 0);
  const totalClosing = dayItems.reduce((s, i) => s + i.closing, 0);

  return (
    <>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search raw materials…"
            className="pl-9 bg-white"
          />
        </div>
        <Button
          variant={showAnalytics ? 'default' : 'outline'}
          onClick={() => setShowAnalytics((v) => !v)}
          disabled={!selectedStoreId}
          className="gap-2"
        >
          <BarChart2 className="h-4 w-4" />
          Analytics
          {showAnalytics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
        <Button onClick={() => setAddDialog(true)} disabled={!selectedStoreId} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Material
        </Button>
      </div>

      {/* Materials Table */}
      {!selectedStoreId ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FlaskConical className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm">Select a store to view raw materials</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-6 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </CardContent>
        </Card>
      ) : materials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FlaskConical className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium mb-1">{search ? 'No materials found' : 'No raw materials yet'}</p>
            {!search && <p className="text-gray-400 text-sm">Click &quot;Add Material&quot; to get started</p>}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Material</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Opening</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Stock In</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Processed</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Closing</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materials.map((m) => {
                  const entry = m.todayEntry;
                  const closing = entry ? entry.closing : m.totalStock;
                  const hasEntry = !!entry;
                  return (
                    <tr key={m._id} className="hover:bg-gray-50/60 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full flex-shrink-0 ${hasEntry ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                          <div>
                            <p className="font-semibold text-gray-900">{m.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{m.unit} {!hasEntry && '· no entry today'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {hasEntry ? (
                          <span className="font-medium text-gray-700">{entry!.openingStock}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {hasEntry ? (
                          <span className={`font-semibold ${entry!.stockIn > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {entry!.stockIn > 0 ? `+${entry!.stockIn}` : '0'}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {hasEntry ? (
                          <span className={`font-semibold ${entry!.processed > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                            {entry!.processed > 0 ? `−${entry!.processed}` : '0'}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold min-w-[48px] ${closingBadge(closing)}`}>
                          {closing}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openUpdateDialog(m)}
                            className="h-8 text-xs font-medium"
                          >
                            Log Entry
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                            onClick={() => setDeleteTarget(m)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Per-Day Analytics */}
      {showAnalytics && selectedStoreId && (
        <div className="space-y-4">
          {/* Date header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-gray-700">
              <BarChart2 className="h-4 w-4 text-brand-green" />
              <span className="font-semibold text-sm">Daily Analytics</span>
            </div>
            {availableDates.length > 0 ? (
              <Select value={analyticsDate} onValueChange={setAnalyticsDate}>
                <SelectTrigger className="w-40 h-9 text-sm bg-white">
                  <SelectValue placeholder="Select date" />
                </SelectTrigger>
                <SelectContent>
                  {availableDates.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm text-gray-400">No entries yet</span>
            )}
          </div>

          {/* Summary stat cards */}
          {analyticsDate && !dayLoading && dayItems.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border px-4 py-3">
                <p className="text-xs text-gray-400 mb-1">Total Stock In</p>
                <p className="text-xl font-bold text-emerald-600">+{totalStockIn}</p>
              </div>
              <div className="bg-white rounded-xl border px-4 py-3">
                <p className="text-xs text-gray-400 mb-1">Total Processed</p>
                <p className="text-xl font-bold text-orange-500">−{totalProcessed}</p>
              </div>
              <div className="bg-white rounded-xl border px-4 py-3">
                <p className="text-xs text-gray-400 mb-1">Total Closing</p>
                <p className={`text-xl font-bold ${totalClosing <= 0 ? 'text-red-500' : 'text-gray-800'}`}>{totalClosing}</p>
              </div>
            </div>
          )}

          {/* Analytics table */}
          {!analyticsDate ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-gray-400">No entries recorded yet</CardContent>
            </Card>
          ) : dayLoading ? (
            <Card>
              <CardContent className="py-6 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
              </CardContent>
            </Card>
          ) : dayItems.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-gray-400">No entries for {analyticsDate}</CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Material</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Opening</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Stock In</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Processed</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Closing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dayItems.map((item) => (
                      <tr key={item._id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-gray-900">{item.materialName ?? '—'}</p>
                          <p className="text-xs text-gray-400">{item.materialUnit ?? ''}</p>
                        </td>
                        <td className="px-4 py-3.5 text-center font-medium text-gray-600">{item.openingStock}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`font-semibold ${item.stockIn > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {item.stockIn > 0 ? `+${item.stockIn}` : '0'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`font-semibold ${item.processed > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                            {item.processed > 0 ? `−${item.processed}` : '0'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold min-w-[48px] ${closingBadge(item.closing)}`}>
                            {item.closing}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Add Material Dialog */}
      <Dialog open={addDialog} onOpenChange={(o) => { if (!o) { setAddDialog(false); setNewName(''); setNewUnit('kg'); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Raw Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Material Name</label>
              <Input
                placeholder="e.g. Groundnut, Sesame Seeds"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMutation.mutate()}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Unit of Measurement</label>
              <Input placeholder="kg" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1.5">e.g. kg, litre, g, packet</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAddDialog(false); setNewName(''); setNewUnit('kg'); }}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!newName.trim() || createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily Entry Dialog */}
      <Dialog open={!!editMaterial} onOpenChange={() => { setEditMaterial(null); setPrefill(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-lg">{editMaterial?.name}</DialogTitle>
                <p className="text-sm text-gray-400 mt-0.5">Today&apos;s stock entry</p>
              </div>
              {prefill && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${prefill.isExisting ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  {prefill.isExisting ? 'Editing today' : 'New entry'}
                </span>
              )}
            </div>
          </DialogHeader>

          {prefillLoading ? (
            <div className="py-10 text-center">
              <div className="h-5 w-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-400 mt-3">Loading current values…</p>
            </div>
          ) : (
            <div className="space-y-5 py-1">
              {/* Last closing info */}
              <div className="flex items-center justify-between rounded-xl bg-gray-50 border px-4 py-3">
                <div>
                  <p className="text-xs text-gray-400">Last closing stock</p>
                  <p className="text-xl font-bold text-gray-800 mt-0.5">{editMaterial?.totalStock ?? 0} <span className="text-sm font-normal text-gray-400">{editMaterial?.unit}</span></p>
                </div>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${closingBadge(editMaterial?.totalStock ?? 0)}`}>
                  <FlaskConical className="h-4 w-4" />
                </div>
              </div>

              {/* Formula row: Opening + StockIn - Processed = Closing */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Today&apos;s Entry</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening</label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={entryOpening}
                      onChange={(e) => setEntryOpening(e.target.value)}
                      className="text-center font-semibold text-base h-11"
                    />
                    <p className="text-center text-xs text-gray-400">{editMaterial?.unit}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">+ Stock In</label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder="0"
                      value={entryStockIn}
                      onChange={(e) => setEntryStockIn(e.target.value)}
                      className="text-center font-semibold text-base h-11 border-emerald-200 focus:ring-emerald-300"
                    />
                    <p className="text-center text-xs text-gray-400">{editMaterial?.unit}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-orange-500 uppercase tracking-wide">− Processed</label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder="0"
                      value={entryProcessed}
                      onChange={(e) => setEntryProcessed(e.target.value)}
                      className="text-center font-semibold text-base h-11 border-orange-200 focus:ring-orange-300"
                    />
                    <p className="text-center text-xs text-gray-400">{editMaterial?.unit}</p>
                  </div>
                </div>
              </div>

              {/* Closing result */}
              <div className={`rounded-xl px-4 py-3.5 flex items-center justify-between ${closingBadge(entryClosing).replace('ring-1', '').trim()}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">= Closing Stock</p>
                  {overdrawn && <p className="text-xs mt-0.5 opacity-70">Clamped to 0 (processed exceeds available)</p>}
                </div>
                <p className="text-2xl font-black">{entryClosing.toFixed(2)} <span className="text-sm font-normal opacity-70">{editMaterial?.unit}</span></p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEditMaterial(null); setPrefill(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editMaterial) return;
                entryMutation.mutate({ id: editMaterial._id, openingStock: entryOpVal, stockIn: entryStVal, processed: entryPrVal });
              }}
              disabled={entryMutation.isPending || prefillLoading}
            >
              {entryMutation.isPending ? 'Saving…' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Raw Material</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 py-1">
            Are you sure you want to delete <span className="font-semibold text-gray-800">{deleteTarget?.name}</span>? All history will remain but this material won&apos;t appear anymore.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function StoreStockPage() {
  const { user } = useAdminAuthStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user?.storeId || '');
  const [activeTab, setActiveTab] = useState<'products' | 'raw-materials'>('products');

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['stores'],
    queryFn: () => api.getStores(),
  });

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0 && isSuperadmin) {
      setSelectedStoreId(stores[0]._id);
    }
  }, [stores, selectedStoreId, isSuperadmin]);

  const selectedStore = stores.find((s) => s._id === selectedStoreId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Management</h1>
          <p className="text-gray-500 mt-1">
            Manage inventory for {selectedStore?.name || 'your store'}
          </p>
        </div>
      </div>

      {/* Store selector (superadmin) + Tab switcher */}
      <div className="flex flex-wrap items-center gap-4">
        {isSuperadmin && (
          <div className="w-48">
            <Select value={selectedStoreId} onValueChange={(v) => setSelectedStoreId(v)}>
              <SelectTrigger>
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

        {/* Tab buttons */}
        <div className="flex rounded-lg border bg-white overflow-hidden">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'products'
                ? 'bg-brand-green text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Package className="h-4 w-4" />
            Product Stock
          </button>
          <button
            onClick={() => setActiveTab('raw-materials')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-l ${
              activeTab === 'raw-materials'
                ? 'bg-brand-green text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            Raw Materials
          </button>
        </div>
      </div>

      {activeTab === 'products' ? (
        <ProductStockTab
          selectedStoreId={selectedStoreId}
          isSuperadmin={isSuperadmin}
          stores={stores}
        />
      ) : (
        <RawMaterialsTab selectedStoreId={selectedStoreId} />
      )}
    </div>
  );
}
