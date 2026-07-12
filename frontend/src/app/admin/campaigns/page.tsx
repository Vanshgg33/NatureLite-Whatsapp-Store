'use client';

import { useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Megaphone, Phone, Send, Users, Image as ImageIcon,
  Upload, X, Search, LinkIcon, RefreshCw, Clock, AlertCircle, Smartphone,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { useToast } from '@/components/ui/use-toast';
import { User, CampaignRecord, TemplatePreset } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageType = 'template' | 'media';
type MediaMethod = 'upload' | 'url' | 'pdf';
type ImageInputMethod = 'upload' | 'url';
type RecipientFilter = 'all' | 'ordered' | 'manual';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseList = (value: string) =>
  value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

const parsePhones = (value: string) => {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalid = 0;
  for (const raw of parseList(value)) {
    const phone = raw.replace(/[^\d]/g, '');
    if (phone.length < 10) { invalid++; continue; }
    if (!seen.has(phone)) { seen.add(phone); valid.push(phone); }
  }
  return { valid, invalid };
};

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

  type BodyParamRow = { id: number; value: string; field: 'static' | 'customer_name' };
  const nextRowId = useRef(1);
  const [bodyParamRows, setBodyParamRows] = useState<BodyParamRow[]>([{ id: 0, value: '', field: 'static' }]);
  const addBodyRow    = () => setBodyParamRows(prev => [...prev, { id: nextRowId.current++, value: '', field: 'static' }]);
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
        ? preset.bodyParamRows.map(r => ({ id: nextRowId.current++, value: r.value, field: r.field as 'static' | 'customer_name' }))
        : [{ id: nextRowId.current++, value: '', field: 'static' }]
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
  const [customerSearch, setCustomerSearch] = useState('');
  // null = all selected (implicit); new Set() = none; Set([...ids]) = specific subset
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Customer list query ──────────────────────────────────────────────────
  const { data: usersData, isFetching: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['campaign-users', customerSearch],
    queryFn: () => api.getUsers({
      limit: 200,
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
      .map((u: User) => u.phone.replace(/[^\d]/g, ''))
      .filter((p) => p.length >= 10);
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
      const hasNameBinding = bodyParamRows.some(r => r.field === 'customer_name');
      const recipients = hasNameBinding && recipientFilter !== 'manual'
        ? customersWithPhone
            .filter((u: User) => selectedUserIds === null || selectedUserIds.has(u._id))
            .map((u: User) => ({ phone: u.phone.replace(/[^\d]/g, ''), name: u.name || '' }))
            .filter(r => r.phone.length >= 10)
        : undefined;
      return api.sendBroadcast(finalPhones, template, {
        languageCode: languageCode.trim() || 'en',
        headerParams: parseList(headerParams),
        bodyParams: bodyParamRows.map(r => r.value),
        bodyParamFields: hasNameBinding ? bodyParamRows.map(r => r.field) : undefined,
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
          bodyParamRows,
          tplImageMethod,
          tplImageUrl,
        });
      }
      // reset form
      setManualPhones('');
      setSelectedUserIds(null);
      if (messageType === 'template') {
        setTemplateName(''); setHeaderParams(''); setBodyParamRows([{ id: nextRowId.current++, value: '', field: 'static' }]); setButtonParams('');
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <Header title="Campaigns" description="Send WhatsApp messages to your customers" />

      <div className="p-6 space-y-6 max-w-7xl">

        {/* ── Two-column layout ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">

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
                {presets.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Saved configs</label>
                    <div className="flex flex-wrap gap-2">
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
                    </div>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Header values</label>
                    <Textarea rows={3} placeholder="One per line" value={headerParams} onChange={(e) => setHeaderParams(e.target.value)} className="resize-none text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Button values</label>
                    <Textarea rows={3} placeholder="Dynamic URL or coupon" value={buttonParams} onChange={(e) => setButtonParams(e.target.value)} className="resize-none text-sm" />
                  </div>
                </div>

                {/* Body param rows — per-slot with optional customer name binding */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Body values</label>
                  {bodyParamRows.map((row, i) => (
                    <div key={row.id} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono w-8 shrink-0 text-center">{`{{${i + 1}}}`}</span>
                      <Input
                        className="flex-1 h-8 text-sm"
                        placeholder={row.field === 'customer_name' ? "Will use customer's name from DB" : 'Enter static value…'}
                        value={row.field === 'customer_name' ? '' : row.value}
                        disabled={row.field === 'customer_name'}
                        onChange={(e) => updateBodyRow(row.id, { value: e.target.value })}
                      />
                      <button
                        type="button"
                        title={row.field === 'customer_name' ? 'Remove name binding' : 'Bind to customer name'}
                        onClick={() => updateBodyRow(row.id, { field: row.field === 'customer_name' ? 'static' : 'customer_name', value: '' })}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
                          row.field === 'customer_name'
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-background text-muted-foreground border-input hover:text-foreground'
                        }`}
                      >
                        👤 Name
                      </button>
                      {bodyParamRows.length > 1 && (
                        <button type="button" onClick={() => removeBodyRow(row.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addBodyRow} className="text-xs text-primary hover:underline">
                    + Add variable
                  </button>
                  {bodyParamRows.some(r => r.field === 'customer_name') && recipientFilter === 'manual' && (
                    <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      Switch to "All customers" or "Has orders" tab to use customer name binding
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

          {/* ── RIGHT: Recipients ────────────────────────────────────── */}
          <div className="space-y-5 rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold text-base">Recipients</h2>
              </div>
              <Badge variant="outline" className="text-xs">
                {finalPhones.length} selected
              </Badge>
            </div>

            {/* Source tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
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
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Phone numbers
                </label>
                <Textarea
                  className="min-h-[180px] text-sm font-mono resize-none"
                  placeholder={"One per line or comma-separated\n919876543210\n919876543211"}
                  value={manualPhones}
                  onChange={(e) => setManualPhones(e.target.value)}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Include country code (91…)</span>
                  <div className="flex gap-2">
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

        {/* ── WhatsApp Preview ──────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold text-base">Preview</h2>
            <span className="text-xs text-muted-foreground">— how recipients will see your message</span>
          </div>

          <div className="flex justify-center">
            {/* Phone shell */}
            <div className="w-72 rounded-[2rem] border-[6px] border-gray-800 shadow-2xl overflow-hidden bg-gray-800">

              {/* Status bar */}
              <div className="bg-gray-800 px-5 py-1 flex justify-between items-center">
                <span className="text-white text-[10px] font-medium">9:41</span>
                <div className="flex gap-1 items-center">
                  <div className="w-3 h-1.5 border border-white rounded-[2px] relative"><div className="absolute inset-[1px] bg-white rounded-[1px] w-2/3" /></div>
                  <svg className="w-3 h-3 text-white fill-white" viewBox="0 0 24 24"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 5a10.94 10.94 0 00-1.91 1.49M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>
                </div>
              </div>

              {/* WA header bar */}
              <div className="bg-[#075e54] text-white px-3 py-2.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-300 flex items-center justify-center text-[#075e54] font-bold text-sm shrink-0">NL</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">NatureLite</p>
                  <p className="text-[10px] opacity-75">Business Account</p>
                </div>
                <Phone className="h-4 w-4 opacity-75" />
              </div>

              {/* Chat background */}
              <div
                className="min-h-[320px] p-3 flex flex-col justify-end gap-2"
                style={{ background: '#e5ddd5' }}
              >
                {/* ── Template preview ── */}
                {messageType === 'template' && (
                  <>
                    {!templateName ? (
                      <div className="flex items-center justify-center h-48 text-xs text-gray-500">
                        Fill in template details to preview
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg shadow-sm max-w-[90%] overflow-hidden text-[11px]">
                        {/* Header image */}
                        {(tplImagePreview || tplImageUrl) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={tplImagePreview || tplImageUrl}
                            alt="Header"
                            className="w-full max-h-32 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        {/* Header text params (only if no image) */}
                        {!tplImagePreview && !tplImageUrl && headerParams.trim() && (
                          <div className="bg-gray-50 border-b px-3 py-2">
                            {parseList(headerParams).map((p, i) => (
                              <p key={i} className="font-semibold text-gray-800 leading-snug">{p}</p>
                            ))}
                          </div>
                        )}
                        {/* Body */}
                        <div className="px-3 pt-2 pb-1 space-y-1">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Template · {languageCode || 'en'}</p>
                          <p className="font-mono text-gray-700 font-medium">{templateName}</p>
                          {bodyParamRows.some(r => r.value || r.field === 'customer_name') && (
                            <div className="mt-1.5 space-y-0.5">
                              {bodyParamRows.map((row, i) => (
                                <p key={i} className="text-gray-600">
                                  <span className="text-gray-400 font-mono">{`{{${i + 1}}}`}</span>{' '}
                                  {row.field === 'customer_name'
                                    ? <span className="text-emerald-600 italic">Customer name</span>
                                    : row.value || <span className="text-gray-300">…</span>}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Buttons */}
                        {buttonParams.trim() && (
                          <div className="border-t mt-1">
                            {parseList(buttonParams).map((btn, i) => (
                              <div key={i} className="border-b last:border-0 px-3 py-1.5 text-center text-[#128c7e] font-medium text-[11px]">
                                {btn}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Timestamp */}
                        <div className="flex justify-end px-2 pb-1.5">
                          <span className="text-[10px] text-gray-400">12:00 PM ✓✓</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── Image / media preview ── */}
                {messageType === 'media' && (
                  <>
                    {imageMethod === 'pdf' ? (
                      pdfFile ? (
                        <div className="bg-white rounded-lg shadow-sm max-w-[90%] overflow-hidden">
                          <div className="flex items-center gap-3 px-3 py-3 border-b">
                            <div className="w-9 h-9 rounded bg-red-100 flex items-center justify-center shrink-0">
                              <span className="text-red-600 font-bold text-[10px]">PDF</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium truncate">{pdfFile.name}</p>
                              <p className="text-[10px] text-gray-400">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB · PDF</p>
                            </div>
                          </div>
                          {caption && <p className="text-[11px] text-gray-700 px-3 pt-1.5 whitespace-pre-wrap">{caption}</p>}
                          <div className="flex justify-end px-3 pb-1.5 pt-1">
                            <span className="text-[10px] text-gray-400">12:00 PM ✓✓</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-48 text-xs text-gray-500">
                          Select a PDF to preview
                        </div>
                      )
                    ) : !imagePreview && !imageUrl.trim() ? (
                      <div className="flex items-center justify-center h-48 text-xs text-gray-500">
                        Add an image to preview
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg shadow-sm max-w-[90%] overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imagePreview || imageUrl}
                          alt="Campaign preview"
                          className="w-full max-h-48 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="px-3 pt-1.5 pb-1.5">
                          {caption && <p className="text-[11px] text-gray-700 mb-0.5 whitespace-pre-wrap">{caption}</p>}
                          <div className="flex justify-end">
                            <span className="text-[10px] text-gray-400">12:00 PM ✓✓</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* WA input bar */}
              <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-2 border-t">
                <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-[10px] text-gray-400">Message</div>
                <div className="w-7 h-7 rounded-full bg-[#128c7e] flex items-center justify-center shrink-0">
                  <Send className="h-3 w-3 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Campaign History (from DB) ─────────────────────────────────── */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">Campaign History</h2>
            {campaignsLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
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
                  {c.errorSummary && (
                    <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      {c.errorSummary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
