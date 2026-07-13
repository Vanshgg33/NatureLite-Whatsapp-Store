'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Megaphone, Phone, Send, Users, Image as ImageIcon,
  Upload, X, Search, LinkIcon, RefreshCw, Clock, AlertCircle, Smartphone, FileSpreadsheet,
  Columns, Grid,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Header } from '@/components/layout/header';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { useToast } from '@/components/ui/use-toast';
import { User, CampaignRecord, TemplatePreset, WaTemplate } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageType = 'template' | 'media';
type MediaMethod = 'upload' | 'url' | 'pdf';
type ImageInputMethod = 'upload' | 'url';
type RecipientFilter = 'all' | 'ordered' | 'manual';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseList = (value: string) =>
  value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

const normalizeIndianPhone = (raw: string): string | null => {
  const digits = raw.replace(/[^\d]/g, '');
  let n = digits;
  if (n.length === 10) n = '91' + n;
  else if (n.length === 11 && n.startsWith('0')) n = '91' + n.slice(1);
  return n.length >= 10 ? n : null;
};

const parsePhones = (value: string) => {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalid = 0;
  for (const raw of parseList(value)) {
    const phone = normalizeIndianPhone(raw);
    if (!phone) { invalid++; continue; }
    if (!seen.has(phone)) { seen.add(phone); valid.push(phone); }
  }
  return { valid, invalid };
};

// Parses a CSV/TSV text and extracts phone numbers and optional names.
function extractPhonesFromCsv(text: string): { phones: string; found: number; colName: string; nameMap: Map<string, string> } {
  // Strip UTF-8 BOM that Excel adds
  const clean = text.startsWith('﻿') ? text.slice(1) : text;

  // Handle all line-ending styles: CRLF, CR-only (old Mac), LF
  const lines = clean.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { phones: '', found: 0, colName: '', nameMap: new Map() };

  // Detect delimiter by counting occurrences OUTSIDE quoted regions in the first line.
  // This avoids false positives from delimiter chars that appear inside quoted fields.
  const sample = lines[0];
  let tabs = 0, semis = 0, commas = 0, inQ = false;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') { if (inQ && sample[i + 1] === '"') i++; else inQ = !inQ; }
    else if (!inQ) {
      if (c === '\t') tabs++;
      else if (c === ';') semis++;
      else if (c === ',') commas++;
    }
  }
  const delimiter = tabs > 0 ? '\t' : semis > commas ? ';' : ',';

  const parseRow = (line: string): string[] => {
    const cols: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (c === delimiter && !q) {
        cols.push(cur.trim()); cur = '';
      } else {
        cur += c;
      }
    }
    cols.push(cur.trim());
    return cols;
  };

  const rows = lines.map(parseRow);
  const firstRow = rows[0];
  const headerLower = firstRow.map(h => h.toLowerCase().replace(/[\s_.:-]/g, ''));

  // ── Phone column detection ──────────────────────────────────────────────
  // Score a column by how many of its data-row values look like phone numbers.
  const scorePhoneCol = (cIdx: number, dataR: string[][]) =>
    dataR.reduce((n, r) => n + (/^\+?\d[\d\s\-()]{7,}$/.test((r[cIdx] ?? '').trim()) ? 1 : 0), 0);

  // Keyword sets with exclusions to prevent false positives:
  // - 'wa'/'contact'/'number' are too broad, so we block non-phone combos.
  const strongKws   = ['phone', 'mobile', 'tel', 'whatsapp', 'cell'];
  const weakKws     = ['contact', 'number', 'wa'];
  const nonPhoneKws = ['email', 'mail', 'address', 'order', 'invoice', 'serial', 'ref', 'receipt', 'url', 'web', 'info', 'form'];

  const isPhoneHeader = (h: string): boolean => {
    if (nonPhoneKws.some(np => h.includes(np))) return false;
    if (strongKws.some(kw => h.includes(kw))) return true;
    // 'wa' only as a standalone or prefix/suffix, not buried in unrelated words
    if (h === 'wa' || h.startsWith('wa') || h.endsWith('wa')) return true;
    // 'contact' and 'number' only if they don't combine with non-phone words (already checked above)
    return weakKws.some(kw => h.includes(kw));
  };

  // Collect ALL keyword-matching column candidates, score each by actual phone values,
  // and pick the highest scorer — this handles the case where a non-phone col (like
  // ordernumber) matches a keyword but has no phone-like values, while the real phone
  // col (customerphone) is found later.
  const dataRowsForScoring = rows.slice(1).length > 0 ? rows.slice(1) : rows;
  const keywordCandidates = headerLower
    .map((h, i) => ({ i, h, score: 0 }))
    .filter(({ h }) => isPhoneHeader(h));

  let colIdx    = -1;
  let colName   = '';
  let dataRows  = rows;
  let hasHeader = false;

  if (keywordCandidates.length > 0) {
    // Score each candidate against data rows
    for (const c of keywordCandidates) c.score = scorePhoneCol(c.i, dataRowsForScoring);
    const best = keywordCandidates.reduce((a, b) => b.score > a.score ? b : a);

    // Only trust the keyword match if it actually has phone-like values.
    // If best score is 0, fall through to the heuristic scan below.
    if (best.score > 0) {
      colIdx    = best.i;
      colName   = firstRow[colIdx];
      dataRows  = rows.slice(1);
      hasHeader = true;
    }
  }

  if (colIdx < 0) {
    // No keyword match with phone values — scan every column for the most phone-like values.
    const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
    let bestCol = 0, bestScore = 0;
    for (let c = 0; c < colCount; c++) {
      const score = scorePhoneCol(c, rows);
      if (score > bestScore) { bestScore = score; bestCol = c; }
    }
    colIdx = bestCol;
    // If the first-row cell in that column has < 8 digits it's a header label, skip it
    const firstCellDigits = (firstRow[colIdx] ?? '').replace(/[^\d]/g, '');
    if (firstCellDigits.length < 8) {
      colName   = firstRow[colIdx] ?? 'column ' + (colIdx + 1);
      dataRows  = rows.slice(1);
      hasHeader = true;
    } else {
      colName = 'column ' + (colIdx + 1);
      dataRows = rows;
    }
  }

  // ── Name column detection ───────────────────────────────────────────────
  // Tier-1: exact match against unambiguous name headers
  // Tier-2: ends with "name" or contains customer/client/person — but skip
  //         headers that end in an ID/code suffix (customerid, clientcode, etc.)
  let nameColIdx = -1;
  if (hasHeader) {
    const exactNameHeaders = new Set(['name', 'naam', 'fullname', 'customername', 'firstname', 'lastname', 'clientname', 'personname', 'recipientname', 'buyername', 'sendername']);
    nameColIdx = headerLower.findIndex((h, i) => i !== colIdx && exactNameHeaders.has(h));

    if (nameColIdx < 0) {
      const idSuffixes = ['id', 'code', 'no', 'num', 'number', 'file', 'user', 'image', 'url', 'path', 'link', 'key', 'type', 'email', 'mail'];
      nameColIdx = headerLower.findIndex((h, i) => {
        if (i === colIdx) return false;
        if (idSuffixes.some(s => h.endsWith(s))) return false;
        return h.endsWith('name') || h.includes('customer') || h.includes('client') || h.includes('person');
      });
    }
  }

  // ── Extract phones ──────────────────────────────────────────────────────
  const rawPhones = dataRows
    .map(r => (r[colIdx] ?? '').replace(/[\s\-+()?]/g, ''))
    .filter(p => p.replace(/[^\d]/g, '').length >= 8);

  const phones = rawPhones.join('\n');

  // Count unique entries that actually pass normalizeIndianPhone so the
  // toast count matches what the valid-badge will show in the textarea.
  const validSet = new Set<string>();
  for (const p of rawPhones) { const n = normalizeIndianPhone(p); if (n) validSet.add(n); }
  const found = validSet.size;

  // ── Build phone → name map ──────────────────────────────────────────────
  const nameMap = new Map<string, string>();
  if (nameColIdx >= 0) {
    for (const r of dataRows) {
      const rawPhone = (r[colIdx] ?? '').replace(/[\s\-+()?]/g, '');
      const name = (r[nameColIdx] ?? '').trim();
      if (rawPhone.replace(/[^\d]/g, '').length >= 8 && name) {
        const normalized = normalizeIndianPhone(rawPhone);
        if (normalized) nameMap.set(normalized, name);
      }
    }
  }

  return { phones, found, colName, nameMap };
}

// Parse CSV text into raw rows + auto-detect best phone/name column indices.
function parseCsvForMapper(text: string): {
  headers: string[]; rows: string[][]; hasHeader: boolean;
  detectedPhoneCol: number; detectedNameCol: number;
} | null {
  const clean = text.startsWith('﻿') ? text.slice(1) : text;
  const lines = clean.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const sample = lines[0];
  let tabs = 0, semis = 0, commas = 0, inQ = false;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') { if (inQ && sample[i + 1] === '"') i++; else inQ = !inQ; }
    else if (!inQ) { if (c === '\t') tabs++; else if (c === ';') semis++; else if (c === ',') commas++; }
  }
  const delim = tabs > 0 ? '\t' : semis > commas ? ';' : ',';
  const parseRow = (line: string): string[] => {
    const cols: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === delim && !q) { cols.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    cols.push(cur.trim()); return cols;
  };
  const rows = lines.map(parseRow);
  const firstRow = rows[0];
  const headerLower = firstRow.map(h => h.toLowerCase().replace(/[\s_.:-]/g, ''));
  const scorePhone = (ci: number, dr: string[][]) =>
    dr.reduce((n, r) => n + (/^\+?\d[\d\s\-()]{7,}$/.test((r[ci] ?? '').trim()) ? 1 : 0), 0);
  const strongKws = ['phone','mobile','tel','whatsapp','cell'];
  const weakKws   = ['contact','number','wa'];
  const noKws     = ['email','mail','address','order','invoice','serial','ref','receipt','url','web'];
  const isPhoneH  = (h: string) => !noKws.some(k => h.includes(k)) && (strongKws.some(k => h.includes(k)) || weakKws.some(k => h.includes(k)));
  const dataRows  = rows.slice(1).length > 0 ? rows.slice(1) : rows;
  const kwCands   = headerLower.map((h, i) => ({ i, score: 0 })).filter((_, i) => isPhoneH(headerLower[i]));
  let phoneCol = 0; let hasHeader = false;
  if (kwCands.length > 0) {
    for (const c of kwCands) c.score = scorePhone(c.i, dataRows);
    const best = kwCands.reduce((a, b) => b.score > a.score ? b : a);
    if (best.score > 0) { phoneCol = best.i; hasHeader = true; }
  }
  if (!hasHeader) {
    const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
    let bestCol = 0, bestScore = 0;
    for (let c = 0; c < colCount; c++) { const s = scorePhone(c, rows); if (s > bestScore) { bestScore = s; bestCol = c; } }
    phoneCol = bestCol;
    const firstCellDigits = (firstRow[phoneCol] ?? '').replace(/[^\d]/g, '');
    if (firstCellDigits.length < 8) hasHeader = true;
  }
  const exactNames = new Set(['name','naam','fullname','customername','firstname','lastname','clientname','personname','recipientname']);
  const idSuf = ['id','code','no','num','number','file','user','image','url','path','link','key','type','email','mail'];
  let nameCol = hasHeader
    ? headerLower.findIndex((h, i) => i !== phoneCol && exactNames.has(h))
    : -1;
  if (nameCol < 0 && hasHeader) {
    nameCol = headerLower.findIndex((h, i) =>
      i !== phoneCol && !idSuf.some(s => h.endsWith(s)) &&
      (h.endsWith('name') || h.includes('customer') || h.includes('client') || h.includes('person'))
    );
  }
  return { headers: firstRow, rows, hasHeader, detectedPhoneCol: phoneCol, detectedNameCol: nameCol };
}

// Extract phones/names from rows using explicit column indices.
function extractPhonesFromRowsByIndex(
  rows: string[][], phoneCol: number, nameCol: number, hasHeader: boolean,
): { phones: string; found: number; nameMap: Map<string, string> } {
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const rawPhones = dataRows.map(r => (r[phoneCol] ?? '').replace(/[\s\-+()?]/g, '')).filter(p => p.replace(/[^\d]/g, '').length >= 8);
  const phones = rawPhones.join('\n');
  const validSet = new Set<string>();
  for (const p of rawPhones) { const n = normalizeIndianPhone(p); if (n) validSet.add(n); }
  const nameMap = new Map<string, string>();
  if (nameCol >= 0) {
    for (const r of dataRows) {
      const rp = (r[phoneCol] ?? '').replace(/[\s\-+()?]/g, '');
      const name = (r[nameCol] ?? '').trim();
      if (rp.replace(/[^\d]/g, '').length >= 8 && name) { const n = normalizeIndianPhone(rp); if (n) nameMap.set(n, name); }
    }
  }
  return { phones, found: validSet.size, nameMap };
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function StatusBadge({ status }: { status: CampaignRecord['status'] }) {
  if (status === 'done') return <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Done</Badge>;
  if (status === 'sending') return <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200 animate-pulse">Sending…</Badge>;
  if (status === 'failed') return <Badge className="text-xs bg-red-100 text-red-800 border-red-200">Failed</Badge>;
  return <Badge variant="outline" className="text-xs">Queued</Badge>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Message type
  const [messageType, setMessageType]     = useState<MessageType>('template');

  // Template fields
  const [templateName, setTemplateName]   = useState('');
  const [languageCode, setLanguageCode]   = useState('en');
  const [headerParams, setHeaderParams]   = useState('');
  const [buttonParams, setButtonParams]   = useState('');

  type BodyParamRow = { id: number; value: string; field: 'static' | 'customer_name'; paramName: string };
  const nextRowId = useRef(0);
  const [bodyParamRows, setBodyParamRows] = useState<BodyParamRow[]>([]);
  const addBodyRow    = () => setBodyParamRows(prev => [...prev, { id: nextRowId.current++, value: '', field: 'static', paramName: '' }]);
  const removeBodyRow = (id: number) => setBodyParamRows(prev => prev.filter(r => r.id !== id));
  const updateBodyRow = (id: number, patch: Partial<BodyParamRow>) =>
    setBodyParamRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const loadPreset = (preset: TemplatePreset) => {
    setTemplateName(preset.templateName);
    setLanguageCode(preset.languageCode || 'en');
    setHeaderParams(preset.headerParams || '');
    setButtonParams(preset.buttonParams || '');
    setBodyParamRows(
      preset.bodyParamRows?.length
        ? preset.bodyParamRows.map(r => ({ id: nextRowId.current++, value: r.value, field: r.field as 'static' | 'customer_name', paramName: (r as any).paramName || '' }))
        : []
    );
    // 'upload' method can't be restored (no file) — fall back to 'none'
    setTplImageMethod(preset.tplImageMethod === 'url' ? 'url' : 'none');
    // Reset file/preview first, then set URL so it isn't overwritten
    setTplImageFile(null);
    setTplImagePreview('');
    if (tplFileInputRef.current) tplFileInputRef.current.value = '';
    setTplImageUrl(preset.tplImageMethod === 'url' ? preset.tplImageUrl || '' : '');
  };

  // Image/media fields
  const [imageMethod, setImageMethod]     = useState<MediaMethod>('upload');
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [imagePreview, setImagePreview]   = useState('');
  const [imageUrl, setImageUrl]           = useState('');
  const [caption, setCaption]             = useState('');
  const [pdfFile, setPdfFile]             = useState<File | null>(null);
  const pdfFileInputRef                   = useRef<HTMLInputElement>(null);

  // Template header image (optional)
  const [tplImageMethod, setTplImageMethod] = useState<'none' | ImageInputMethod>('none');
  const [tplImageFile, setTplImageFile]     = useState<File | null>(null);
  const [tplImagePreview, setTplImagePreview] = useState('');
  const [tplImageUrl, setTplImageUrl]       = useState('');
  const tplFileInputRef = useRef<HTMLInputElement>(null);

  // Recipients
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('manual');
  const [manualPhones, setManualPhones]   = useState('');
  const [csvNameMap, setCsvNameMap]       = useState<Map<string, string>>(new Map());
  const [customerSearch, setCustomerSearch] = useState('');
  // null = all selected (implicit); new Set() = none; Set([...ids]) = specific subset
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // CSV column mapper dialog state
  const [csvMapperOpen, setCsvMapperOpen] = useState(false);
  const [csvMapperRows, setCsvMapperRows] = useState<string[][]>([]);
  const [csvMapperHeaders, setCsvMapperHeaders] = useState<string[]>([]);
  const [csvMapperHasHeader, setCsvMapperHasHeader] = useState(false);
  const [csvPhoneCol, setCsvPhoneCol] = useState(0);
  const [csvNameCol, setCsvNameCol] = useState(-1);

  // ── Customer list query ──────────────────────────────────────────────────
  const { data: usersData, isFetching: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['campaign-users', customerSearch],
    queryFn: () => api.getUsers({
      limit: 5000,
      search: customerSearch || undefined,
      sortBy: 'totalOrders',
      sortOrder: 'desc',
    }),
    enabled: recipientFilter !== 'manual',
    staleTime: 30_000,
  });

  // ── Campaign history from API ────────────────────────────────────────────
  const { data: campaigns = [], isFetching: campaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.getCampaigns(50),
    // Poll while any campaign is queued/sending so status updates appear
    refetchInterval: (query) => {
      const data = query.state.data as CampaignRecord[] | undefined;
      const hasActive = data?.some((c) => c.status === 'queued' || c.status === 'sending');
      return hasActive ? 5_000 : false;
    },
  });

  // ── Template presets from DB ─────────────────────────────────────────────
  const { data: presets = [], refetch: refetchPresets } = useQuery({
    queryKey: ['template-presets'],
    queryFn: () => api.getTemplatePresets(),
    staleTime: 60_000,
  });

  const savePresetMutation = useMutation({
    mutationFn: (preset: Omit<TemplatePreset, '_id' | 'updatedAt'>) => api.upsertTemplatePreset(preset),
    onSuccess: () => refetchPresets(),
  });

  const deletePresetMutation = useMutation({
    mutationFn: (id: string) => api.deleteTemplatePreset(id),
    onSuccess: () => refetchPresets(),
  });

  const [clearHistoryConfirm, setClearHistoryConfirm] = useState(false);
  const clearHistoryMutation = useMutation({
    mutationFn: () => api.clearCampaignHistory(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setClearHistoryConfirm(false);
      toast({ title: 'History cleared', description: `${data.deleted} campaign${data.deleted !== 1 ? 's' : ''} deleted.` });
    },
    onError: () => toast({ title: 'Failed to clear history', variant: 'destructive' }),
  });

  const [fetchedTemplate, setFetchedTemplate] = useState<WaTemplate | null>(null);
  const [templateFetching, setTemplateFetching] = useState(false);
  const [templateFetchResult, setTemplateFetchResult] = useState<'idle' | 'found' | 'not_found'>('idle');
  const lastAutoLoadedRef = useRef('');

  // Debounced fetch: when template name changes, fetch real template from WA
  useEffect(() => {
    if (!templateName.trim() || messageType !== 'template') {
      setFetchedTemplate(null);
      setTemplateFetching(false);
      setTemplateFetchResult('idle');
      if (!templateName.trim()) lastAutoLoadedRef.current = '';
      return;
    }
    setTemplateFetching(true);
    setTemplateFetchResult('idle');
    const timer = setTimeout(async () => {
      try {
        const tpl = await api.getWhatsappTemplate(templateName.trim());
        setFetchedTemplate(tpl);
        setTemplateFetchResult(tpl ? 'found' : 'not_found');
      } catch {
        setFetchedTemplate(null);
        setTemplateFetchResult('not_found');
      } finally {
        setTemplateFetching(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [templateName, messageType]);

  // When a template is fetched, auto-sync body row count to match {{N}} placeholders.
  // Preserves existing row values — only adds/trims rows to match the template.
  useEffect(() => {
    if (!fetchedTemplate) return;
    const bodyComp = fetchedTemplate.components.find(c => c.type === 'BODY');
    const varCount = (bodyComp?.text?.match(/\{\{\d+\}\}/g) ?? []).length;
    setBodyParamRows(prev => {
      if (prev.length === varCount) return prev;
      if (varCount === 0) return [];
      if (varCount > prev.length) {
        const extra = Array.from({ length: varCount - prev.length }, () => ({
          id: nextRowId.current++, value: '', field: 'static' as const, paramName: '',
        }));
        return [...prev, ...extra];
      }
      return prev.slice(0, varCount);
    });
  }, [fetchedTemplate]);

  // Auto-load preset when typed template name exactly matches a saved preset.
  useEffect(() => {
    const name = templateName.trim();
    if (!name || lastAutoLoadedRef.current === name) return;
    const match = presets.find(p => p.templateName === name);
    if (match) {
      loadPreset(match);
      lastAutoLoadedRef.current = name;
    }
  }, [templateName, presets]); // eslint-disable-line react-hooks/exhaustive-deps


  const activeBodyRows = useMemo(
    () => bodyParamRows.filter(r => r.field === 'customer_name' || r.value.trim() !== ''),
    [bodyParamRows],
  );

  const customers = useMemo(() => {
    const all = (usersData?.items ?? []).filter((u) => !u.isBlocked);
    if (recipientFilter === 'ordered') return all.filter((u) => u.totalOrders > 0);
    return all;
  }, [usersData, recipientFilter]);

  const customersWithPhone = useMemo(
    () => customers.filter((u: User) => !!u.phone),
    [customers],
  );

  // ── Computed recipients ──────────────────────────────────────────────────
  const finalPhones = useMemo<string[]>(() => {
    if (recipientFilter === 'manual') {
      return parsePhones(manualPhones).valid;
    }
    const fromDb = customersWithPhone
      .filter((u: User) => selectedUserIds === null || selectedUserIds.has(u._id))
      .map((u: User) => normalizeIndianPhone(u.phone))
      .filter((p): p is string => p !== null);
    return Array.from(new Set(fromDb));
  }, [recipientFilter, manualPhones, customersWithPhone, selectedUserIds]);

  const manualParsed = useMemo(() => parsePhones(manualPhones), [manualPhones]);

  // ── Image handling ───────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5 MB', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Not an image', variant: 'destructive' });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview('');
    setImageUrl('');
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (pdfFileInputRef.current) pdfFileInputRef.current.value = '';
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: 'File too large', description: 'Max 10 MB', variant: 'destructive' }); return; }
    if (file.type !== 'application/pdf') { toast({ title: 'Only PDF files allowed', variant: 'destructive' }); return; }
    setPdfFile(file);
  };

  const handleTplFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: 'File too large', description: 'Max 5 MB', variant: 'destructive' }); return; }
    if (!file.type.startsWith('image/')) { toast({ title: 'Not an image', variant: 'destructive' }); return; }
    setTplImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setTplImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearTplImage = () => {
    setTplImageFile(null);
    setTplImagePreview('');
    setTplImageUrl('');
    if (tplFileInputRef.current) tplFileInputRef.current.value = '';
  };

  // ── CSV import ───────────────────────────────────────────────────────────
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (csvFileInputRef.current) csvFileInputRef.current.value = '';
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5 MB', variant: 'destructive' });
      return;
    }
    if (/\.xlsx?$/i.test(file.name)) {
      toast({ title: 'Excel files not supported', description: 'Open the sheet in Excel → File → Save As → CSV (.csv), then upload that file.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast({ title: 'Could not read file', description: 'Try re-exporting the CSV.', variant: 'destructive' });
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== 'string') { toast({ title: 'Could not read file', variant: 'destructive' }); return; }
      // Detect binary (XLSX/ZIP starts with PK magic bytes)
      if (text.startsWith('PK')) {
        toast({ title: 'Excel files not supported', description: 'Save as CSV first, then upload.', variant: 'destructive' });
        return;
      }
      let parsed: ReturnType<typeof parseCsvForMapper>;
      try { parsed = parseCsvForMapper(text); } catch { parsed = null; }
      if (!parsed || !parsed.rows.length) {
        toast({ title: 'Could not parse file', description: 'Check that the file is a valid CSV.', variant: 'destructive' });
        return;
      }
      setCsvMapperRows(parsed.rows);
      setCsvMapperHeaders(parsed.headers);
      setCsvMapperHasHeader(parsed.hasHeader);
      setCsvPhoneCol(parsed.detectedPhoneCol);
      setCsvNameCol(parsed.detectedNameCol);
      setCsvMapperOpen(true);
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvMapper = () => {
    const { phones, found, nameMap } = extractPhonesFromRowsByIndex(csvMapperRows, csvPhoneCol, csvNameCol, csvMapperHasHeader);
    if (!found) {
      toast({ title: 'No phone numbers found', description: 'Try selecting a different phone column.', variant: 'destructive' });
      return;
    }
    setCsvMapperOpen(false);
    setManualPhones(prev => { const ex = prev.trim(); return ex ? ex + '\n' + phones : phones; });
    if (nameMap.size > 0) {
      setCsvNameMap(prev => { const m = new Map(prev); nameMap.forEach((v, k) => m.set(k, v)); return m; });
    }
    const colLabel = csvMapperHasHeader ? (csvMapperHeaders[csvPhoneCol] ?? `Col ${csvPhoneCol + 1}`) : `Col ${csvPhoneCol + 1}`;
    const nameNote = nameMap.size > 0 ? ` · ${nameMap.size} names` : '';
    toast({ title: `${found} number${found !== 1 ? 's' : ''} imported`, description: `From: ${colLabel}${nameNote}` });
  };

  // ── Send ─────────────────────────────────────────────────────────────────
  const broadcastMutation = useMutation({
    mutationFn: async () => {
      if (finalPhones.length === 0) throw new Error('No valid recipients');

      if (messageType === 'media') {
        if (imageMethod === 'pdf') {
          if (!pdfFile) throw new Error('Please select a PDF file');
          const result = await api.uploadDocument(pdfFile, 'campaigns');
          return api.sendMediaBroadcast(finalPhones, result.secureUrl, caption || undefined, 'document', pdfFile.name);
        }
        let resolvedUrl = imageUrl.trim();
        if (imageMethod === 'upload') {
          if (!imageFile) throw new Error('Please select an image');
          const result = await api.uploadImage(imageFile, 'campaigns');
          resolvedUrl = result.secureUrl;
        } else {
          if (!resolvedUrl) throw new Error('Please enter an image URL');
        }
        return api.sendMediaBroadcast(finalPhones, resolvedUrl, caption || undefined, 'image');
      }

      const template = templateName.trim();
      if (!template) throw new Error('Template name is required');
      let resolvedTplImageUrl: string | undefined;
      if (tplImageMethod === 'upload' && tplImageFile) {
        const result = await api.uploadImage(tplImageFile, 'campaigns');
        resolvedTplImageUrl = result.secureUrl;
      } else if (tplImageMethod === 'url' && tplImageUrl.trim()) {
        resolvedTplImageUrl = tplImageUrl.trim();
      }
      // Rows only exist if explicitly added by the user — send all of them.
      // Empty static rows are still filtered to avoid sending blank params.
      // activeBodyRows is computed via useMemo at the top of the component.
      const hasNameBinding = activeBodyRows.some(r => r.field === 'customer_name');
      let recipients: { phone: string; name: string }[] | undefined;
      if (hasNameBinding) {
        if (recipientFilter !== 'manual') {
          recipients = customersWithPhone
            .filter((u: User) => selectedUserIds === null || selectedUserIds.has(u._id))
            .map((u: User) => ({ phone: normalizeIndianPhone(u.phone), name: u.name || '' }))
            .filter((r): r is { phone: string; name: string } => r.phone !== null);
        } else if (csvNameMap.size > 0) {
          recipients = finalPhones.map(p => ({ phone: p, name: csvNameMap.get(p) || '' }));
        }
      }
      const hasParamNames = activeBodyRows.some(r => r.paramName?.trim());
      return api.sendBroadcast(finalPhones, template, {
        languageCode: languageCode.trim() || 'en',
        headerParams: parseList(headerParams),
        bodyParams: activeBodyRows.map(r => r.value),
        bodyParamNames: hasParamNames ? activeBodyRows.map(r => r.paramName?.trim() || '') : undefined,
        bodyParamFields: hasNameBinding ? activeBodyRows.map(r => r.field) : undefined,
        buttonParams: parseList(buttonParams),
        headerImageUrl: resolvedTplImageUrl,
        recipients,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({ title: 'Campaign queued', description: 'Messages are being sent in the background.' });
      if (messageType === 'template' && templateName.trim()) {
        savePresetMutation.mutate({
          templateName: templateName.trim(),
          languageCode,
          headerParams,
          buttonParams,
          bodyParamRows: activeBodyRows.map(r => ({ value: r.value, field: r.field, paramName: r.paramName || '' })),
          tplImageMethod,
          tplImageUrl,
        });
      }
      // reset form
      setManualPhones('');
      setCsvNameMap(new Map());
      setSelectedUserIds(null);
      if (messageType === 'template') {
        setTemplateName(''); setHeaderParams(''); setBodyParamRows([]); setButtonParams('');
        setTplImageMethod('none'); clearTplImage();
      } else {
        clearImage(); setCaption('');
      }
    },
    onError: (err: unknown) => {
      toast({ title: 'Failed', description: getApiError(err, 'Could not send campaign.'), variant: 'destructive' });
    },
  });

  const tplImageReady =
    tplImageMethod === 'none' ||
    (tplImageMethod === 'upload' ? !!tplImageFile : !!tplImageUrl.trim());

  const mediaReady =
    imageMethod === 'upload' ? !!imageFile :
    imageMethod === 'url'    ? !!imageUrl.trim() :
    /* pdf */                  !!pdfFile;

  const canSend =
    finalPhones.length > 0 &&
    !broadcastMutation.isPending &&
    (messageType === 'template' ? !!templateName.trim() && tplImageReady : mediaReady);

  // ─── Preview helpers ──────────────────────────────────────────────────────

  const resolveBodyText = (text: string) =>
    text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
      const idx = parseInt(n, 10) - 1;
      const row = activeBodyRows[idx];
      if (!row) return `{{${n}}}`;
      return row.field === 'customer_name' ? 'Customer name' : row.value || `{{${n}}}`;
    });

  const templatePreviewContent = () => {
    if (!templateName) return (
      <div className="flex items-center justify-center h-28 text-[10px] text-gray-500">Enter template name to preview</div>
    );
    if (fetchedTemplate) {
      const hdr = fetchedTemplate.components.find(c => c.type === 'HEADER');
      const body = fetchedTemplate.components.find(c => c.type === 'BODY');
      const footer = fetchedTemplate.components.find(c => c.type === 'FOOTER');
      const btns = fetchedTemplate.components.find(c => c.type === 'BUTTONS');
      return (
        <div className="bg-white rounded-lg shadow-sm max-w-[95%] overflow-hidden text-[10px]">
          {hdr?.format === 'IMAGE' && (
            (tplImagePreview || tplImageUrl)
              ? <img src={tplImagePreview || tplImageUrl} alt="Header" className="w-full max-h-24 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <div className="w-full h-16 bg-gray-200 flex items-center justify-center text-gray-400 text-[9px]">Image header</div>
          )}
          {hdr?.format === 'TEXT' && hdr.text && (
            <div className="bg-gray-50 border-b px-2.5 py-1.5 font-semibold text-gray-800 text-[10px]">{hdr.text}</div>
          )}
          {body?.text && (
            <div className="px-2.5 pt-1.5 pb-1 text-gray-700 whitespace-pre-wrap leading-snug text-[10px]">{resolveBodyText(body.text)}</div>
          )}
          {footer?.text && (
            <div className="px-2.5 pb-1 text-[9px] text-gray-400">{footer.text}</div>
          )}
          <div className="flex justify-end px-2 pb-1.5"><span className="text-[9px] text-gray-400">12:00 PM ✓✓</span></div>
          {btns?.buttons && btns.buttons.length > 0 && (
            <div className="border-t">
              {btns.buttons.map((btn, i) => (
                <div key={i} className="border-b last:border-0 px-2.5 py-1 text-center text-[#128c7e] font-medium text-[10px]">{btn.text}</div>
              ))}
            </div>
          )}
        </div>
      );
    }
    // Fallback static preview
    return (
      <div className="bg-white rounded-lg shadow-sm max-w-[95%] overflow-hidden text-[10px]">
        {(tplImagePreview || tplImageUrl) && (
          <img src={tplImagePreview || tplImageUrl} alt="Header" className="w-full max-h-24 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}

        <div className="px-2.5 pt-1.5 pb-1">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Template · {languageCode || 'en'}</p>
          <p className="font-mono text-gray-700 font-medium text-[10px]">{templateName}</p>
          {activeBodyRows.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {activeBodyRows.map((row, i) => (
                <p key={row.id} className="text-gray-600">
                  <span className="text-gray-400 font-mono">{`{{${i + 1}}}`}</span>{' '}
                  {row.field === 'customer_name' ? <span className="text-emerald-600 italic">Customer name</span> : row.value}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-2 pb-1.5"><span className="text-[9px] text-gray-400">12:00 PM ✓✓</span></div>
      </div>
    );
  };

  const mediaPreviewContent = () => {
    if (imageMethod === 'pdf') {
      if (!pdfFile) return <div className="flex items-center justify-center h-28 text-[10px] text-gray-500">Select a PDF to preview</div>;
      return (
        <div className="bg-white rounded-lg shadow-sm max-w-[95%] overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b">
            <div className="w-7 h-7 rounded bg-red-100 flex items-center justify-center shrink-0"><span className="text-red-600 font-bold text-[9px]">PDF</span></div>
            <div className="flex-1 min-w-0"><p className="text-[10px] font-medium truncate">{pdfFile.name}</p></div>
          </div>
          {caption && <p className="text-[10px] text-gray-700 px-2.5 pt-1 whitespace-pre-wrap">{caption}</p>}
          <div className="flex justify-end px-2 pb-1.5"><span className="text-[9px] text-gray-400">12:00 PM ✓✓</span></div>
        </div>
      );
    }
    if (!imagePreview && !imageUrl.trim()) return <div className="flex items-center justify-center h-28 text-[10px] text-gray-500">Add an image to preview</div>;
    return (
      <div className="bg-white rounded-lg shadow-sm max-w-[95%] overflow-hidden">
        <img src={imagePreview || imageUrl} alt="Preview" className="w-full max-h-36 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        {caption && <p className="text-[10px] text-gray-700 px-2.5 pt-1 whitespace-pre-wrap">{caption}</p>}
        <div className="flex justify-end px-2 pb-1.5"><span className="text-[9px] text-gray-400">12:00 PM ✓✓</span></div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <Header title="Campaigns" description="Send WhatsApp messages to your customers" />

      <div className="p-6 space-y-6 max-w-7xl">

        {/* ── Two-column layout ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6">

          {/* ── LEFT: Message composer ──────────────────────────────── */}
          <div className="space-y-5 rounded-xl border bg-card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Message</h2>
            </div>

            {/* Type toggle */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
              {(['template', 'media'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setMessageType(t)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    messageType === t
                      ? 'bg-background shadow text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'template' ? '📋 Template' : '🖼 Image'}
                </button>
              ))}
            </div>

            {/* ── Template fields ───────────────────────────────────── */}
            {messageType === 'template' && (
              <div className="space-y-4">

                {/* Saved presets */}
                {(presets.length > 0 || templateName.trim()) && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Saved configs</label>
                      <button
                        type="button"
                        disabled={!templateName.trim() || savePresetMutation.isPending}
                        onClick={() => savePresetMutation.mutate({
                          templateName: templateName.trim(),
                          languageCode,
                          headerParams,
                          buttonParams,
                          bodyParamRows: activeBodyRows.map(r => ({ value: r.value, field: r.field, paramName: r.paramName || '' })),
                          tplImageMethod,
                          tplImageUrl,
                        })}
                        className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {savePresetMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : '💾'} Save config
                      </button>
                    </div>
                    {presets.length > 0 && <div className="flex flex-wrap gap-2">
                      {presets.map((p) => (
                        <div key={p._id} className="flex items-center gap-1 rounded-full border bg-muted/50 pl-3 pr-1 py-1">
                          <button
                            type="button"
                            onClick={() => loadPreset(p)}
                            className="text-xs font-medium hover:text-primary transition-colors"
                          >
                            {p.templateName}
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (window.confirm(`Delete preset "${p.templateName}"?`)) deletePresetMutation.mutate(p._id); }}
                            className="w-4 h-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>}
                  </div>
                )}

                <div className="grid grid-cols-[1fr_140px] gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Template name</label>
                    <Input
                      placeholder="e.g. promo_offer"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Must match exactly in WhatsApp Manager.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Language</label>
                    <Input
                      placeholder="en"
                      value={languageCode}
                      onChange={(e) => setLanguageCode(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">e.g. en, hi, en_US</p>
                  </div>
                </div>

                {/* Body variables — auto-detected from live template */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Body variables</label>
                    {fetchedTemplate && bodyParamRows.length > 0 && (
                      <span className="text-xs text-muted-foreground">({bodyParamRows.length} detected)</span>
                    )}
                  </div>

                  {bodyParamRows.map((row, i) => (
                    <div key={row.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono w-8 shrink-0 text-center">{`{{${i + 1}}}`}</span>

                        {/* Customer name / Static toggle */}
                        <div className="flex gap-0.5 p-0.5 bg-muted rounded-md shrink-0">
                          <button
                            type="button"
                            onClick={() => updateBodyRow(row.id, { field: 'customer_name', value: '' })}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                              row.field === 'customer_name'
                                ? 'bg-emerald-500 text-white shadow'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            👤 Customer name
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBodyRow(row.id, { field: 'static' })}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                              row.field === 'static'
                                ? 'bg-background text-foreground shadow'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Static
                          </button>
                        </div>

                        {row.field === 'static' ? (
                          <Input
                            className="flex-1 h-8 text-sm"
                            placeholder="Enter value…"
                            value={row.value}
                            onChange={(e) => updateBodyRow(row.id, { value: e.target.value })}
                          />
                        ) : (
                          <span className="flex-1 text-xs text-emerald-600 italic">Will use customer's name from DB</span>
                        )}

                        {!fetchedTemplate && (
                          <button type="button" onClick={() => removeBodyRow(row.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {/* Named variable support — enter the WA variable name e.g. "name" for {{name}} templates */}
                      <div className="flex items-center gap-2 pl-10">
                        <span className="text-[10px] text-muted-foreground shrink-0">Var name</span>
                        <Input
                          className="h-6 text-[10px] w-28"
                          placeholder='e.g. "name" or leave blank'
                          value={row.paramName || ''}
                          onChange={(e) => updateBodyRow(row.id, { paramName: e.target.value })}
                        />
                        <span className="text-[10px] text-muted-foreground">← fill if template uses {'{{name}}'} style</span>
                      </div>
                    </div>
                  ))}

                  {bodyParamRows.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {fetchedTemplate
                        ? 'This template has no body variables.'
                        : templateName.trim()
                          ? 'Waiting for template to load…'
                          : 'Enter a template name above to auto-detect variables.'
                      }
                    </p>
                  )}

                  {/* Manual add — fallback when template not fetched */}
                  {!fetchedTemplate && (
                    <button type="button" onClick={addBodyRow} className="text-xs text-primary hover:underline">
                      + Add variable manually
                    </button>
                  )}

                  {bodyParamRows.some(r => r.field === 'customer_name') && recipientFilter === 'manual' && csvNameMap.size === 0 && (
                    <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      Upload a CSV with a name column, or switch to "All customers" / "Has orders" to use customer name
                    </p>
                  )}
                </div>

                {/* Header image (optional) */}
                <div className="space-y-2 pt-1 border-t">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5" /> Header image
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <div className="flex gap-1 p-0.5 bg-muted rounded-md">
                      {([
                        { value: 'none',   label: 'None' },
                        { value: 'upload', label: 'Upload' },
                        { value: 'url',    label: 'URL' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { setTplImageMethod(opt.value); clearTplImage(); }}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            tplImageMethod === opt.value
                              ? 'bg-background shadow text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {tplImageMethod === 'upload' && (
                    <>
                      {!tplImagePreview ? (
                        <div
                          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-5 flex items-center gap-3 cursor-pointer hover:border-muted-foreground/40 transition-colors"
                          onClick={() => tplFileInputRef.current?.click()}
                        >
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Upload className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Click to upload header image</p>
                            <p className="text-xs text-muted-foreground">PNG, JPG · Max 5 MB</p>
                          </div>
                          <input ref={tplFileInputRef} type="file" accept="image/*" onChange={handleTplFileChange} className="hidden" />
                        </div>
                      ) : (
                        <div className="relative rounded-lg overflow-hidden border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={tplImagePreview} alt="Header" className="w-full max-h-40 object-cover" />
                          <button onClick={clearTplImage} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {tplImageMethod === 'url' && (
                    <div className="space-y-2">
                      <Input
                        placeholder="https://example.com/header-image.jpg"
                        value={tplImageUrl}
                        onChange={(e) => setTplImageUrl(e.target.value)}
                      />
                      {tplImageUrl && (
                        <div className="relative rounded-lg overflow-hidden border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={tplImageUrl}
                            alt="Header preview"
                            className="w-full max-h-40 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Image / media fields ──────────────────────────────── */}
            {messageType === 'media' && (
              <div className="space-y-4">
                {/* Upload method tabs */}
                <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
                  {([
                    { value: 'upload', icon: <Upload className="h-3.5 w-3.5" />, label: 'Upload image' },
                    { value: 'url',    icon: <LinkIcon className="h-3.5 w-3.5" />, label: 'Image URL' },
                    { value: 'pdf',    icon: <span className="text-xs font-bold">PDF</span>, label: 'Document' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setImageMethod(opt.value); clearImage(); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        imageMethod === opt.value
                          ? 'bg-background shadow text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>

                {/* Upload */}
                {imageMethod === 'upload' && (
                  <>
                    {!imagePreview ? (
                      <div
                        className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-muted-foreground/40 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium">Click to upload an image</p>
                          <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, GIF · Max 5 MB</p>
                        </div>
                        <Button type="button" variant="outline" size="sm">
                          <Upload className="mr-2 h-4 w-4" /> Choose Image
                        </Button>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                      </div>
                    ) : (
                      <div className="relative rounded-xl overflow-hidden border">
                        <img src={imagePreview} alt="Preview" className="w-full max-h-56 object-cover" />
                        <button
                          onClick={clearImage}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                          {imageFile?.name}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* URL input */}
                {imageMethod === 'url' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Image URL</label>
                      <Input
                        placeholder="https://example.com/image.jpg"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Must be a publicly accessible URL.</p>
                    </div>
                    {imageUrl && (
                      <div className="relative rounded-xl overflow-hidden border">
                        <img
                          src={imageUrl}
                          alt="Preview"
                          className="w-full max-h-56 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* PDF upload */}
                {imageMethod === 'pdf' && (
                  !pdfFile ? (
                    <div
                      className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-muted-foreground/40 transition-colors"
                      onClick={() => pdfFileInputRef.current?.click()}
                    >
                      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                        <span className="text-red-500 font-bold text-sm">PDF</span>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium">Click to upload a PDF document</p>
                        <p className="text-xs text-muted-foreground mt-0.5">PDF · Max 10 MB</p>
                      </div>
                      <Button type="button" variant="outline" size="sm">
                        <Upload className="mr-2 h-4 w-4" /> Choose PDF
                      </Button>
                      <input ref={pdfFileInputRef} type="file" accept="application/pdf" onChange={handlePdfChange} className="hidden" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-xl border bg-red-50/50">
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                        <span className="text-red-600 font-bold text-xs">PDF</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <button onClick={() => { setPdfFile(null); if (pdfFileInputRef.current) pdfFileInputRef.current.value = ''; }} className="p-1.5 rounded-full hover:bg-red-100 text-red-500 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                )}

                {/* Caption */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Caption <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Textarea
                    rows={2}
                    placeholder="Add a caption for your image..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="resize-none text-sm"
                  />
                </div>
              </div>
            )}

            {/* ── Send button ───────────────────────────────────────── */}
            <div className="flex items-center gap-3 pt-2 border-t">
              <Button onClick={() => { if (window.confirm(`Send this campaign to ${finalPhones.length} recipient${finalPhones.length !== 1 ? 's' : ''}?`)) broadcastMutation.mutate(); }} disabled={!canSend} size="default">
                <Send className="mr-2 h-4 w-4" />
                {broadcastMutation.isPending ? 'Queuing…' : `Send to ${finalPhones.length} recipient${finalPhones.length !== 1 ? 's' : ''}`}
              </Button>
              {finalPhones.length === 0 && (
                <p className="text-xs text-muted-foreground">Add recipients to enable sending.</p>
              )}
              {finalPhones.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  {finalPhones.length} valid number{finalPhones.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Preview + Recipients stacked ──────────────────── */}
          <div className="flex flex-col gap-5">

            {/* Preview card — always visible, no scrolling needed */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Preview</h2>
                {templateFetching && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
                {!templateFetching && templateFetchResult === 'found' && (
                  <Badge className="text-[10px] ml-auto bg-emerald-100 text-emerald-700 border-emerald-200">Live template</Badge>
                )}
                {!templateFetching && templateFetchResult === 'not_found' && (
                  <span className="text-[10px] text-red-400 ml-auto">Not found in WA</span>
                )}
                {!templateFetching && templateFetchResult === 'idle' && templateName && messageType === 'template' && (
                  <span className="text-[10px] text-muted-foreground ml-auto">Fetching…</span>
                )}
              </div>
              <div className="flex justify-center">
                <div className="w-64 rounded-[1.5rem] border-[5px] border-gray-800 shadow-xl overflow-hidden bg-gray-800">
                  <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-300 flex items-center justify-center text-[#075e54] font-bold text-xs shrink-0">NL</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-tight">NatureLite</p>
                      <p className="text-[9px] opacity-75">Business Account</p>
                    </div>
                    <Phone className="h-3.5 w-3.5 opacity-75" />
                  </div>
                  <div className="min-h-[200px] p-2.5 flex flex-col justify-end gap-2" style={{ background: '#e5ddd5' }}>
                    {messageType === 'template' ? templatePreviewContent() : mediaPreviewContent()}
                  </div>
                  <div className="bg-[#f0f0f0] px-2.5 py-1.5 flex items-center gap-2 border-t">
                    <div className="flex-1 bg-white rounded-full px-2.5 py-1 text-[9px] text-gray-400">Message</div>
                    <div className="w-6 h-6 rounded-full bg-[#128c7e] flex items-center justify-center shrink-0">
                      <Send className="h-2.5 w-2.5 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recipients card */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-semibold text-base">Recipients</h2>
                </div>
                <Badge variant="outline" className="text-xs">
                  {finalPhones.length} selected
                </Badge>
              </div>

              {/* Source tabs */}
              <div className="flex gap-1 p-1 bg-muted rounded-lg mb-4">
                {([
                  { value: 'manual',  label: 'Manual' },
                  { value: 'all',     label: 'All customers' },
                  { value: 'ordered', label: 'Has orders' },
                ] as const).map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => { setRecipientFilter(tab.value); setSelectedUserIds(null); }}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                      recipientFilter === tab.value
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Manual input ─────────────────────────────────────── */}
              {recipientFilter === 'manual' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> Phone numbers
                    </label>
                    <button
                      type="button"
                      onClick={() => csvFileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Upload CSV
                    </button>
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv,.tsv,.txt,.xlsx,.xls"
                      onChange={handleCsvUpload}
                      className="hidden"
                    />
                  </div>
                  <Textarea
                    className="min-h-[180px] text-sm font-mono resize-none"
                    placeholder={"One per line or comma-separated\n919876543210\n919876543211\n\nOr upload a CSV with phone + name columns"}
                    value={manualPhones}
                    onChange={(e) => setManualPhones(e.target.value)}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Include country code (91…) · CSV with phone + name column also works</span>
                    <div className="flex gap-2">
                      {csvNameMap.size > 0 && (
                        <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200">{csvNameMap.size} names</Badge>
                      )}
                      {manualParsed.invalid > 0 && (
                        <Badge variant="secondary">{manualParsed.invalid} invalid</Badge>
                      )}
                      <Badge variant="outline">{manualParsed.valid.length} valid</Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Customer list ─────────────────────────────────────── */}
              {recipientFilter !== 'manual' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-9 h-8 text-sm"
                      placeholder="Search by name or phone…"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{customersWithPhone.length} customers with phone</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const isAll = selectedUserIds === null || selectedUserIds.size === customersWithPhone.length;
                          setSelectedUserIds(isAll ? new Set() : null);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        {selectedUserIds === null || selectedUserIds.size === customersWithPhone.length ? 'Deselect all' : 'Select all'}
                      </button>
                      <button onClick={() => refetchUsers()} className="hover:text-foreground transition-colors">
                        <RefreshCw className={`h-3 w-3 ${usersLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
                    {usersLoading && (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        Loading customers…
                      </div>
                    )}
                    {!usersLoading && customersWithPhone.length === 0 && (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        No customers found
                      </div>
                    )}
                    {customersWithPhone.map((user: User) => {
                      const checked = selectedUserIds === null || selectedUserIds.has(user._id);
                      return (
                        <label
                          key={user._id}
                          className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                            checked ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-primary"
                            checked={checked}
                            onChange={() => {
                              const base = selectedUserIds === null
                                ? new Set(customersWithPhone.map((u: User) => u._id))
                                : new Set(selectedUserIds);
                              if (checked) {
                                base.delete(user._id);
                              } else {
                                base.add(user._id);
                              }
                              // If all are now checked, collapse back to null (all-implicit)
                              setSelectedUserIds(base.size === customersWithPhone.length ? null : base);
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{user.name || 'Unknown'}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{user.phone}</p>
                          </div>
                          {user.totalOrders > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                              {user.totalOrders} orders
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  {selectedUserIds !== null && selectedUserIds.size > 0 && selectedUserIds.size < customersWithPhone.length && (
                    <p className="text-xs text-muted-foreground text-center">
                      {selectedUserIds.size} of {customersWithPhone.length} selected
                    </p>
                  )}
                  {selectedUserIds !== null && selectedUserIds.size === 0 && (
                    <p className="text-xs text-amber-500 text-center">No recipients selected</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Campaign History (from DB) ─────────────────────────────────── */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">Campaign History</h2>
            <div className="flex items-center gap-2">
              {campaignsLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {campaigns.length > 0 && (
                clearHistoryConfirm ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Sure?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs px-2"
                      disabled={clearHistoryMutation.isPending}
                      onClick={() => clearHistoryMutation.mutate()}
                    >
                      {clearHistoryMutation.isPending ? 'Clearing…' : 'Yes, clear'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setClearHistoryConfirm(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive px-2" onClick={() => setClearHistoryConfirm(true)}>
                    Clear history
                  </Button>
                )
              )}
            </div>
          </div>

          {campaigns.length === 0 && !campaignsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">No campaigns sent yet.</p>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div key={c._id} className="rounded-lg bg-muted/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{c.label}</p>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtTime(c.createdAt)} · {c.totalPhones} target{c.totalPhones !== 1 ? 's' : ''}
                        {c.type === 'template' ? ' · template' : ' · image'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.status === 'queued' && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> Waiting
                        </div>
                      )}
                      {c.status === 'sending' && (
                        <p className="text-xs text-muted-foreground">{c.sent + c.skipped} / {c.totalPhones}</p>
                      )}
                      {(c.status === 'done' || c.status === 'failed') && (
                        <>
                          <Badge variant="default" className="text-xs">{c.sent} sent</Badge>
                          {c.skipped > 0 && (
                            <Badge variant="secondary" className="text-xs flex items-center gap-1">
                              <AlertCircle className="h-2.5 w-2.5" />{c.skipped} skipped
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {(c.errorSummary || c.status === 'failed') && (
                    <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      {c.errorSummary ?? 'Campaign processor crashed — check server logs for details'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>

    {/* ── CSV Column Mapper Dialog ─────────────────────────────────────────── */}
    <Dialog open={csvMapperOpen} onOpenChange={setCsvMapperOpen}>
      <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns className="h-5 w-5 text-primary" /> Map CSV Columns
          </DialogTitle>
          <DialogDescription>
            Select which column contains phone numbers and (optionally) customer names.
            Auto-detection has pre-selected the best match.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {/* Column selectors */}
          <div className="space-y-4">
            <div className="border rounded-xl p-4 bg-primary/[0.02] space-y-3">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">Phone Column <span className="text-red-500">*</span></h3>
              <select
                value={csvPhoneCol}
                onChange={e => {
                  const v = Number(e.target.value);
                  setCsvPhoneCol(v);
                  if (csvNameCol === v) setCsvNameCol(-1);
                }}
                className="w-full text-sm border rounded-lg h-9 px-2 bg-background outline-none focus:ring-2 focus:ring-primary/30"
              >
                {(csvMapperHasHeader ? csvMapperHeaders : csvMapperHeaders.map((_, i) => `Column ${i + 1}`)).map((h, i) => (
                  <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                ))}
              </select>
            </div>

            <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name Column <span className="text-muted-foreground">(optional)</span></h3>
              <select
                value={csvNameCol}
                onChange={e => setCsvNameCol(Number(e.target.value))}
                className="w-full text-sm border rounded-lg h-9 px-2 bg-background outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value={-1}>— Don't import names —</option>
                {(csvMapperHasHeader ? csvMapperHeaders : csvMapperHeaders.map((_, i) => `Column ${i + 1}`)).map((h, i) => (
                  i !== csvPhoneCol ? <option key={i} value={i}>{h || `Column ${i + 1}`}</option> : null
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Used to resolve {`{{customer_name}}`} in templates.</p>
            </div>
          </div>

          {/* Live preview */}
          <div className="border rounded-xl p-4 bg-primary/[0.01] flex flex-col">
            <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-primary border-b pb-2">
              <Grid className="h-4 w-4" /> Preview (first 3 rows)
            </h3>
            <div className="space-y-2 overflow-y-auto flex-1">
              {(csvMapperHasHeader ? csvMapperRows.slice(1, 4) : csvMapperRows.slice(0, 3)).map((row, idx) => {
                const phone = (row[csvPhoneCol] ?? '').trim();
                const name  = csvNameCol >= 0 ? (row[csvNameCol] ?? '').trim() : '';
                return (
                  <div key={idx} className="bg-background border rounded-lg p-2.5 font-mono text-xs space-y-1 shadow-sm">
                    <div className="text-[10px] font-sans font-bold text-primary border-b pb-1">ROW #{idx + 1}</div>
                    <div><span className="font-sans text-muted-foreground">phone:</span> <span className={phone ? 'text-foreground' : 'text-red-400 italic'}>{phone || '(empty)'}</span></div>
                    {csvNameCol >= 0 && <div><span className="font-sans text-muted-foreground">name:</span> <span className={name ? 'text-foreground' : 'text-muted-foreground italic'}>{name || '(empty)'}</span></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-3 mt-2 flex items-center sm:justify-between w-full flex-wrap gap-2">
          <p className="text-xs text-muted-foreground">
            {csvMapperRows.length - (csvMapperHasHeader ? 1 : 0)} data rows · {csvMapperHeaders.length} column{csvMapperHeaders.length !== 1 ? 's' : ''} detected
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => setCsvMapperOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleConfirmCsvMapper}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Import Numbers
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
