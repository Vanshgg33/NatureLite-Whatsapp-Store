'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cog, Search, Plus, Trash2, FlaskConical, BarChart2, ChevronDown, ChevronUp,
  FileText, Mail, MessageSquare, Droplets,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { Store, RawMaterial, RawMaterialPrefill, RawMaterialDailyItem } from '@/types';

function closingBadge(val: number) {
  if (val <= 0) return 'bg-red-100 text-red-700';
  if (val < 10) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function ReportModal({ open, onClose, reportText, reportTitle }: {
  open: boolean; onClose: () => void; reportText: string; reportTitle: string;
}) {
  const handleEmail = () => {
    const a = document.createElement('a');
    a.href = `mailto:?subject=${encodeURIComponent(reportTitle)}&body=${encodeURIComponent(reportText)}`;
    a.click();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader><DialogTitle>{reportTitle}</DialogTitle></DialogHeader>
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

export default function PMSPage() {
  const { user } = useAdminAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user?.storeId || '');
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
  const [entryOutput, setEntryOutput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsDate, setAnalyticsDate] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [showReportConfig, setShowReportConfig] = useState(false);
  const prefillRequestRef = useRef(0);

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
    enabled: !!selectedStoreId && showAnalytics,
  });

  const availableDates = (datesData?.dates ?? []) as string[];

  useEffect(() => {
    if (availableDates.length > 0 && !analyticsDate) setAnalyticsDate(availableDates[0]);
  }, [availableDates.length]);

  const { data: dayData, isLoading: dayLoading } = useQuery({
    queryKey: ['raw-analytics-day', selectedStoreId, analyticsDate],
    queryFn: () => api.getRawMaterialAnalytics(selectedStoreId, { date: analyticsDate }),
    enabled: !!selectedStoreId && !!analyticsDate,
  });

  const dayItems = (dayData?.items ?? []) as RawMaterialDailyItem[];

  const createMutation = useMutation({
    mutationFn: () => api.createRawMaterial({ storeId: selectedStoreId, name: newName.trim(), unit: newUnit.trim() || 'kg' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
      setAddDialog(false); setNewName(''); setNewUnit('kg');
      toast({ title: 'Material added' });
    },
  });

  const entryMutation = useMutation({
    mutationFn: (d: { id: string; openingStock: number; stockIn: number; processed: number; outputLitres: number }) =>
      api.upsertRawMaterialEntry(d.id, { openingStock: d.openingStock, stockIn: d.stockIn, processed: d.processed, outputLitres: d.outputLitres }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
      queryClient.invalidateQueries({ queryKey: ['raw-analytics-dates'] });
      queryClient.invalidateQueries({ queryKey: ['raw-analytics-day'] });
      setEditMaterial(null); setPrefill(null);
      toast({ title: 'Entry saved' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRawMaterial(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['raw-materials'] }); setDeleteTarget(null); },
  });

  async function openUpdateDialog(m: RawMaterial) {
    const rid = ++prefillRequestRef.current;
    setEditMaterial(m); setPrefill(null);
    setEntryOpening(''); setEntryStockIn(''); setEntryProcessed(''); setEntryOutput('');
    setPrefillLoading(true);
    try {
      const p = await api.getRawMaterialPrefill(m._id);
      if (rid !== prefillRequestRef.current) return;
      setPrefill(p);
      setEntryOpening(p.openingStock.toString());
      setEntryStockIn(p.stockIn.toString());
      setEntryProcessed(p.processed.toString());
      setEntryOutput((p.outputLitres ?? 0).toString());
    } catch {
      if (rid !== prefillRequestRef.current) return;
      setEditMaterial(null);
      toast({ title: 'Failed to load entry data', variant: 'destructive' });
    } finally {
      if (rid === prefillRequestRef.current) setPrefillLoading(false);
    }
  }

  const entryOpVal = parseFloat(entryOpening) || 0;
  const entryStVal = parseFloat(entryStockIn) || 0;
  const entryPrVal = parseFloat(entryProcessed) || 0;
  const entryOutVal = parseFloat(entryOutput) || 0;
  const entryClosing = Math.max(0, entryOpVal + entryStVal - entryPrVal);
  const overdrawn = entryOpVal + entryStVal - entryPrVal < 0;

  const totalProcessed = dayItems.reduce((s, i) => s + i.processed, 0);
  const totalStockIn = dayItems.reduce((s, i) => s + i.stockIn, 0);
  const totalOutput = dayItems.reduce((s, i) => s + (i.outputLitres ?? 0), 0);
  const totalClosing = dayItems.reduce((s, i) => s + i.closing, 0);

  function generateReport() {
    if (!reportDate) return;
    const d = reportDate;
    const formattedDate = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    api.getRawMaterialAnalytics(selectedStoreId, { date: d }).then((res) => {
      const items = (res.items ?? []) as RawMaterialDailyItem[];
      const sep = '─'.repeat(60);
      const lines: string[] = [
        '🏭 PRODUCTION MANAGEMENT REPORT',
        sep,
        `Store   : ${storeName}`,
        `Date    : ${formattedDate}`,
        '',
        'PRODUCTION LOG',
        sep,
        `${'Material'.padEnd(18)} ${'Open(kg)'.padStart(9)} ${'In(kg)'.padStart(8)} ${'Used(kg)'.padStart(9)} ${'Out(L)'.padStart(8)} ${'Close(kg)'.padStart(10)}`,
        sep,
        ...items.map((i) =>
          `${(i.materialName ?? '—').substring(0, 17).padEnd(18)} ${String(i.openingStock).padStart(9)} ${String(i.stockIn).padStart(8)} ${String(i.processed).padStart(9)} ${String(i.outputLitres ?? 0).padStart(8)} ${String(i.closing).padStart(10)}`
        ),
        sep,
        '',
        'TOTALS',
        sep,
        `Total Stock In  : ${items.reduce((s, i) => s + i.stockIn, 0)} kg`,
        `Total Processed : ${items.reduce((s, i) => s + i.processed, 0)} kg`,
        `Total Output    : ${items.reduce((s, i) => s + (i.outputLitres ?? 0), 0)} L`,
        `Total Closing   : ${items.reduce((s, i) => s + i.closing, 0)} kg`,
        '',
        sep,
        'Generated by Nature Lite Admin Panel',
      ];
      setReportText(lines.join('\n'));
      setShowReportConfig(false);
      setShowReport(true);
    }).catch(() => toast({ title: 'Failed to load data for report', variant: 'destructive' }));
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-[#1E3D2B] flex items-center justify-center">
              <Cog className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">PMS</h1>
            <span className="text-sm text-gray-400 font-normal">— Production Management</span>
          </div>
          <p className="text-gray-500 text-sm">Log daily raw material usage and oil output in litres</p>
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
          <Button onClick={() => setShowReportConfig(true)} disabled={!selectedStoreId} variant="outline" className="gap-2 h-9">
            <FileText className="h-4 w-4" /> Generate Report
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search raw materials…" className="pl-9 bg-white" />
        </div>
        <Button
          variant={showAnalytics ? 'default' : 'outline'}
          onClick={() => setShowAnalytics((v) => !v)}
          disabled={!selectedStoreId}
          className="gap-2"
        >
          <BarChart2 className="h-4 w-4" />
          Daily Log
          {showAnalytics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
        <Button onClick={() => setAddDialog(true)} disabled={!selectedStoreId} className="gap-2">
          <Plus className="h-4 w-4" /> Add Material
        </Button>
      </div>

      {/* Materials Table */}
      {!selectedStoreId ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Cog className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="text-gray-400 text-sm">Select a store to view production data</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card><CardContent className="py-6 space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</CardContent></Card>
      ) : materials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FlaskConical className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="text-gray-500 font-medium">{search ? 'No materials found' : 'No raw materials yet'}</p>
            {!search && <p className="text-gray-400 text-sm mt-1">Click &quot;Add Material&quot; to get started</p>}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Material</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Opening</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Stock In</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Processed</th>
                  <th className="text-center px-4 py-3.5 font-semibold text-blue-500 text-xs uppercase tracking-wide">Output (L)</th>
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
                            <p className="text-xs text-gray-400 mt-0.5">{m.unit}{!hasEntry && ' · no entry today'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {hasEntry ? <span className="font-medium text-gray-700">{entry!.openingStock}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {hasEntry ? (
                          <span className={`font-semibold ${entry!.stockIn > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {entry!.stockIn > 0 ? `+${entry!.stockIn}` : '0'}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {hasEntry ? (
                          <span className={`font-semibold ${entry!.processed > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                            {entry!.processed > 0 ? `−${entry!.processed}` : '0'}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {hasEntry ? (
                          <span className={`font-semibold flex items-center justify-center gap-1 ${(entry!.outputLitres ?? 0) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            <Droplets className="h-3 w-3" />
                            {(entry!.outputLitres ?? 0) > 0 ? entry!.outputLitres : '0'}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold min-w-[48px] ${closingBadge(closing)}`}>
                          {closing}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-70 group-hover:opacity-100">
                          <Button variant="outline" size="sm" onClick={() => openUpdateDialog(m)} className="h-8 text-xs">Log Entry</Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50" onClick={() => setDeleteTarget(m)}>
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

      {/* Daily Log Analytics */}
      {showAnalytics && selectedStoreId && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-gray-700">
              <BarChart2 className="h-4 w-4 text-brand-green" />
              <span className="font-semibold text-sm">Daily Production Log</span>
            </div>
            {availableDates.length > 0 ? (
              <Select value={analyticsDate} onValueChange={setAnalyticsDate}>
                <SelectTrigger className="w-40 h-9 text-sm bg-white"><SelectValue placeholder="Select date" /></SelectTrigger>
                <SelectContent>
                  {availableDates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm text-gray-400">No entries yet</span>
            )}
          </div>

          {analyticsDate && !dayLoading && dayItems.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Stock In', value: `+${totalStockIn} kg`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Processed', value: `${totalProcessed} kg`, color: 'text-orange-500', bg: 'bg-orange-50' },
                { label: 'Output', value: `${totalOutput} L`, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Closing', value: `${totalClosing} kg`, color: totalClosing <= 0 ? 'text-red-600' : 'text-gray-800', bg: 'bg-gray-50' },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
                  <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {!analyticsDate ? (
            <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-gray-400">No entries recorded yet</CardContent></Card>
          ) : dayLoading ? (
            <Card><CardContent className="py-6 space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</CardContent></Card>
          ) : dayItems.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-gray-400">No entries for {analyticsDate}</CardContent></Card>
          ) : (
            <Card className="overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Material</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Opening</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Stock In</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Processed</th>
                      <th className="text-center px-4 py-3 font-semibold text-blue-500 text-xs uppercase tracking-wide">Output (L)</th>
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
                          <span className={`font-semibold flex items-center justify-center gap-1 ${(item.outputLitres ?? 0) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            <Droplets className="h-3 w-3" />
                            {item.outputLitres ?? 0}
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
          <DialogHeader><DialogTitle>New Raw Material</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Material Name</label>
              <Input placeholder="e.g. Groundnut, Sesame Seeds" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMutation.mutate()} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Unit</label>
              <Input placeholder="kg" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Raw material input unit (usually kg)</p>
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
                <p className="text-sm text-gray-400 mt-0.5">Today&apos;s production entry</p>
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
              <p className="text-sm text-gray-400 mt-3">Loading values…</p>
            </div>
          ) : (
            <div className="space-y-5 py-1">
              <div className="flex items-center justify-between rounded-xl bg-gray-50 border px-4 py-3">
                <div>
                  <p className="text-xs text-gray-400">Last closing stock</p>
                  <p className="text-xl font-bold text-gray-800 mt-0.5">{editMaterial?.totalStock ?? 0} <span className="text-sm font-normal text-gray-400">{editMaterial?.unit}</span></p>
                </div>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${closingBadge(editMaterial?.totalStock ?? 0)}`}>
                  <FlaskConical className="h-4 w-4" />
                </div>
              </div>

              {/* Input fields: Opening, StockIn, Processed */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Raw Material ({editMaterial?.unit})</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Opening', color: '', val: entryOpening, setter: setEntryOpening },
                    { label: '+ Stock In', color: 'text-emerald-600', val: entryStockIn, setter: setEntryStockIn, border: 'border-emerald-200' },
                    { label: '− Processed', color: 'text-orange-500', val: entryProcessed, setter: setEntryProcessed, border: 'border-orange-200' },
                  ].map((f) => (
                    <div key={f.label} className="space-y-1.5">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${f.color || 'text-gray-500'}`}>{f.label}</label>
                      <Input type="number" min="0" step="0.01" placeholder="0" value={f.val} onChange={(e) => f.setter(e.target.value)} className={`text-center font-semibold text-base h-11 ${f.border ?? ''}`} />
                      <p className="text-center text-xs text-gray-400">{editMaterial?.unit}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Output litres */}
              <div>
                <p className="text-xs font-medium text-blue-500 uppercase tracking-wide mb-3">Oil Output (Litres)</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-semibold text-blue-500 uppercase tracking-wide flex items-center gap-1">
                      <Droplets className="h-3.5 w-3.5" /> Output
                    </label>
                    <Input type="number" min="0" step="0.01" placeholder="0" value={entryOutput} onChange={(e) => setEntryOutput(e.target.value)} className="text-center font-semibold text-base h-11 border-blue-200 focus:ring-blue-300" />
                    <p className="text-center text-xs text-gray-400">litres</p>
                  </div>
                  <div className="text-center text-gray-400 mt-4">
                    <p className="text-xs">from</p>
                    <p className="text-sm font-bold text-orange-500">{entryPrVal} {editMaterial?.unit}</p>
                    <p className="text-xs">processed</p>
                  </div>
                </div>
              </div>

              {/* Closing result */}
              <div className={`rounded-xl px-4 py-3.5 flex items-center justify-between ${closingBadge(entryClosing)}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">= Closing Stock</p>
                  {overdrawn && <p className="text-xs mt-0.5 opacity-70">Clamped to 0</p>}
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
                entryMutation.mutate({ id: editMaterial._id, openingStock: entryOpVal, stockIn: entryStVal, processed: entryPrVal, outputLitres: entryOutVal });
              }}
              disabled={entryMutation.isPending || prefillLoading}
            >
              {entryMutation.isPending ? 'Saving…' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Raw Material</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500 py-1">Delete <span className="font-semibold text-gray-800">{deleteTarget?.name}</span>? History remains but it won&apos;t appear in PMS anymore.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Config Dialog */}
      <Dialog open={showReportConfig} onOpenChange={setShowReportConfig}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Generate Production Report</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Select Date</label>
              {availableDates.length > 0 ? (
                <Select value={reportDate} onValueChange={setReportDate}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choose a date" /></SelectTrigger>
                  <SelectContent>
                    {availableDates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-gray-400">No entries available yet. Log some entries first.</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReportConfig(false)}>Cancel</Button>
            <Button onClick={generateReport} disabled={!reportDate || availableDates.length === 0}>
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Modal */}
      <ReportModal open={showReport} onClose={() => setShowReport(false)} reportText={reportText} reportTitle="PMS — Production Report" />
    </div>
  );
}
