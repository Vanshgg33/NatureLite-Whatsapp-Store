'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Category } from '@/types';

const REQUIRED_COLS = ['name', 'sku', 'price'];
const ALL_COLS = [
  'name*', 'sku*', 'price*', 'compareAtPrice', 'specialOfferPrice', 'specialOfferLabel',
  'stock', 'shortDescription', 'tags (pipe-separated)', 'isActive (true/false)',
  'isFeatured (true/false)', 'gstPercentage', 'hsnCode', 'videoUrl',
  'seoTitle', 'seoDescription', 'seoKeywords', 'canonicalUrl',
];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { values.push(cur); cur = ''; continue; }
      cur += c;
    }
    values.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    return row;
  });
}

export default function ImportProductsPage() {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [defaultCategoryId, setDefaultCategoryId] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [parseError, setParseError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories({ limit: 100 }),
  });
  const categoryList: Category[] = Array.isArray(categories)
    ? categories
    : Array.isArray((categories as { items?: Category[] })?.items)
      ? (categories as { items: Category[] }).items
      : [];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseCsv(text);
        if (parsed.length === 0) { setParseError('CSV appears empty or has no data rows.'); return; }
        const missing = REQUIRED_COLS.filter((col) => !(col in (parsed[0] ?? {})));
        if (missing.length > 0) {
          setParseError(`Missing required columns: ${missing.join(', ')}`);
          return;
        }
        setRows(parsed);
      } catch {
        setParseError('Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!rows || !defaultCategoryId) return;
    setImporting(true);
    try {
      const res = await api.importProductsCsv(rows, defaultCategoryId);
      setResult(res);
      setRows(null);
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setResult({ created: 0, skipped: rows.length, errors: [(err as Error).message] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <Header
        title="Import Products"
        description="Bulk upload products via CSV"
        action={
          <Link href="/admin/products">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6 max-w-3xl">
        {/* Template info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">CSV Format</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Required columns are marked with *. All other columns are optional.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COLS.map((c) => (
                <span
                  key={c}
                  className={`text-xs px-2 py-0.5 rounded font-mono ${
                    c.endsWith('*') ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Products with an existing SKU will be <strong>skipped</strong> (no duplicates).
              Tags should be pipe-separated: <code className="bg-muted px-1 rounded">organic|ghee|bulk</code>
            </p>
          </CardContent>
        </Card>

        {/* File upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Upload CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Default Category <span className="text-destructive">*</span></label>
              <select
                value={defaultCategoryId}
                onChange={(e) => setDefaultCategoryId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select category —</option>
                {categoryList.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Applied to all imported products (overridden if CSV has a categoryId column).</p>
            </div>

            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer hover:bg-muted/40 transition-colors">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <span className="text-sm font-medium">{fileName || 'Click to select CSV file'}</span>
              <span className="text-xs text-muted-foreground mt-1">Only .csv files</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>

            {parseError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {parseError}
              </div>
            )}

            {rows && (
              <div className="flex items-center justify-between text-sm bg-muted/40 rounded-lg px-4 py-3">
                <span className="text-muted-foreground">{rows.length} rows ready to import</span>
                <Button onClick={handleImport} disabled={importing || !defaultCategoryId}>
                  <Upload className="mr-2 h-4 w-4" />
                  {importing ? 'Importing…' : 'Import Now'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Import Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.created}</p>
                  <p className="text-xs text-green-600 mt-0.5">Created</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{result.skipped}</p>
                  <p className="text-xs text-yellow-600 mt-0.5">Skipped</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{result.errors.length}</p>
                  <p className="text-xs text-red-600 mt-0.5">Errors</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1">{e}</p>
                  ))}
                </div>
              )}

              <Link href="/admin/products">
                <Button variant="outline" className="w-full">View Products</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
