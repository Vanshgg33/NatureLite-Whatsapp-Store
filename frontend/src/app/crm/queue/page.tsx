'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Phone, ListTodo, Clock, AlertTriangle, Flame, ChevronRight, BellOff, X, ArrowUpCircle, ChevronDown, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'today',    label: 'Due Today',  icon: Clock,          accent: '#D97706', bg: '#FFF9EC' },
  { key: 'overdue',  label: 'Overdue',    icon: Flame,          accent: '#DC2626', bg: '#FFF5F5' },
  { key: 'at_risk',  label: 'At Risk',    icon: AlertTriangle,  accent: '#EA580C', bg: '#FFF7ED' },
  { key: 'upcoming', label: 'Upcoming',   icon: ListTodo,       accent: '#2563EB', bg: '#EFF6FF' },
] as const;

const SEG: Record<string, { bg: string; color: string; dot: string }> = {
  'New':      { bg: '#EFF6FF', color: '#1D4ED8', dot: '#3B82F6' },
  'Active':   { bg: '#F0FDF4', color: '#15803D', dot: '#22C55E' },
  'Due Soon': { bg: '#FEFCE8', color: '#92400E', dot: '#F59E0B' },
  'Overdue':  { bg: '#FEF2F2', color: '#991B1B', dot: '#EF4444' },
  'At Risk':  { bg: '#FFF7ED', color: '#9A3412', dot: '#F97316' },
  'Dormant':  { bg: '#F9FAFB', color: '#6B7280', dot: '#9CA3AF' },
  'Lost':     { bg: '#F3F4F6', color: '#9CA3AF', dot: '#D1D5DB' },
};

const PRIORITY_BORDER: Record<string, string> = {
  'Overdue': '#DC2626', 'At Risk': '#EA580C', 'Due Soon': '#D97706',
  'Active': '#16A34A', 'New': '#2563EB', 'Dormant': '#9CA3AF', 'Lost': '#D1D5DB',
};

const OUTCOME_OPTIONS = [
  { value: 'connected',     label: 'Connected',      color: '#2563EB' },
  { value: 'ordered',       label: 'Ordered ✓',      color: '#16A34A' },
  { value: 'no_answer',     label: 'No Answer',      color: '#6B7280' },
  { value: 'not_interested',label: 'Not Interested', color: '#DC2626' },
  { value: 'callback',      label: 'Callback',       color: '#D97706' },
];

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN'); }
function minSnoozeDate() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

function CustomerRow({ item, onLogCall }: { item: any; onLogCall: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm-queue'] });

  const { mutate: snooze, isPending: snoozing } = useMutation({
    mutationFn: () => api.snoozeCrmCustomer(item.userId, snoozeDate),
    onSuccess: () => { toast({ title: 'Snoozed' }); setShowSnooze(false); setSnoozeDate(''); invalidate(); },
    onError: () => toast({ title: 'Failed to snooze', variant: 'destructive' }),
  });
  const { mutate: dismiss, isPending: dismissing } = useMutation({
    mutationFn: () => api.dismissCrmCustomer(item.userId),
    onSuccess: () => { toast({ title: 'Dismissed' }); invalidate(); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });
  const { mutate: escalate, isPending: escalating } = useMutation({
    mutationFn: () => api.escalateCrmCustomer(item.userId),
    onSuccess: () => { toast({ title: 'Escalated to manager' }); invalidate(); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });

  const daysOverdue = item.predictedReorderDate
    ? Math.round((Date.now() - new Date(item.predictedReorderDate).getTime()) / 86400000)
    : null;
  const seg = SEG[item.segment] ?? SEG['Lost'];
  const borderColor = PRIORITY_BORDER[item.segment] ?? '#E8E2D9';

  return (
    <div
      className="bg-white rounded-xl overflow-hidden transition-all duration-150 crm-count-in"
      style={{ border: `1px solid #E8E2D9`, borderLeft: `3px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Avatar */}
        <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ background: `${borderColor}18`, color: borderColor }}>
          {(item.user?.name ?? item.user?.phone ?? '?')[0].toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/crm/customers/${item.userId}`} className="font-semibold text-[13px] hover:underline underline-offset-2" style={{ color: '#1C1917' }}>
              {item.user?.name ?? item.user?.phone ?? '—'}
            </Link>
            {item.isVip && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider" style={{ background: '#FEF3C7', color: '#92400E' }}>VIP</span>
            )}
            <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: seg.bg, color: seg.color }}>
              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: seg.dot }} />
              {item.segment}
            </span>
            {item.isEscalated && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#991B1B' }}>
                <ArrowUpCircle className="h-2.5 w-2.5" /> Escalated
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap" style={{ color: '#A09A93' }}>
            <span className="font-mono">{item.user?.phone}</span>
            <span style={{ color: '#E8E2D9' }}>·</span>
            <span>LTV <strong style={{ color: '#6B6560' }}>{fmt(item.ltv)}</strong></span>
            <span style={{ color: '#E8E2D9' }}>·</span>
            <span>{item.topProduct || item.topCategory || 'No product data'}</span>
            {daysOverdue !== null && daysOverdue > 0 && (
              <>
                <span style={{ color: '#E8E2D9' }}>·</span>
                <span className="font-semibold" style={{ color: '#DC2626' }}>{daysOverdue}d overdue</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {item.user?.phone && (
            <a
              href={`tel:${item.user.phone}`}
              className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}
              title="Call"
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => onLogCall(item.userId)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
            style={{ background: '#1A3625', color: '#D4A017', border: 'none' }}
          >
            Log Call
          </button>
          <Link href={`/crm/customers/${item.userId}`}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
            title="View profile"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={() => setExpanded(e => !e)}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Expandable action strip */}
      {expanded && (
        <div className="px-5 pb-4 pt-0 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid #F0EDE7' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A09A93' }}>Actions:</p>

          {/* Snooze */}
          {!showSnooze ? (
            <button
              onClick={() => setShowSnooze(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
            >
              <BellOff className="h-3 w-3" /> Snooze
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="date" min={minSnoozeDate()} value={snoozeDate}
                onChange={e => setSnoozeDate(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-[12px] focus:outline-none"
                style={{ border: '1px solid #D4A017', color: '#1C1917', background: '#FFFBF0' }}
              />
              <button
                onClick={() => snoozeDate && snooze()} disabled={!snoozeDate || snoozing}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40"
                style={{ background: '#1A3625', color: '#D4A017' }}
              >
                {snoozing ? '…' : 'Confirm'}
              </button>
              <button onClick={() => { setShowSnooze(false); setSnoozeDate(''); }} style={{ color: '#A09A93' }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={() => dismiss()} disabled={dismissing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
            style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}
          >
            <X className="h-3 w-3" /> Dismiss
          </button>

          {!item.isEscalated && (
            <button
              onClick={() => escalate()} disabled={escalating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-40"
              style={{ background: '#FFF7ED', color: '#9A3412', border: '1px solid #FED7AA' }}
            >
              <ArrowUpCircle className="h-3 w-3" /> Escalate
            </button>
          )}

          <Link
            href={`/crm/customers/${item.userId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={{ background: '#F0F9FF', color: '#0369A1', border: '1px solid #BAE6FD' }}
          >
            <MessageCircle className="h-3 w-3" /> WA Nudge
          </Link>
        </div>
      )}
    </div>
  );
}

function LogCallModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [outcome, setOutcome] = useState('connected');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.logCrmCall({ customerId, outcome, notes, callbackAt: callbackAt || undefined }),
    onSuccess: () => { toast({ title: 'Call logged' }); qc.invalidateQueries({ queryKey: ['crm-queue'] }); onClose(); },
    onError: () => toast({ title: 'Failed to log call', variant: 'destructive' }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" style={{ border: '1px solid #E8E2D9' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F0EDE7' }}>
          <h3 className="font-semibold text-[15px]" style={{ color: '#1C1917' }}>Log Call Outcome</h3>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ color: '#A09A93', background: '#F7F5F0' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-2">
            {OUTCOME_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setOutcome(o.value)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all"
                style={outcome === o.value
                  ? { background: `${o.color}12`, color: o.color, border: `1.5px solid ${o.color}40` }
                  : { background: '#F7F5F0', color: '#6B6560', border: '1px solid #E8E2D9' }}
              >
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: o.color }} />
                {o.label}
              </button>
            ))}
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none"
            style={{ border: '1px solid #E8E2D9', color: '#1C1917', background: '#FAFAF8' }}
          />
          {outcome === 'callback' && (
            <input
              type="datetime-local" value={callbackAt} onChange={e => setCallbackAt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] focus:outline-none"
              style={{ border: '1px solid #E8E2D9', color: '#1C1917', background: '#FAFAF8' }}
            />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-medium" style={{ border: '1px solid #E8E2D9', color: '#6B6560' }}>Cancel</button>
            <button
              onClick={() => mutate()} disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-50"
              style={{ background: '#1A3625', color: '#D4A017' }}
            >
              {isPending ? 'Saving…' : 'Save Call'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QueuePage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<string>(searchParams.get('tab') ?? 'today');
  const [logCallId, setLogCallId] = useState<string | null>(null);

  useEffect(() => { const t = searchParams.get('tab'); if (t) setTab(t); }, [searchParams]);

  const { data = [], isLoading } = useQuery({
    queryKey: ['crm-queue', tab],
    queryFn: () => api.getCrmQueue(tab),
  });

  const activeTab = TABS.find(t => t.key === tab) ?? TABS[0];

  return (
    <div className="crm-root min-h-full" style={{ background: '#F7F5F0' }}>
      {/* Header */}
      <div className="bg-white px-7 py-5" style={{ borderBottom: '1px solid #E8E2D9' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: '#1C1917' }}>Retarget Queue</h1>
            <p className="text-[12px] mt-0.5" style={{ color: '#A09A93' }}>
              {isLoading ? 'Loading…' : `${data.length} customers`} in <span className="font-medium" style={{ color: activeTab.accent }}>{activeTab.label}</span>
            </p>
          </div>
          <Link href="/crm/campaigns" className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: '#7C5C1E' }}>
            Campaigns <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-5 overflow-x-auto pb-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-medium rounded-t-xl whitespace-nowrap transition-all"
              style={tab === t.key
                ? { background: t.bg, color: t.accent, borderTop: `2px solid ${t.accent}`, borderLeft: `1px solid ${t.accent}30`, borderRight: `1px solid ${t.accent}30` }
                : { color: '#A09A93', background: 'transparent' }}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-7 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 border-2 border-[#D4A017] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#F0EDE7' }}>
              <activeTab.icon className="h-6 w-6" style={{ color: '#A09A93' }} />
            </div>
            <p className="font-semibold text-[15px]" style={{ color: '#1C1917' }}>All clear</p>
            <p className="text-[13px] mt-1" style={{ color: '#A09A93' }}>No customers in {activeTab.label.toLowerCase()}</p>
          </div>
        ) : (
          data.map((item: any) => (
            <CustomerRow key={item._id} item={item} onLogCall={setLogCallId} />
          ))
        )}
      </div>

      {logCallId && <LogCallModal customerId={logCallId} onClose={() => setLogCallId(null)} />}
    </div>
  );
}
