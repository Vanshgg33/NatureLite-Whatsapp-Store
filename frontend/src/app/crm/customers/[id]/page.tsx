'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  Phone, MessageCircle, ChevronLeft, ShoppingBag,
  PhoneCall, StickyNote, Send, Trash2, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { formatINR, segmentLabel, formatPhone } from '@/lib/crm/format';
import { CustomerAvatar } from '@/components/crm/CustomerAvatar';
import { Pill } from '@/components/crm/Pill';
import { CALL_OUTCOMES } from '@/components/crm/LogCallPanel';
import type { PillVariant } from '@/components/crm/Pill';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | Date | null) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
}

function segPillVariant(segment: string): PillVariant {
  const s = (segment ?? '').toLowerCase().replace(/\s/g, '_');
  if (s === 'overdue') return 'overdue';
  if (s === 'due_soon') return 'upcoming';
  if (s === 'due_today') return 'dueToday';
  if (s === 'at_risk') return 'warn';
  if (s === 'active' || s === 'new') return 'success';
  return 'neutral';
}

const OUTCOME_STYLE: Record<string, { bg: string; color: string }> = {
  connected:      { bg: 'var(--crm-blue-bg)',    color: 'var(--crm-blue)' },
  ordered:        { bg: 'var(--crm-success-bg)', color: 'var(--crm-success)' },
  no_answer:      { bg: 'var(--crm-sand-2)',      color: 'var(--crm-muted)' },
  not_interested: { bg: 'var(--crm-danger-bg)',   color: 'var(--crm-danger)' },
  callback:       { bg: 'var(--crm-amber-bg)',    color: 'var(--crm-amber)' },
};

// ─── Next Best Action ─────────────────────────────────────────────────────────

type NBA = { title: string; body: string; cta: string; ctaAction: 'call' | 'wa' | 'log' | null; color: string };

function getNextBestAction(stats: any, phone?: string): NBA {
  const seg = (stats?.segment ?? '').toLowerCase().replace(/\s/g, '_');
  const lastOutcome = stats?.lastCallOutcome;

  if (lastOutcome === 'callback' && stats?.callbackAt) {
    return { title: 'Scheduled Callback', body: `Callback due ${fmtDate(stats.callbackAt)}`, cta: 'Call now', ctaAction: 'call', color: 'var(--crm-amber)' };
  }
  if (seg === 'overdue') {
    const days = stats?.predictedReorderDate
      ? Math.round((Date.now() - new Date(stats.predictedReorderDate).getTime()) / 86_400_000) : 0;
    return { title: 'Call Now', body: `${days}d past expected reorder`, cta: 'Log call', ctaAction: 'log', color: 'var(--crm-danger)' };
  }
  if (seg === 'due_today') {
    return { title: 'Due Today', body: 'Predicted reorder date is today', cta: 'Log call', ctaAction: 'log', color: 'var(--crm-amber)' };
  }
  if (seg === 'at_risk') {
    return { title: 'Re-Engage', body: 'At risk of churn — WA win-back recommended', cta: 'Send WA', ctaAction: 'wa', color: '#C05621' };
  }
  if (seg === 'dormant') {
    return { title: 'Win-Back', body: 'No orders in 90+ days', cta: 'Send WA', ctaAction: 'wa', color: 'var(--crm-muted)' };
  }
  if (seg === 'new') {
    return { title: 'Welcome Call', body: 'New customer — introduce your store', cta: 'Log call', ctaAction: 'log', color: 'var(--crm-blue)' };
  }
  if (seg === 'due_soon') {
    return { title: 'Due Soon', body: 'Predicted reorder in the next few days', cta: 'Call ahead', ctaAction: 'call', color: 'var(--crm-blue)' };
  }
  if (seg === 'active') {
    return { title: 'All Good', body: 'Customer is active — no action needed', cta: '', ctaAction: null, color: 'var(--crm-success)' };
  }
  return { title: 'Review', body: 'Check history and decide next step', cta: 'Log call', ctaAction: 'log', color: 'var(--crm-muted)' };
}

const WA_TEMPLATES = [
  { key: 'repurchase', label: 'Repurchase' },
  { key: 'winback',    label: 'Win-Back' },
  { key: 'vip',        label: 'VIP Check-in' },
  { key: 'custom',     label: 'Custom' },
];

function buildTemplate(key: string, user: any, stats: any): string {
  const name = user?.name ?? 'there';
  const product = stats?.topProduct || stats?.topCategory || 'your usual products';
  const cycle = stats?.personalCycle ?? 30;
  const days = stats?.predictedReorderDate
    ? Math.max(0, Math.round((Date.now() - new Date(stats.predictedReorderDate).getTime()) / 86_400_000)) : null;
  switch (key) {
    case 'repurchase': return `Hi ${name}! 👋\n\nYour ${product} is likely running low — you usually reorder every ${cycle} days.\n\nWant to place your order? Reply here or visit our store. 🌿`;
    case 'winback':    return `Hi ${name}! 😊\n\nWe noticed it's been a while since your last order${days ? ` (${days} days)` : ''}. We miss you!\n\nWould love to have you back — anything we can help with? 🌿`;
    case 'vip':        return `Hi ${name}! 🌟\n\nAs one of our valued customers, we just wanted to check in. Is there anything you need — ${product} or anything else from our range?\n\nWe're always here for you. 🌿`;
    default:           return '';
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Customer360Page() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab]       = useState<'timeline' | 'orders'>('timeline');
  const [activePanel, setActivePanel]   = useState<'call' | 'note' | 'wa'>('call');
  const [callOutcome, setCallOutcome]   = useState('');
  const [callNotes, setCallNotes]       = useState('');
  const [callbackAt, setCallbackAt]     = useState('');
  const [waTemplate, setWaTemplate]     = useState('');
  const [waMessage, setWaMessage]       = useState('');
  const [noteText, setNoteText]         = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-customer360', id],
    queryFn: () => api.getCrmCustomer360(id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm-customer360', id] });

  const { mutate: logCall, isPending: loggingCall } = useMutation({
    mutationFn: () => api.logCrmCall({ customerId: id, outcome: callOutcome, notes: callNotes, callbackAt: callbackAt || undefined }),
    onSuccess: () => { toast({ title: callOutcome === 'ordered' ? '✓ Order conversion!' : 'Call logged' }); setCallOutcome(''); setCallNotes(''); setCallbackAt(''); invalidate(); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });
  const { mutate: addNote, isPending: addingNote } = useMutation({
    mutationFn: () => api.addCrmNote(id, noteText),
    onSuccess: () => { toast({ title: 'Note saved' }); setNoteText(''); invalidate(); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });
  const { mutate: deleteNote } = useMutation({
    mutationFn: (noteId: string) => api.deleteCrmNote(id, noteId),
    onSuccess: () => invalidate(),
    onError: () => toast({ title: 'Failed to delete', variant: 'destructive' }),
  });
  const { mutate: sendNudge, isPending: sendingNudge } = useMutation({
    mutationFn: () => api.sendCrmNudge({ customerId: id, templateName: waTemplate, message: waMessage }),
    onSuccess: () => { toast({ title: 'WhatsApp sent' }); setWaTemplate(''); setWaMessage(''); invalidate(); },
    onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} />
    </div>
  );
  if (isError) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-[14px]" style={{ color: 'var(--crm-danger)' }}>Failed to load customer</p>
    </div>
  );

  const { user, stats, calls = [], orders = [] } = data ?? {};

  // Unified timeline: calls + WA + orders merged and sorted
  const allEvents = [
    ...(calls as any[]).map((c: any) => ({ ...c, _type: c.type === 'whatsapp' ? 'wa' : 'call' })),
    ...(orders as any[]).map((o: any) => ({ ...o, _type: 'order' })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const nba = getNextBestAction(stats, user?.phone);

  const handleWaTemplate = (key: string) => {
    setWaTemplate(key);
    setWaMessage(key !== 'custom' ? buildTemplate(key, user, stats) : '');
  };

  const PANELS = [
    { key: 'call' as const, label: 'Log Call',  icon: PhoneCall },
    { key: 'note' as const, label: 'Note',       icon: StickyNote },
    { key: 'wa'   as const, label: 'WhatsApp',   icon: MessageCircle },
  ];

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      {/* Hero header */}
      <div style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
        <div className="px-7 pt-4">
          <Link
            href="/crm/customers"
            className="inline-flex items-center gap-1 text-[12px] font-medium mb-4 transition-opacity hover:opacity-70"
            style={{ color: 'var(--crm-muted)' }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Customers
          </Link>
        </div>

        <div className="px-7 pb-6">
          <div className="flex items-start gap-5">
            <CustomerAvatar name={user?.name} isVip={stats?.isVip} size={64} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1
                  className="text-[22px] font-semibold"
                  style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}
                >
                  {user?.name ?? user?.phone ?? 'Unknown'}
                </h1>
                {stats?.isVip && <Pill variant="vip">VIP</Pill>}
                {stats?.segment && (
                  <Pill variant={segPillVariant(stats.segment)}>{segmentLabel(stats.segment)}</Pill>
                )}
              </div>
              <div className="flex items-center gap-4 text-[13px] flex-wrap" style={{ color: 'var(--crm-muted)' }}>
                <span className="font-mono">{formatPhone(user?.phone) || '—'}</span>
                {user?.email && <span>{user.email}</span>}
                <span>Since {fmtDate(user?.createdAt)}</span>
              </div>
            </div>

            {user?.phone && (
              <a
                href={`tel:${user.phone}`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
                style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)', border: '1px solid var(--crm-success-bg)' }}
              >
                <Phone className="h-4 w-4" /> Call
              </a>
            )}
          </div>

          {/* Stats bar */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5"
            style={{ borderTop: '1px solid var(--crm-line)' }}
          >
            {[
              { label: 'Lifetime Value',  value: formatINR(stats?.ltv ?? 0),          color: 'var(--crm-forest)' },
              { label: 'Avg Order Value', value: formatINR(stats?.aov ?? 0),           color: 'var(--crm-amber)' },
              { label: 'Total Orders',    value: String(user?.totalOrders ?? orders.length), color: 'var(--crm-blue)' },
              { label: 'Reorder Cycle',   value: stats?.personalCycle ? `${stats.personalCycle}d` : '—', color: 'var(--crm-muted)' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{ color: 'var(--crm-muted)' }}>
                  {s.label}
                </p>
                <p
                  className="text-[20px] font-semibold crm-tabular"
                  style={{ color: s.color, fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="p-7 grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Next Best Action */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--crm-forest)', border: '1px solid var(--crm-forest-2)' }}
          >
            <div className="flex items-start gap-3">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                <Zap className="h-4 w-4" style={{ color: nba.color === 'var(--crm-success)' ? 'var(--crm-gold-bright)' : nba.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-0.5" style={{ color: 'var(--crm-on-dark-muted)' }}>
                  Next Best Action
                </p>
                <p className="text-[14px] font-semibold" style={{ color: 'var(--crm-cream)' }}>{nba.title}</p>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-side-muted)' }}>{nba.body}</p>
              </div>
              {nba.cta && (
                <button
                  onClick={() => {
                    if (nba.ctaAction === 'wa') setActivePanel('wa');
                    else setActivePanel('call');
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-80"
                  style={{ background: 'var(--crm-gold)', color: 'var(--crm-forest)' }}
                >
                  {nba.cta}
                </button>
              )}
            </div>
          </div>

          {/* Customer Intel */}
          <div className="crm-card-v2 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--crm-muted)' }}>
              Customer Intel
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Top Product',  value: stats?.topProduct || '—' },
                { label: 'Top Category', value: stats?.topCategory || '—' },
                { label: 'Last Order',   value: fmtDate(user?.lastOrderAt ?? stats?.lastOrderAt) },
                { label: 'Next Due',     value: fmtDate(stats?.predictedReorderDate) },
              ].map(s => (
                <div key={s.label} className="p-2.5 rounded-xl" style={{ background: 'var(--crm-sand)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--crm-muted)' }}>{s.label}</p>
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--crm-ink)' }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action panels */}
          <div className="crm-card-v2 overflow-hidden">
            {/* Panel tabs */}
            <div className="flex" style={{ borderBottom: '1px solid var(--crm-line)' }}>
              {PANELS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setActivePanel(p.key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-all"
                  style={activePanel === p.key
                    ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' }
                    : { color: 'var(--crm-muted)', background: 'transparent' }}
                >
                  <p.icon className="h-3.5 w-3.5" />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Log Call */}
              {activePanel === 'call' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    {CALL_OUTCOMES.map(o => {
                      const active = callOutcome === o.value;
                      return (
                        <button
                          key={o.value}
                          onClick={() => setCallOutcome(o.value)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all"
                          style={active
                            ? { background: `color-mix(in srgb, ${o.color} 12%, transparent)`, color: o.color, border: `1.5px solid color-mix(in srgb, ${o.color} 30%, transparent)` }
                            : { background: 'var(--crm-sand)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
                        >
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: o.color }} />
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={callNotes}
                    onChange={e => setCallNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none"
                    style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)', color: 'var(--crm-ink)' }}
                  />
                  {callOutcome === 'callback' && (
                    <input
                      type="datetime-local"
                      value={callbackAt}
                      onChange={e => setCallbackAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-[13px] focus:outline-none"
                      style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)', color: 'var(--crm-ink)' }}
                    />
                  )}
                  <button
                    onClick={() => callOutcome && logCall()}
                    disabled={!callOutcome || loggingCall}
                    className="w-full py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-opacity"
                    style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
                  >
                    {loggingCall ? 'Saving…' : 'Save Call'}
                  </button>
                </div>
              )}

              {/* Notes */}
              {activePanel === 'note' && (
                <div className="space-y-3">
                  {(stats?.notes ?? []).length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {[...(stats?.notes ?? [])].reverse().map((n: any) => (
                        <div
                          key={n._id}
                          className="p-3 rounded-xl group relative"
                          style={{ background: 'var(--crm-amber-bg)', border: '1px solid var(--crm-gold)' }}
                        >
                          <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--crm-ink)' }}>{n.text}</p>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px]" style={{ color: 'var(--crm-muted)' }}>
                              {n.agentName} · {fmtDate(n.createdAt)}
                            </p>
                            <button
                              onClick={() => deleteNote(n._id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md"
                              style={{ color: 'var(--crm-danger)' }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    placeholder="Add a note…"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none"
                    style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)', color: 'var(--crm-ink)' }}
                  />
                  <button
                    onClick={() => noteText.trim() && addNote()}
                    disabled={!noteText.trim() || addingNote}
                    className="w-full py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40"
                    style={{ background: 'var(--crm-amber)', color: '#fff' }}
                  >
                    {addingNote ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              )}

              {/* WhatsApp */}
              {activePanel === 'wa' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    {WA_TEMPLATES.map(t => (
                      <button
                        key={t.key}
                        onClick={() => handleWaTemplate(t.key)}
                        className="px-3 py-2 rounded-xl text-[11px] font-semibold text-left transition-all"
                        style={waTemplate === t.key
                          ? { background: 'var(--crm-success-bg)', color: 'var(--crm-success)', border: '1.5px solid var(--crm-success)' }
                          : { background: 'var(--crm-sand)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Select a template or write a message…"
                    value={waMessage}
                    onChange={e => setWaMessage(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none leading-relaxed"
                    style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)', color: 'var(--crm-ink)' }}
                  />
                  <button
                    onClick={() => waMessage.trim() && sendNudge()}
                    disabled={!waMessage.trim() || sendingNudge || !user?.phone}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40"
                    style={{ background: 'var(--crm-success)', color: '#fff' }}
                  >
                    <Send className="h-4 w-4" />
                    {sendingNudge ? 'Sending…' : !user?.phone ? 'No phone number' : 'Send WhatsApp'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column: unified timeline + orders ── */}
        <div className="lg:col-span-3 crm-card-v2 overflow-hidden flex flex-col">
          {/* Tabs */}
          <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--crm-line)' }}>
            {(['timeline', 'orders'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className="flex-1 py-3.5 text-[13px] font-medium transition-all capitalize"
                style={activeTab === t
                  ? { color: 'var(--crm-ink)', borderBottom: '2px solid var(--crm-gold)', background: 'var(--crm-amber-bg)' }
                  : { color: 'var(--crm-muted)' }}
              >
                {t === 'timeline'
                  ? `Activity (${allEvents.length})`
                  : `Orders (${user?.totalOrders ?? orders.length})`}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto flex-1" style={{ maxHeight: 640 }}>
            {/* ─ Unified timeline ─ */}
            {activeTab === 'timeline' && (
              <div className="p-5 space-y-0">
                {!allEvents.length ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div
                      className="h-12 w-12 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'var(--crm-sand)' }}
                    >
                      <PhoneCall className="h-5 w-5" style={{ color: 'var(--crm-muted)' }} />
                    </div>
                    <p className="font-semibold text-[14px]" style={{ color: 'var(--crm-ink)' }}>No activity yet</p>
                    <p className="text-[12px] mt-1" style={{ color: 'var(--crm-muted)' }}>Log a call or send a WhatsApp to get started</p>
                  </div>
                ) : allEvents.map((ev: any, i: number) => {
                  const isLast = i === allEvents.length - 1;
                  const isOrder = ev._type === 'order';
                  const isWA = ev._type === 'wa';
                  const outcomeStyle = OUTCOME_STYLE[ev.outcome] ?? { bg: 'var(--crm-sand-2)', color: 'var(--crm-muted)' };

                  return (
                    <div key={ev._id} className="flex gap-4 relative">
                      {/* Connector line */}
                      {!isLast && (
                        <div
                          className="absolute left-[15px] top-9 bottom-0 w-px"
                          style={{ background: 'var(--crm-line)' }}
                        />
                      )}

                      {/* Icon bubble */}
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 z-10"
                        style={isOrder
                          ? { background: 'var(--crm-forest)', border: '1.5px solid var(--crm-forest-2)' }
                          : isWA
                          ? { background: 'var(--crm-success-bg)', border: '1.5px solid var(--crm-success)' }
                          : { background: 'var(--crm-sand-2)', border: '1.5px solid var(--crm-line)' }}
                      >
                        {isOrder
                          ? <ShoppingBag className="h-3.5 w-3.5" style={{ color: 'var(--crm-gold)' }} />
                          : isWA
                          ? <MessageCircle className="h-3.5 w-3.5" style={{ color: 'var(--crm-success)' }} />
                          : <PhoneCall className="h-3.5 w-3.5" style={{ color: 'var(--crm-muted)' }} />
                        }
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {isOrder ? (
                            <>
                              <span className="text-[13px] font-semibold" style={{ color: 'var(--crm-ink)' }}>
                                Order #{ev.orderNumber}
                              </span>
                              <span
                                className="text-[12px] font-semibold crm-tabular px-2 py-0.5 rounded-full"
                                style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }}
                              >
                                {formatINR(ev.total)}
                              </span>
                            </>
                          ) : isWA ? (
                            <span className="text-[13px] font-semibold" style={{ color: 'var(--crm-success)' }}>
                              WhatsApp · {ev.templateName || 'custom'}
                            </span>
                          ) : ev.outcome ? (
                            <span
                              className="text-[12px] font-semibold px-2 py-0.5 rounded-full capitalize"
                              style={{ background: outcomeStyle.bg, color: outcomeStyle.color }}
                            >
                              {ev.outcome.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-[12px] font-semibold" style={{ color: 'var(--crm-muted)' }}>Call logged</span>
                          )}
                          <span className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{fmtDate(ev.createdAt)}</span>
                          {ev.agentId?.name && (
                            <span className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>· {ev.agentId.name}</span>
                          )}
                        </div>

                        {isWA && ev.messageText && (
                          <p
                            className="text-[12px] leading-relaxed px-3 py-2 rounded-xl line-clamp-3 whitespace-pre-line"
                            style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }}
                          >
                            {ev.messageText}
                          </p>
                        )}
                        {!isOrder && !isWA && ev.notes && (
                          <p className="text-[12px]" style={{ color: 'var(--crm-ink-2)' }}>{ev.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ─ Orders ─ */}
            {activeTab === 'orders' && (
              <div className="p-5 space-y-2">
                {!(orders as any[]).length ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <ShoppingBag className="h-8 w-8 mb-3" style={{ color: 'var(--crm-line)' }} />
                    <p className="text-[14px] font-semibold" style={{ color: 'var(--crm-ink)' }}>No orders found</p>
                  </div>
                ) : (orders as any[]).map((o: any) => (
                  <div
                    key={o._id}
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)' }}
                  >
                    <div
                      className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--crm-forest)', opacity: 0.9 }}
                    >
                      <ShoppingBag className="h-4 w-4" style={{ color: 'var(--crm-gold)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--crm-ink)' }}>
                        Order #{o.orderNumber}
                      </p>
                      <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>{fmtDate(o.createdAt)}</p>
                    </div>
                    <p
                      className="text-[14px] font-semibold flex-shrink-0 crm-tabular"
                      style={{ color: 'var(--crm-forest)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
                    >
                      {formatINR(o.total)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
