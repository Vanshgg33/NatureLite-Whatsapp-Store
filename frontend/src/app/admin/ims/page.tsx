'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes, Search, AlertTriangle, Package, FileText, Mail, MessageSquare,
  TrendingDown, TrendingUp, CheckCircle2,
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
import type { Store, StoreStockItem } from '@/types';

function ReportModal({ open, onClose, reportText, reportTitle }: {
  open: boolean;
  onClose: () => void;
  reportText: string;
  reportTitle: string;
}) {
  const handleEmail = () => {
    const link = document.createElement('a');
    link.href = `mailto:?subject=${encodeURIComponent(reportTitle)}&body=${encodeURIComponent(reportText)}`;
    link.click();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{reportTitle}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[55vh]">
          <pre className="bg-gray-50 rounded-xl border p-4 text-sm font-mono whitespace-pre-wrap text-gray-700 leading-relaxed">
            {reportText}
          </pre>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, '_blank')}
            className="bg-[#25D366] hover:bg-[#1eb854] text-white gap-2"
          >
            <MessageSquare className="h-4 w-4" /> Share on WhatsApp
          </Button>
          <Button onClick={handleEmail} variant="outline" className="gap-2">
            <Mail className="h-4 w-4" /> Share via Email
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function IMSPage() {
  const { user } = useAdminAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user?.storeId || '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editItem, setEditItem] = useState<StoreStockItem | null>(null);
  const [editStockIn, setEditStockIn] = useState('');
  const [editReturned, setEditReturned] = useState('');
  const [editDamaged, setEditDamaged] = useState('');
  const [editSaleLog, setEditSaleLog] = useState('');
  const [editThreshold, setEditThreshold] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');

  const isSuperadmin = user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

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
    queryKey: ['store-stock', selectedStoreId, page, search, lowStockOnly],
    queryFn: () => api.getStoreStock(selectedStoreId, { page, limit: 20, search, lowStockOnly }),
    enabled: !!selectedStoreId,
  });

  const { data: allStockData } = useQuery({
    queryKey: ['store-stock-all', selectedStoreId],
    queryFn: () => api.getStoreStock(selectedStoreId, { page: 1, limit: 1000 }),
    enabled: !!selectedStoreId,
  });

  const updateStockMutation = useMutation({
    mutationFn: (data: { storeId: string; productId: string; stockInDelta?: number; returnedDelta?: number; damagedDelta?: number; saleLogDelta?: number; lowStockThreshold?: number }) =>
      api.setStoreStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-stock'] });
      setEditItem(null);
      toast({ title: 'Stock updated' });
    },
  });

  function generateReport() {
    const items = (allStockData?.items ?? stockData?.items ?? []) as StoreStockItem[];
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const inStock = items.filter((i) => getStoreItemTotalStock(i) > i.lowStockThreshold);
    const low = items.filter((i) => { const s = getStoreItemTotalStock(i); return s > 0 && s <= i.lowStockThreshold; });
    const out = items.filter((i) => getStoreItemTotalStock(i) <= 0);

    const lines: string[] = [
      '📦 INVENTORY MANAGEMENT REPORT',
      '─'.repeat(48),
      `Store: ${storeName}`,
      `Date: ${dateStr}`,
      '',
      'PRODUCT STOCK OVERVIEW',
      '─'.repeat(48),
      `${'Product'.padEnd(28)} ${'Stock'.padStart(6)}  Status`,
      '─'.repeat(48),
      ...items.map((i) => {
        const stock = getStoreItemTotalStock(i);
        const isOut = stock <= 0;
        const isLow = stock > 0 && stock <= i.lowStockThreshold;
        const status = isOut ? '❌ Out' : isLow ? '⚠️ Low' : '✅ OK';
        return `${(i.productName ?? '—').substring(0, 27).padEnd(28)} ${String(stock).padStart(6)}  ${status}`;
      }),
      '',
      'SUMMARY',
      '─'.repeat(48),
      `Total Products : ${items.length}`,
      `In Stock       : ${inStock.length}`,
      `Low Stock      : ${low.length}`,
      `Out of Stock   : ${out.length}`,
      '',
      '─'.repeat(48),
      'Generated by Nature Lite Admin Panel',
    ];
    const text = lines.join('\n');
    setReportText(text);
    setShowReport(true);
  }

  const statCards = [
    {
      label: 'Total Products',
      value: allStockData?.total ?? stockData?.total ?? 0,
      icon: Package,
      color: 'text-gray-700',
      bg: 'bg-gray-50',
    },
    {
      label: 'Low Stock',
      value: (allStockData?.items ?? []).filter((i: StoreStockItem) => {
        const s = getStoreItemTotalStock(i); return s > 0 && s <= i.lowStockThreshold;
      }).length,
      icon: TrendingDown,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Out of Stock',
      value: (allStockData?.items ?? []).filter((i: StoreStockItem) => getStoreItemTotalStock(i) <= 0).length,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'Healthy Stock',
      value: (allStockData?.items ?? []).filter((i: StoreStockItem) => getStoreItemTotalStock(i) > i.lowStockThreshold).length,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ];

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
          <Button
            onClick={generateReport}
            disabled={!selectedStoreId}
            variant="outline"
            className="gap-2 h-9"
          >
            <FileText className="h-4 w-4" /> Generate Report
          </Button>
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
                  return (
                    <tr key={item._id} className="hover:bg-gray-50/60 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {item.productImages?.[0] ? (
                            <img src={item.productImages[0] as string} alt="" className="h-9 w-9 rounded-lg object-cover" />
                          ) : (
                            <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center">
                              <Package className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                          <span className="font-medium text-gray-900">{item.productName}</span>
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs opacity-70 group-hover:opacity-100"
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
            <DialogTitle>Update Stock — {editItem?.productName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border">
              <span className="text-sm font-medium text-gray-600">Current Stock</span>
              <span className="text-xl font-black text-gray-900">{editItem ? getStoreItemTotalStock(editItem) : 0}</span>
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
            </div>
            {(editStockIn || editReturned || editDamaged || editSaleLog) && (() => {
              const net = (parseInt(editStockIn) || 0) + (parseInt(editReturned) || 0) + (parseInt(editDamaged) || 0) - (parseInt(editSaleLog) || 0);
              const current = editItem ? getStoreItemTotalStock(editItem) : 0;
              const newTotal = Math.max(0, current + net);
              return (
                <div className={`text-sm font-medium px-3 py-2.5 rounded-xl ${net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  Net change: {net >= 0 ? '+' : ''}{net} → New total: <strong>{newTotal}</strong>
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
                if (!si && !re && !da && !sl && !thresholdChanged) { setEditItem(null); return; }
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
              {updateStockMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Modal */}
      <ReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        reportText={reportText}
        reportTitle="IMS — Inventory Report"
      />
    </div>
  );
}
