'use client';

import { useMemo, useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2, Megaphone, Phone, Send, Users, Image as ImageIcon,
  Upload, X, Search, ChevronDown, Link as LinkIcon, RefreshCw,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { User } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BroadcastResult {
  queued: number;
  skipped: number;
  sentAt: string;
  label: string;
  targetCount: number;
}

type MessageType = 'template' | 'media';
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  // Message type
  const [messageType, setMessageType]     = useState<MessageType>('template');

  // Template fields
  const [templateName, setTemplateName]   = useState('');
  const [languageCode, setLanguageCode]   = useState('en');
  const [headerParams, setHeaderParams]   = useState('');
  const [bodyParams, setBodyParams]       = useState('');
  const [buttonParams, setButtonParams]   = useState('');

  // Image fields
  const [imageMethod, setImageMethod]     = useState<ImageInputMethod>('upload');
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [imagePreview, setImagePreview]   = useState('');
  const [imageUrl, setImageUrl]           = useState('');
  const [caption, setCaption]             = useState('');

  // Recipients
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('manual');
  const [manualPhones, setManualPhones]   = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // History
  const [history, setHistory]             = useState<BroadcastResult[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // ── Customer list query ──────────────────────────────────────────────────
  const { data: usersData, isFetching: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['campaign-users', customerSearch, recipientFilter],
    queryFn: () => api.getUsers({
      limit: 200,
      search: customerSearch || undefined,
      isActive: true,
      isBlocked: false,
      sortBy: 'totalOrders',
      sortOrder: 'desc',
    }),
    enabled: recipientFilter !== 'manual',
    staleTime: 30_000,
  });

  const customers = useMemo(() => {
    const all = usersData?.items ?? [];
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
      .filter((u: User) => selectedUserIds.size === 0 || selectedUserIds.has(u._id))
      .map((u: User) => u.phone.replace(/[^\d]/g, ''))
      .filter((p) => p.length >= 10);
    return [...new Set(fromDb)];
  }, [recipientFilter, manualPhones, customersWithPhone, selectedUserIds]);

  const manualParsed = useMemo(
    () => parsePhones(manualPhones),
    [manualPhones],
  );

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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resolvedPreview = imageMethod === 'upload' ? imagePreview : imageUrl;

  // ── Send ─────────────────────────────────────────────────────────────────
  const broadcastMutation = useMutation({
    mutationFn: async () => {
      if (finalPhones.length === 0) throw new Error('No valid recipients');

      if (messageType === 'media') {
        let resolvedUrl = imageUrl.trim();
        if (imageMethod === 'upload') {
          if (!imageFile) throw new Error('Please select an image');
          const result = await api.uploadImage(imageFile, 'campaigns');
          resolvedUrl = result.url;
        } else {
          if (!resolvedUrl) throw new Error('Please enter an image URL');
        }
        return api.sendMediaBroadcast(finalPhones, resolvedUrl, caption || undefined, { caption: caption || undefined });
      }

      const template = templateName.trim();
      if (!template) throw new Error('Template name is required');
      return api.sendBroadcast(finalPhones, template, parseList(bodyParams), {
        languageCode: languageCode.trim() || 'en',
        headerParams: parseList(headerParams),
        bodyParams: parseList(bodyParams),
        buttonParams: parseList(buttonParams),
      });
    },
    onSuccess: (data) => {
      setHistory((prev) => [{
        ...data,
        sentAt: new Date().toISOString(),
        label: messageType === 'template' ? templateName.trim() : '🖼 Image Message',
        targetCount: finalPhones.length,
      }, ...prev]);
      toast({ title: 'Campaign sent', description: `${data.queued} queued · ${data.skipped} skipped` });
      // reset
      setManualPhones('');
      setSelectedUserIds(new Set());
      if (messageType === 'template') {
        setTemplateName(''); setHeaderParams(''); setBodyParams(''); setButtonParams('');
      } else {
        clearImage(); setCaption('');
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    },
  });

  const canSend =
    finalPhones.length > 0 &&
    !broadcastMutation.isPending &&
    (messageType === 'template'
      ? !!templateName.trim()
      : imageMethod === 'upload' ? !!imageFile : !!imageUrl.trim());

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
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Header values', value: headerParams, set: setHeaderParams, placeholder: 'One per line' },
                    { label: 'Body values',   value: bodyParams,   set: setBodyParams,   placeholder: 'Customer name\nOffer amount' },
                    { label: 'Button values', value: buttonParams, set: setButtonParams, placeholder: 'Dynamic URL or coupon' },
                  ].map(({ label, value, set, placeholder }) => (
                    <div key={label} className="space-y-1.5">
                      <label className="text-sm font-medium">{label}</label>
                      <Textarea
                        rows={3}
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="resize-none text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Image / media fields ──────────────────────────────── */}
            {messageType === 'media' && (
              <div className="space-y-4">
                {/* Upload method tabs */}
                <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
                  <button
                    onClick={() => { setImageMethod('upload'); clearImage(); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      imageMethod === 'upload'
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload file
                  </button>
                  <button
                    onClick={() => { setImageMethod('url'); clearImage(); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      imageMethod === 'url'
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <LinkIcon className="h-3.5 w-3.5" /> Image URL
                  </button>
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
              <Button onClick={() => broadcastMutation.mutate()} disabled={!canSend} size="default">
                <Send className="mr-2 h-4 w-4" />
                {broadcastMutation.isPending ? 'Sending…' : `Send to ${finalPhones.length} recipient${finalPhones.length !== 1 ? 's' : ''}`}
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
                  onClick={() => { setRecipientFilter(tab.value); setSelectedUserIds(new Set()); }}
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
                        if (selectedUserIds.size === customersWithPhone.length) {
                          setSelectedUserIds(new Set());
                        } else {
                          setSelectedUserIds(new Set(customersWithPhone.map((u: User) => u._id)));
                        }
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      {selectedUserIds.size === customersWithPhone.length ? 'Deselect all' : 'Select all'}
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
                    const checked = selectedUserIds.size === 0
                      ? true
                      : selectedUserIds.has(user._id);
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
                            const next = new Set(
                              selectedUserIds.size === 0
                                ? customersWithPhone.map((u: User) => u._id)
                                : selectedUserIds,
                            );
                            if (checked && selectedUserIds.size > 0) {
                              next.delete(user._id);
                            } else {
                              next.add(user._id);
                            }
                            setSelectedUserIds(next);
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

                {selectedUserIds.size > 0 && selectedUserIds.size < customersWithPhone.length && (
                  <p className="text-xs text-muted-foreground text-center">
                    {selectedUserIds.size} of {customersWithPhone.length} selected
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── History ──────────────────────────────────────────────────── */}
        {history.length > 0 && (
          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-semibold text-base mb-4">Campaign History <span className="text-muted-foreground font-normal text-sm">(this session)</span></h2>
            <div className="space-y-2">
              {history.map((entry, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{entry.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtTime(entry.sentAt)} · {entry.targetCount} target{entry.targetCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="default" className="text-xs">{entry.queued} queued</Badge>
                    {entry.skipped > 0 && (
                      <Badge variant="secondary" className="text-xs">{entry.skipped} skipped</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
