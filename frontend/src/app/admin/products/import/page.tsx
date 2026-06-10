'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, CheckCircle, AlertCircle, FileText, Settings2, Columns, Grid, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { Category } from '@/types';

interface TargetField {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}

const TARGET_FIELDS: TargetField[] = [
  { key: 'name', label: 'Product Name', required: true, aliases: ['name', 'title', 'product name', 'product_name', 'item name', 'item_name'] },
  { key: 'sku', label: 'SKU Code', required: true, aliases: ['sku', 'code', 'id', 'product sku', 'product_sku', 'item code', 'item_code'] },
  { key: 'price', label: 'Price', required: true, aliases: ['price', 'mrp', 'rate', 'cost', 'value', 'price inr', 'price_inr'] },
  { key: 'compareAtPrice', label: 'Compare At Price', required: false, aliases: ['compare', 'compare at price', 'compare_at_price', 'strike price'] },
  { key: 'specialOfferPrice', label: 'Special Offer Price', required: false, aliases: ['special', 'special price', 'offer price'] },
  { key: 'specialOfferLabel', label: 'Special Offer Label', required: false, aliases: ['label', 'offer label'] },
  { key: 'stock', label: 'Stock Quantity', required: false, aliases: ['stock', 'qty', 'quantity'] },
  { key: 'shortDescription', label: 'Short Description', required: false, aliases: ['description', 'desc', 'short description'] },
  { key: 'tags', label: 'Tags (pipe-separated)', required: false, aliases: ['tags', 'tag', 'keywords'] },
  { key: 'isActive', label: 'Status (Active)', required: false, aliases: ['active', 'isactive', 'status'] },
  { key: 'isFeatured', label: 'Featured', required: false, aliases: ['featured', 'isfeatured'] },
  { key: 'hsnCode', label: 'HSN Code', required: false, aliases: ['hsn', 'hsncode'] },
  { key: 'videoUrl', label: 'Video URL', required: false, aliases: ['video', 'videourl'] },
];

const ALL_COLS = [
  'name*', 'sku*', 'price*', 'compareAtPrice', 'specialOfferPrice', 'specialOfferLabel',
  'stock', 'shortDescription', 'tags (pipe-separated)', 'isActive (true/false)',
  'isFeatured (true/false)', 'hsnCode', 'videoUrl',
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
  const [rawRows, setRawRows] = useState<Record<string, string>[] | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isMappingOpen, setIsMappingOpen] = useState(false);
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

  const autoMapHeaders = (headers: string[]) => {
    const newMapping: Record<string, string> = {};
    TARGET_FIELDS.forEach((tf) => {
      const match = headers.find((h) => {
        const cleanH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        return tf.aliases.some((alias) => {
          const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanH.includes(cleanAlias) || cleanAlias.includes(cleanH);
        });
      });
      newMapping[tf.key] = match || '';
    });
    setMapping(newMapping);
  };

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
        
        const headers = Object.keys(parsed[0]);
        setCsvHeaders(headers);
        setRawRows(parsed);
        autoMapHeaders(headers);
        setIsMappingOpen(true);
      } catch {
        setParseError('Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmMapping = () => {
    if (!rawRows) return;
    const finalRows = rawRows.map((row) => {
      const mappedRow: Record<string, string> = {};
      TARGET_FIELDS.forEach((tf) => {
        const mappedCol = mapping[tf.key];
        if (mappedCol) {
          mappedRow[tf.key] = row[mappedCol] || '';
        }
      });
      return mappedRow;
    });
    setRows(finalRows);
    setIsMappingOpen(false);
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

  const isAllRequiredMapped = TARGET_FIELDS.filter((f) => f.required).every((f) => !!mapping[f.key]);

  const getMappedPreviewRows = () => {
    if (!rawRows) return [];
    return rawRows.slice(0, 3).map((row) => {
      const mapped: Record<string, string> = {};
      TARGET_FIELDS.forEach((tf) => {
        const mappedCol = mapping[tf.key];
        mapped[tf.key] = mappedCol ? row[mappedCol] || '' : '';
      });
      return mapped;
    });
  };

  const previewRows = getMappedPreviewRows();

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
              Required columns are marked with *. All other columns are optional. You can map custom CSV headers to target fields.
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
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-muted-foreground font-medium">{rows.length} rows ready to import with custom mapping</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsMappingOpen(true)}>
                    <Settings2 className="mr-1.5 h-4 w-4" /> Edit Mapping
                  </Button>
                  <Button onClick={handleImport} disabled={importing || !defaultCategoryId}>
                    <Upload className="mr-2 h-4 w-4" />
                    {importing ? 'Importing…' : 'Import Now'}
                  </Button>
                </div>
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

      {/* CSV Column Mapping Dialog */}
      <Dialog open={isMappingOpen} onOpenChange={setIsMappingOpen}>
        <DialogContent className="sm:max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Columns className="h-5 w-5 text-primary" /> Map CSV Columns
            </DialogTitle>
            <DialogDescription>
              Align your CSV headers with target product fields to resolve mismatches. Auto-mapping was applied based on fuzzy matching.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            {/* Field Mapping Forms */}
            <div className="space-y-4">
              {/* Required fields */}
              <div className="border rounded-xl p-3 bg-primary/[0.02]">
                <h3 className="text-xs font-semibold mb-2.5 text-primary uppercase tracking-wider">Required Fields</h3>
                <div className="space-y-3">
                  {TARGET_FIELDS.filter((f) => f.required).map((tf) => (
                    <div key={tf.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold flex items-center gap-1 text-foreground">
                          {tf.label} <span className="text-red-500">*</span>
                        </span>
                        {mapping[tf.key] ? (
                          <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Check className="h-3 w-3" /> Mapped
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                            Unmapped
                          </span>
                        )}
                      </div>
                      <select
                        value={mapping[tf.key] || ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [tf.key]: e.target.value }))}
                        className="w-full text-xs border rounded-lg h-9 px-2 bg-background select-none outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">— Select CSV Column —</option>
                        {csvHeaders.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Optional fields */}
              <div className="border rounded-xl p-3 bg-muted/20">
                <h3 className="text-xs font-semibold mb-2.5 text-muted-foreground uppercase tracking-wider">Optional Fields</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                  {TARGET_FIELDS.filter((f) => !f.required).map((tf) => (
                    <div key={tf.key} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-foreground">{tf.label}</span>
                      <select
                        value={mapping[tf.key] || ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [tf.key]: e.target.value }))}
                        className="w-full text-xs border rounded-lg h-8 px-2 bg-background select-none outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">— Don't Map —</option>
                        {csvHeaders.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Data Preview */}
            <div className="flex flex-col gap-4">
              <div className="border rounded-xl p-4 bg-primary/[0.01] flex-1 flex flex-col min-h-[300px]">
                <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-primary border-b pb-2">
                  <Grid className="h-4 w-4" /> Live Mapping Preview (First 3 rows)
                </h3>
                
                <div className="space-y-3 overflow-y-auto flex-1 max-h-[400px] pr-1">
                  {previewRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center my-auto">No rows preview. Set maps above.</p>
                  ) : (
                    previewRows.map((pRow, idx) => (
                      <div key={idx} className="bg-background border rounded-xl p-3 font-mono text-[11px] space-y-1.5 shadow-sm">
                        <div className="text-[10px] font-sans font-bold text-primary border-b pb-1 mb-1 flex justify-between">
                          <span>ROW #{idx + 1}</span>
                          {(!pRow.name || !pRow.sku || !pRow.price) && (
                            <span className="text-[9px] text-red-500 uppercase tracking-wider font-semibold">Missing required fields</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                          {TARGET_FIELDS.map((tf) => {
                            const val = pRow[tf.key];
                            if (!val && !tf.required) return null;
                            return (
                              <div key={tf.key} className="truncate">
                                <span className={`font-sans ${tf.required ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                                  {tf.key}:
                                </span>{' '}
                                <span className={val ? 'text-foreground' : 'text-red-500 italic'}>
                                  {val || '(missing)'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-3 mt-2 flex items-center sm:justify-between w-full flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              {!isAllRequiredMapped && (
                <span className="text-amber-600 font-medium flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Please map all required fields (Name, SKU, Price).
                </span>
              )}
              {isAllRequiredMapped && (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> All required fields mapped successfully!
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setIsMappingOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmMapping} disabled={!isAllRequiredMapped}>
                Confirm Mapping
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
