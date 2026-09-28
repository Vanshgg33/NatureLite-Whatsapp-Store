'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Phone, MessageCircle, ChevronLeft, ShoppingBag, PhoneCall, StickyNote, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const SEGMENT_COLORS: Record<string, string> = {
  'New': 'bg-blue-50 text-blue-700',
  'Active': 'bg-green-50 text-green-700',
  'Due Soon': 'bg-amber-50 text-amber-700',
  'Overdue': 'bg-red-50 text-red-700',
  'At Risk': 'bg-orange-50 text-orange-700',
  'Dormant': 'bg-gray-100 text-gray-600',
  'Lost': 'bg-gray-50 text-gray-400',
};

const CALL_OUTCOMES = ['connected', 'ordered', 'no_answer', 'not_interested', 'callback'];

const WA_TEMPLATES = [
  { key: 'repurchase', label: 'Repurchase Reminder' },
  { key: 'winback', label: 'Win-Back' },
  { key: 'vip', label: 'VIP Check-in' },
  { key: 'custom', label: 'Custom' },
];

function buildTemplate(key: string, user: any, stats: any): string {
  const name = user?.name ?? 'there';
  const product = stats?.topProduct || stats?.topCategory || 'your usual products';
  const cycle = stats?.personalCycle ?? 30;
  const days = stats?.predictedReorderDate
    ? Math.max(0, Math.round((Date.now() - new Date(stats.predictedReorderDate).getTime()) / 86400000))
    : null;

  switch (key) {
    case 'repurchase':
      return `Hi ${name}! 👋\n\nYour ${product} is likely running low — you usually reorder every ${cycle} days.\n\nWant to place your order? Reply here or visit our store. 🌿`;
    case 'winback':
      return `Hi ${name}! 😊\n\nWe noticed it's been a while since your last order${days ? ` (${days} days)` : ''}. We miss you!\n\nWould love to have you back — anything we can help with? 🌿`;
    case 'vip':
      return `Hi ${name}! 🌟\n\nAs one of our valued customers, we just wanted to check in. Is there anything you need — ${product} or anything else from our range?\n\nWe're always here for you. 🌿`;
    default:
      return '';
  }
}

function HealthGauge({ segment }: { segment: string }) {
  const color = ['Active', 'New'].includes(segment) ? 'bg-green-400'
    : ['Due Soon', 'Overdue'].includes(segment) ? 'bg-amber-400'
    : 'bg-red-400';
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', color)} />;
}

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }
function fmtDate(d: string | Date) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-customer360', id],
    queryFn: () => api.getCrmCustomer360(id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm-customer360', id] });

  const { mutate: logCall, isPending: loggingCall } = useMutation({
    mutationFn: () => api.logCrmCall({ customerId: id, outcome: callOutcome, notes: callNotes, callbackAt: callbackAt || undefined }),
    onSuccess: () => {
      toast({ title: 'Call logged' });
      setCallOutcome(''); setCallNotes(''); setCallbackAt('');
      invalidate();
    },
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
    onSuccess: () => {
      toast({ title: 'WhatsApp sent' });
      setWaTemplate(''); setWaMessage('');
      invalidate();
    },
    onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
  });

  if (isLoading) return (
    <div className="flex justify-center py-24">
      <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (isError) return (
    <div className="flex justify-center py-24 text-sm text-red-500">Failed to load customer</div>
  );

  const { user, stats, calls = [], orders = [] } = data ?? {};

  const handleWaTemplate = (key: string) => {
    setWaTemplate(key);
    if (key !== 'custom') setWaMessage(buildTemplate(key, user, stats));
    else setWaMessage('');
  };

  // Unified timeline: calls + WA events sorted by createdAt desc
  const timeline = [...calls].sort((a: any, b: any) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="border-b bg-white px-5 py-4">
        <Link href="/crm/customers" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ChevronLeft className="h-4 w-4" /> Customers
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-[#D4A017]/10 flex items-center justify-center text-[#7C5C1E] font-bold text-base">
            {(user?.name ?? user?.phone ?? '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold text-gray-900">{user?.name ?? user?.phone}</h1>
              {stats?.isVip && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">VIP</span>}
              {stats?.segment && (
                <span className={cn('flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium', SEGMENT_COLORS[stats.segment] ?? 'bg-gray-100')}>
                  <HealthGauge segment={stats.segment} />
                  {stats.segment}
                </span>
              )}
            </div>
            <p className="text-[12px] text-gray-500 mt-0.5">{user?.phone}</p>
          </div>
          <div className="flex gap-2">
            {user?.phone && <a href={`tel:${user.phone}`} className="h-9 w-9 rounded-full bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center"><Phone className="h-4 w-4" /></a>}
          </div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-3">
            {[
              { label: 'LTV', value: fmt(stats?.ltv ?? 0) },
              { label: 'AOV', value: fmt(stats?.aov ?? 0) },
              { label: 'Orders', value: String(user?.totalOrders ?? orders.length) },
              { label: 'Cycle', value: `${stats?.personalCycle ?? '—'}d` },
              { label: 'Top Product', value: stats?.topProduct || '—' },
              { label: 'Top Category', value: stats?.topCategory || '—' },
              { label: 'Last Order', value: fmtDate(user?.lastOrderAt) },
              { label: 'Next Due', value: fmtDate(stats?.predictedReorderDate) },
            ].map(s => (
              <div key={s.label}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                <p className="text-sm font-semibold text-gray-800 truncate">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Log Call */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-[#D4A017]" /> Log Call
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {CALL_OUTCOMES.map(o => (
                <button
                  key={o}
                  onClick={() => setCallOutcome(o)}
                  className={cn(
                    'text-[11px] py-1.5 px-2 rounded-md border font-medium transition-colors',
                    callOutcome === o ? 'bg-[#1A3625] text-white border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {o.replace('_', ' ')}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Notes…"
              value={callNotes}
              onChange={e => setCallNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
            />
            {callOutcome === 'callback' && (
              <input
                type="datetime-local"
                value={callbackAt}
                onChange={e => setCallbackAt(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
              />
            )}
            <button
              onClick={() => callOutcome && logCall()}
              disabled={!callOutcome || loggingCall}
              className="w-full py-2 rounded-md bg-[#1A3625] text-white text-sm font-medium hover:bg-[#1A3625]/90 disabled:opacity-40"
            >
              {loggingCall ? 'Saving…' : 'Save Call'}
            </button>
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-[#D4A017]" /> Notes
            </h3>
            {(stats?.notes ?? []).length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {[...(stats?.notes ?? [])].reverse().map((n: any) => (
                  <div key={n._id} className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 group">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12px] text-gray-800 flex-1 whitespace-pre-wrap">{n.text}</p>
                      <button
                        onClick={() => deleteNote(n._id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{n.agentName} · {fmtDate(n.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
            <textarea
              placeholder="Add a note…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
            />
            <button
              onClick={() => noteText.trim() && addNote()}
              disabled={!noteText.trim() || addingNote}
              className="w-full py-2 rounded-md bg-[#1A3625] text-white text-sm font-medium hover:bg-[#1A3625]/90 disabled:opacity-40"
            >
              {addingNote ? 'Saving…' : 'Save Note'}
            </button>
          </div>

          {/* WhatsApp Nudge */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-500" /> WhatsApp Nudge
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {WA_TEMPLATES.map(t => (
                <button
                  key={t.key}
                  onClick={() => handleWaTemplate(t.key)}
                  className={cn(
                    'text-[10px] py-1.5 px-2 rounded-md border font-medium transition-colors text-left leading-snug',
                    waTemplate === t.key ? 'bg-emerald-600 text-white border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Select a template or write a custom message…"
              value={waMessage}
              onChange={e => setWaMessage(e.target.value)}
              rows={5}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <button
              onClick={() => waMessage.trim() && sendNudge()}
              disabled={!waMessage.trim() || sendingNudge || !user?.phone}
              className="w-full py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
            >
              {sendingNudge ? 'Sending…' : !user?.phone ? 'No phone number' : 'Send WhatsApp'}
            </button>
          </div>
        </div>

        {/* Right: timeline */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl">
          <div className="flex border-b">
            {(['timeline', 'orders'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  'flex-1 py-3 text-[12px] font-medium capitalize transition-colors',
                  activeTab === t ? 'text-[#7C5C1E] border-b-2 border-[#D4A017]' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {t === 'timeline' ? `Timeline (${timeline.length})` : `Orders (${user?.totalOrders ?? orders.length})`}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
            {activeTab === 'timeline' ? (
              timeline.length ? timeline.map((c: any) => (
                <div key={c._id} className="flex gap-3">
                  <div className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5',
                    c.type === 'whatsapp' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#D4A017]/10 text-[#7C5C1E]',
                  )}>
                    {c.type === 'whatsapp' ? <MessageCircle className="h-3.5 w-3.5" /> : (c.agentId?.name ?? 'A')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.type === 'whatsapp' ? (
                        <span className="text-[12px] font-medium text-emerald-700">
                          WA · {c.templateName || 'custom'}
                        </span>
                      ) : (
                        <span className="text-[12px] font-medium capitalize text-gray-800">
                          {c.outcome?.replace('_', ' ') ?? '—'}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">{fmtDate(c.createdAt)}</span>
                      {c.agentId?.name && <span className="text-[10px] text-gray-400">· {c.agentId.name}</span>}
                    </div>
                    {c.type === 'whatsapp' && c.messageText && (
                      <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-line">{c.messageText}</p>
                    )}
                    {c.type !== 'whatsapp' && c.notes && (
                      <p className="text-[11px] text-gray-500 mt-0.5">{c.notes}</p>
                    )}
                  </div>
                </div>
              )) : <p className="text-sm text-gray-400 text-center py-8">No activity yet</p>
            ) : (
              orders.length ? orders.map((o: any) => (
                <div key={o._id} className="flex items-center gap-3">
                  <ShoppingBag className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-gray-800">#{o.orderNumber}</p>
                    <p className="text-[11px] text-gray-500">{fmtDate(o.createdAt)} · {fmt(o.total)}</p>
                  </div>
                </div>
              )) : <p className="text-sm text-gray-400 text-center py-8">No orders found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
