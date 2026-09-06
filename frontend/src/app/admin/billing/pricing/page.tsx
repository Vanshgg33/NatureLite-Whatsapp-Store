'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Upload, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ALL_TAGS = ['B2B', 'Transport', 'Home Delivery', 'Store/Retail', 'Wholesale', 'Retail'] as const;
type CTag = typeof ALL_TAGS[number];

const TAG_COLORS: Record<CTag, string> = {
  B2B: 'bg-blue-50 text-blue-700',
  Transport: 'bg-orange-50 text-orange-700',
  'Home Delivery': 'bg-teal-50 text-teal-700',
  'Store/Retail': 'bg-purple-50 text-purple-700',
  Wholesale: 'bg-amber-50 text-amber-700',
  Retail: 'bg-pink-50 text-pink-700',
};

export default function BillingPricingPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const qc = useQueryClient();
  const { toast } = useToast();

  // local edits: { [productId]: { [tag]: string (raw input) } }
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  // track which cells are dirty
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const { data: productsRes } = useQuery({
    queryKey: ['products-for-pricing', debouncedSearch],
    queryFn: () => api.getProducts({ search: debouncedSearch, limit: 50, isActive: true }),
  });

  const { data: tagPricesAll = [] } = useQuery({
    queryKey: ['billing-tag-prices'],
    queryFn: () => api.getBillingTagPrices(),
  });

  // index tag prices by productId
  const priceIndex: Record<string, Record<string, { _id: string; price: number }>> = {};
  for (const tp of tagPricesAll) {
    const pid = tp.productId?._id ?? tp.productId;
    if (!priceIndex[pid]) priceIndex[pid] = {};
    priceIndex[pid][tp.tag] = { _id: tp._id, price: tp.price };
  }

  const saveMutation = useMutation({
    mutationFn: (rows: Array<{ productId: string; tag: string; price: number }>) =>
      api.bulkUpsertBillingTagPrices(rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-tag-prices'] });
      setEdits({});
      setDirty(new Set());
      toast({ title: 'Prices saved' });
    },
    onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
  });

  const handleChange = (productId: string, tag: string, val: string) => {
    setEdits(e => ({ ...e, [productId]: { ...(e[productId] ?? {}), [tag]: val } }));
    setDirty(d => new Set(d).add(`${productId}__${tag}`));
  };

  const handleSaveAll = () => {
    const rows: Array<{ productId: string; tag: string; price: number }> = [];
    for (const [productId, tagMap] of Object.entries(edits)) {
      for (const [tag, val] of Object.entries(tagMap)) {
        const n = parseFloat(val);
        if (!isNaN(n) && n >= 0) rows.push({ productId, tag, price: n });
      }
    }
    if (!rows.length) return;
    saveMutation.mutate(rows);
  };

  // CSV bulk upload: columns: sku, tag, price
  const handleCsvUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n');
      const products = productsRes?.items ?? [];
      const rows: Array<{ productId: string; tag: string; price: number }> = [];
      for (const line of lines) {
        const [sku, tag, priceStr] = line.split(',').map(s => s.trim());
        const product = products.find((p: any) => p.sku === sku);
        if (!product || !tag || !priceStr) continue;
        const price = parseFloat(priceStr);
        if (!isNaN(price)) rows.push({ productId: product._id, tag, price });
      }
      if (!rows.length) {
        toast({ title: 'No valid rows found in CSV', variant: 'destructive' });
        return;
      }
      await api.bulkUpsertBillingTagPrices(rows);
      qc.invalidateQueries({ queryKey: ['billing-tag-prices'] });
      toast({ title: `${rows.length} prices uploaded` });
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [productsRes, qc, toast]);

  const products = productsRes?.items ?? [];
  const hasDirty = dirty.size > 0;

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <Header title="Tag-Based Pricing" />

      <div className="p-6 max-w-7xl mx-auto space-y-5">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="sr-only" onChange={handleCsvUpload} />
            <Button variant="outline" asChild>
              <span><Upload className="h-4 w-4 mr-1.5" /> Upload CSV</span>
            </Button>
          </label>

          {hasDirty && (
            <Button onClick={handleSaveAll} disabled={saveMutation.isPending} className="bg-[#2d7a4f] hover:bg-[#245f3e] text-white">
              <Save className="h-4 w-4 mr-1.5" />
              {saveMutation.isPending ? 'Saving…' : `Save ${dirty.size} change${dirty.size > 1 ? 's' : ''}`}
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-400">CSV format, one row per line: <code>sku,tag,price</code> — no header row</p>

        {/* Price grid */}
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-64">Product</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 w-24">Base ₹</th>
                {ALL_TAGS.map(tag => (
                  <th key={tag} className={`px-3 py-3 text-center font-medium text-xs ${TAG_COLORS[tag]} rounded-md mx-1`}>
                    {tag}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.length === 0 && (
                <tr>
                  <td colSpan={3 + ALL_TAGS.length} className="text-center text-gray-400 py-12">
                    {search ? 'No products match.' : 'Loading products…'}
                  </td>
                </tr>
              )}
              {products.map((p: any) => {
                const saved = priceIndex[p._id] ?? {};
                const local = edits[p._id] ?? {};
                return (
                  <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-800 truncate max-w-[16rem]">{p.name}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{p.sku}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">₹{p.price}</td>
                    {ALL_TAGS.map(tag => {
                      const savedVal = saved[tag]?.price;
                      const localVal = local[tag];
                      const isDirty = dirty.has(`${p._id}__${tag}`);
                      const displayVal = localVal !== undefined ? localVal : (savedVal !== undefined ? String(savedVal) : '');
                      return (
                        <td key={tag} className="px-2 py-2">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={displayVal}
                              placeholder="—"
                              onChange={e => handleChange(p._id, tag, e.target.value)}
                              className={`w-24 pl-5 pr-2 py-1.5 text-sm border rounded-md text-right focus:outline-none focus:ring-2 focus:ring-[#2d7a4f] transition-all ${
                                isDirty ? 'border-[#2d7a4f] bg-green-50' : 'border-gray-200'
                              }`}
                            />
                            {isDirty && savedVal !== undefined && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEdits(e => {
                                    const next = { ...e };
                                    if (next[p._id]) delete next[p._id][tag];
                                    return next;
                                  });
                                  setDirty(d => { const s = new Set(d); s.delete(`${p._id}__${tag}`); return s; });
                                }}
                                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                              >
                                <X className="h-2.5 w-2.5 text-gray-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
