'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FlaskConical, Search, FileText, Mail, MessageSquare, TrendingDown, AlertTriangle, CheckCircle2,
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
import type { Store, RawMaterial } from '@/types';

function stockStatus(stock: number): { label: string; color: string; bg: string } {
  if (stock <= 0) return { label: 'Critical', color: 'text-red-700', bg: 'bg-red-100' };
  if (stock < 20) return { label: 'Low', color: 'text-amber-700', bg: 'bg-amber-100' };
  return { label: 'Good', color: 'text-emerald-700', bg: 'bg-emerald-100' };
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

export default function RMSPage() {
  const { user } = useAdminAuthStore();
  const { toast } = useToast();
  const [selectedStoreId, setSelectedStoreId] = useState<string>(user?.storeId || '');
  const [search, setSearch] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');

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

  const criticalCount = materials.filter((m) => m.totalStock <= 0).length;
  const lowCount = materials.filter((m) => m.totalStock > 0 && m.totalStock < 20).length;
  const goodCount = materials.filter((m) => m.totalStock >= 20).length;

  function generateReport() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const sep = '─'.repeat(52);
    const lines: string[] = [
      '🌾 RAW MATERIAL STOCK REPORT',
      sep,
      `Store : ${storeName}`,
      `Date  : ${dateStr}`,
      '',
      'CURRENT STOCK LEVELS',
      sep,
      `${'Material'.padEnd(22)} ${'Unit'.padEnd(8)} ${'Stock'.padStart(8)}  Status`,
      sep,
      ...materials.map((m) => {
        const s = stockStatus(m.totalStock);
        const icon = m.totalStock <= 0 ? '❌' : m.totalStock < 20 ? '⚠️' : '✅';
        return `${m.name.substring(0, 21).padEnd(22)} ${m.unit.padEnd(8)} ${String(m.totalStock).padStart(8)}  ${icon} ${s.label}`;
      }),
      sep,
      '',
      'SUMMARY',
      sep,
      `Total Materials : ${materials.length}`,
      `Good Stock      : ${goodCount}`,
      `Low Stock       : ${lowCount}`,
      `Critical (Zero) : ${criticalCount}`,
      '',
      sep,
      'Generated by Nature Lite Admin Panel',
    ];
    setReportText(lines.join('\n'));
    setShowReport(true);
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
          <Button onClick={generateReport} disabled={!selectedStoreId || materials.length === 0} variant="outline" className="gap-2 h-9">
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

      {/* Report Modal */}
      <ReportModal open={showReport} onClose={() => setShowReport(false)} reportText={reportText} reportTitle="RMS — Raw Material Stock Report" />
    </div>
  );
}
