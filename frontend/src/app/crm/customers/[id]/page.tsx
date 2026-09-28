'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Phone, MessageCircle, ChevronLeft, ShoppingBag, PhoneCall, StickyNote, Trash2, Send, X } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const SEG: Record<string, { bg: string; color: string; dot: string }> = {
  'New':      { bg: '#EFF6FF', color: '#1D4ED8', dot: '#3B82F6' },
  'Active':   { bg: '#F0FDF4', color: '#15803D', dot: '#22C55E' },
  'Due Soon': { bg: '#FEFCE8', color: '#92400E', dot: '#F59E0B' },
  'Overdue':  { bg: '#FEF2F2', color: '#991B1B', dot: '#EF4444' },
  'At Risk':  { bg: '#FFF7ED', color: '#9A3412', dot: '#F97316' },
  'Dormant':  { bg: '#F9FAFB', color: '#6B7280', dot: '#9CA3AF' },
  'Lost':     { bg: '#F3F4F6', color: '#9CA3AF', dot: '#D1D5DB' },
};

const CALL_OUTCOMES = ['connected', 'ordered', 'no_answer', 'not_interested', 'callback'];
const OUTCOME_STYLES: Record<string, { bg: string; color: string }> = {
  connected:      { bg: '#EFF6FF', color: '#1D4ED8' },
  ordered:        { bg: '#F0FDF4', color: '#15803D' },
  no_answer:      { bg: '#F9FAFB', color: '#6B7280' },
  not_interested: { bg: '#FEF2F2', color: '#991B1B' },
  callback:       { bg: '#FEFCE8', color: '#92400E' },
};

const WA_TEMPLATES = [
  { key: 'repurchase', label: '🛒 Repurchase' },
  { key: 'winback',    label: '💚 Win-Back' },
  { key: 'vip',        label: '⭐ VIP Check-in' },
  { key: 'custom',     label: '✏️ Custom' },
];

function buildTemplate(key: string, user: any, stats: any): string {
  const name = user?.name ?? 'there';
  const product = stats?.topProduct || stats?.topCategory || 'your usual products';
  const cycle = stats?.personalCycle ?? 30;
  const days = stats?.predictedReorderDate
    ? Math.max(0, Math.round((Date.now() - new Date(stats.predictedReorderDate).getTime()) / 86400000))
    : null;
  switch (key) {
    case 'repurchase': return `Hi ${name}! 👋\n\nYour ${product} is likely running low — you usually reorder every ${cycle} days.\n\nWant to place your order? Reply here or visit our store. 🌿`;
    case 'winback': return `Hi ${name}! 😊\n\nWe noticed it's been a while since your last order${days ? ` (${days} days)` : ''}. We miss you!\n\nWould love to have you back — anything we can help with? 🌿`;
    case 'vip': return `Hi ${name}! 🌟\n\nAs one of our valued customers, we just wanted to check in. Is there anything you need — ${product} or anything else from our range?\n\nWe're always here for you. 🌿`;
    default: return '';
  }
}

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }
function fmtDate(d: string | Date) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'; }

export default function Customer360Page() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<'timeline' | 'orders'>('timeline');
  const [callOutcome, setCallOutcome] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [waTemplate, setWaTemplate] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [noteText, setNoteText] = useState('');
  const [activePanel, setActivePanel] = useState<'call' | 'note' | 'wa'>('call');

  const { data, isLoading, isError } = useQuery({ queryKey: ['crm-customer360', id], queryFn: () => api.getCrmCustomer360(id) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm-customer360', id] });

  const { mutate: logCall, isPending: loggingCall } = useMutation({
    mutationFn: () => api.logCrmCall({ customerId: id, outcome: callOutcome, notes: callNotes, callbackAt: callbackAt || undefined }),
    onSuccess: () => { toast({ title: 'Call logged' }); setCallOutcome(''); setCallNotes(''); setCallbackAt(''); invalidate(); },
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
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="h-8 w-8 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (isError) return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <p className="text-[14px]" style={{ color: '#DC2626' }}>Failed to load customer</p>
    </div>
  );

  const { user, stats, calls = [], orders = [] } = data ?? {};
  const seg = SEG[stats?.segment ?? ''];
  const timeline = [...calls].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleWaTemplate = (key: string) => {
    setWaTemplate(key);
    if (key !== 'custom') setWaMessage(buildTemplate(key, user, stats));
    else setWaMessage('');
  };

  const PANELS = [
    { key: 'call', label: 'Log Call', icon: PhoneCall, color: '#7C5C1E' },
    { key: 'note', label: 'Add Note', icon: StickyNote, color: '#D97706' },
    { key: 'wa',   label: 'WhatsApp', icon: MessageCircle, color: '#16A34A' },
  ] as const;

  return (
    <div className="crm-root min-h-full" style={{ background: '#F7F5F0' }}>
      {/* Hero header */}
      <div className="bg-white" style={{ borderBottom: '1px solid #E8E2D9' }}>
        <div className="px-7 pt-4">
          <Link href="/crm/customers" className="inline-flex items-center gap-1 text-[12px] font-medium mb-4 transition-colors" style={{ color: '#A09A93' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#7C5C1E')}
            onMouseLeave={e => (e.currentTarget.style.color = '#A09A93')}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Customers
          </Link>
        </div>

        <div className="px-7 pb-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1A3625, #2A5040)', color: '#D4A017' }}
            >
              {(user?.name ?? user?.phone ?? '?')[0].toUpperCase()}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-semibold" style={{ color: '#1C1917', fontFamily: "'DM Sans', system-ui" }}>
                  {user?.name ?? user?.phone ?? 'Unknown'}
                </h1>
                {stats?.isVip && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ background: '#FEF3C7', color: '#92400E' }}>⭐ VIP</span>
                )}
                {seg && (
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full" style={{ background: seg.bg, color: seg.color }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: seg.dot }} />
                    {stats?.segment}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-[13px]" style={{ color: '#6B6560' }}>
                <span className="font-mono">{user?.phone ?? '—'}</span>
                {user?.email && <span>{user.email}</span>}
                <span>Customer since {fmtDate(user?.createdAt)}</span>
              </div>
            </div>

            {/* Quick contact */}
            <div className="flex items-center gap-2 shrink-0">
              {user?.phone && (
                <a href={`tel:${user.phone}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors"
                  style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5" style={{ borderTop: '1px solid #F0EDE7' }}>
            {[
              { label: 'Lifetime Value', value: fmt(stats?.ltv ?? 0), accent: '#1A3625' },
              { label: 'Avg Order Value', value: fmt(stats?.aov ?? 0), accent: '#7C5C1E' },
              { label: 'Total Orders', value: String(user?.totalOrders ?? orders.length), accent: '#2563EB' },
              { label: 'Reorder Cycle', value: `${stats?.personalCycle ?? '—'}d`, accent: '#D97706' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5" style={{ color: '#A09A93' }}>{s.label}</p>
                <p className="text-xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif", color: s.accent }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="p-7 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Actions */}
        <div className="lg:col-span-2 space-y-4">
          {/* Product intel */}
          <div className="crm-card p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: '#A09A93' }}>Customer Intel</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Top Product', value: stats?.topProduct || '—' },
                { label: 'Top Category', value: stats?.topCategory || '—' },
                { label: 'Last Order', value: fmtDate(user?.lastOrderAt) },
                { label: 'Next Due', value: fmtDate(stats?.predictedReorderDate) },
              ].map(s => (
                <div key={s.label} className="p-2.5 rounded-xl" style={{ background: '#F7F5F0' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#A09A93' }}>{s.label}</p>
                  <p className="text-[13px] font-semibold truncate" style={{ color: '#1C1917' }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Panel switcher */}
          <div className="crm-card overflow-hidden">
            <div className="flex" style={{ borderBottom: '1px solid #F0EDE7' }}>
              {PANELS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setActivePanel(p.key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-all"
                  style={activePanel === p.key
                    ? { background: `${p.color}10`, color: p.color, borderBottom: `2px solid ${p.color}` }
                    : { color: '#A09A93', background: 'transparent' }}
                >
                  <p.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">{p.label}</span>
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Log Call panel */}
              {activePanel === 'call' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    {CALL_OUTCOMES.map(o => {
                      const s = OUTCOME_STYLES[o] ?? { bg: '#F7F5F0', color: '#6B6560' };
                      return (
                        <button
                          key={o}
                          onClick={() => setCallOutcome(o)}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left"
                          style={callOutcome === o
                            ? { background: s.bg, color: s.color, border: `1.5px solid ${s.color}40` }
                            : { background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
                        >
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: callOutcome === o ? s.color : '#D1D5DB' }} />
                          {o.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    placeholder="Notes…"
                    value={callNotes} onChange={e => setCallNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none"
                    style={{ border: '1px solid #E8E2D9', background: '#FAFAF8', color: '#1C1917' }}
                  />
                  {callOutcome === 'callback' && (
                    <input type="datetime-local" value={callbackAt} onChange={e => setCallbackAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-[13px] focus:outline-none"
                      style={{ border: '1px solid #E8E2D9', background: '#FAFAF8', color: '#1C1917' }}
                    />
                  )}
                  <button
                    onClick={() => callOutcome && logCall()}
                    disabled={!callOutcome || loggingCall}
                    className="w-full py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-opacity"
                    style={{ background: '#1A3625', color: '#D4A017' }}
                  >
                    {loggingCall ? 'Saving…' : 'Save Call'}
                  </button>
                </div>
              )}

              {/* Notes panel */}
              {activePanel === 'note' && (
                <div className="space-y-3">
                  {(stats?.notes ?? []).length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {[...(stats?.notes ?? [])].reverse().map((n: any) => (
                        <div key={n._id} className="p-3 rounded-xl group relative" style={{ background: '#FFFBF0', border: '1px solid #FDE68A' }}>
                          <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: '#1C1917' }}>{n.text}</p>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px]" style={{ color: '#A09A93' }}>{n.agentName} · {fmtDate(n.createdAt)}</p>
                            <button
                              onClick={() => deleteNote(n._id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md"
                              style={{ color: '#DC2626' }}
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
                    value={noteText} onChange={e => setNoteText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none"
                    style={{ border: '1px solid #E8E2D9', background: '#FAFAF8', color: '#1C1917' }}
                  />
                  <button
                    onClick={() => noteText.trim() && addNote()}
                    disabled={!noteText.trim() || addingNote}
                    className="w-full py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40"
                    style={{ background: '#D97706', color: '#ffffff' }}
                  >
                    {addingNote ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              )}

              {/* WhatsApp panel */}
              {activePanel === 'wa' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    {WA_TEMPLATES.map(t => (
                      <button
                        key={t.key}
                        onClick={() => handleWaTemplate(t.key)}
                        className="px-3 py-2 rounded-xl text-[11px] font-semibold text-left transition-all"
                        style={waTemplate === t.key
                          ? { background: '#F0FDF4', color: '#16A34A', border: '1.5px solid #86EFAC' }
                          : { background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Select a template or write a custom message…"
                    value={waMessage} onChange={e => setWaMessage(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none leading-relaxed"
                    style={{ border: '1px solid #E8E2D9', background: '#FAFAF8', color: '#1C1917' }}
                  />
                  <button
                    onClick={() => waMessage.trim() && sendNudge()}
                    disabled={!waMessage.trim() || sendingNudge || !user?.phone}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-40"
                    style={{ background: '#16A34A', color: '#ffffff' }}
                  >
                    <Send className="h-4 w-4" />
                    {sendingNudge ? 'Sending…' : !user?.phone ? 'No phone number' : 'Send WhatsApp'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Timeline + Orders */}
        <div className="lg:col-span-3 crm-card overflow-hidden">
          {/* Tabs */}
          <div className="flex" style={{ borderBottom: '1px solid #E8E2D9' }}>
            {(['timeline', 'orders'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className="flex-1 py-3.5 text-[13px] font-medium transition-all capitalize"
                style={activeTab === t
                  ? { color: '#1C1917', borderBottom: '2px solid #D4A017', background: '#FFFBF0' }
                  : { color: '#A09A93' }}
              >
                {t === 'timeline' ? `Activity (${timeline.length})` : `Orders (${user?.totalOrders ?? orders.length})`}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
            {activeTab === 'timeline' ? (
              <div className="p-5 space-y-0">
                {!timeline.length ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="h-12 w-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#F0EDE7' }}>
                      <PhoneCall className="h-5 w-5" style={{ color: '#A09A93' }} />
                    </div>
                    <p className="font-semibold text-[14px]" style={{ color: '#1C1917' }}>No activity yet</p>
                    <p className="text-[12px] mt-1" style={{ color: '#A09A93' }}>Log a call or send a WhatsApp to get started</p>
                  </div>
                ) : timeline.map((c: any, i: number) => {
                  const isWA = c.type === 'whatsapp';
                  const isLast = i === timeline.length - 1;
                  return (
                    <div key={c._id} className="flex gap-4 relative">
                      {/* Timeline line */}
                      {!isLast && <div className="absolute left-[15px] top-10 bottom-0 w-px" style={{ background: '#F0EDE7' }} />}

                      {/* Icon */}
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 z-10"
                        style={isWA
                          ? { background: '#F0FDF4', border: '1.5px solid #86EFAC' }
                          : { background: '#F7F5F0', border: '1.5px solid #E8E2D9' }}
                      >
                        {isWA
                          ? <MessageCircle className="h-3.5 w-3.5" style={{ color: '#16A34A' }} />
                          : <PhoneCall className="h-3.5 w-3.5" style={{ color: '#7C5C1E' }} />
                        }
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {isWA ? (
                            <span className="text-[13px] font-semibold" style={{ color: '#16A34A' }}>
                              WhatsApp · {c.templateName || 'custom'}
                            </span>
                          ) : c.outcome ? (
                            <span
                              className="text-[12px] font-semibold px-2 py-0.5 rounded-full capitalize"
                              style={OUTCOME_STYLES[c.outcome] ?? { bg: '#F7F5F0', color: '#6B6560' }}
                            >
                              {c.outcome.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-[12px] font-semibold" style={{ color: '#6B6560' }}>Call logged</span>
                          )}
                          <span className="text-[11px]" style={{ color: '#A09A93' }}>{fmtDate(c.createdAt)}</span>
                          {c.agentId?.name && <span className="text-[11px]" style={{ color: '#A09A93' }}>· {c.agentId.name}</span>}
                        </div>
                        {isWA && c.messageText && (
                          <p className="text-[12px] leading-relaxed px-3 py-2 rounded-xl line-clamp-3 whitespace-pre-line" style={{ background: '#F0FDF4', color: '#166534' }}>
                            {c.messageText}
                          </p>
                        )}
                        {!isWA && c.notes && (
                          <p className="text-[12px]" style={{ color: '#6B6560' }}>{c.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-5 space-y-2">
                {!orders.length ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <ShoppingBag className="h-8 w-8 mb-3" style={{ color: '#D1D5DB' }} />
                    <p className="text-[14px] font-semibold" style={{ color: '#1C1917' }}>No orders found</p>
                  </div>
                ) : orders.map((o: any) => (
                  <div key={o._id} className="flex items-center gap-4 p-4 rounded-xl transition-colors" style={{ background: '#F7F5F0', border: '1px solid #E8E2D9' }}>
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#1A362514', border: '1px solid #1A362520' }}>
                      <ShoppingBag className="h-4 w-4" style={{ color: '#1A3625' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: '#1C1917' }}>Order #{o.orderNumber}</p>
                      <p className="text-[12px]" style={{ color: '#A09A93' }}>{fmtDate(o.createdAt)}</p>
                    </div>
                    <p className="text-[14px] font-semibold flex-shrink-0" style={{ color: '#1A3625', fontFamily: "'Fraunces', Georgia, serif" }}>{fmt(o.total)}</p>
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
