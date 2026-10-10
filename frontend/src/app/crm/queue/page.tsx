'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  Phone, Clock, Flame, AlertTriangle, BellOff, TrendingDown,
  ChevronRight, X, ArrowUpCircle, MessageCircle, ChevronDown,
  ChevronLeft, Search,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/crm/format';
import { segmentLabel } from '@/lib/crm/format';
import { CustomerAvatar } from '@/components/crm/CustomerAvatar';
import { LateBar } from '@/components/crm/LateBar';
import { Pill } from '@/components/crm/Pill';
import { EmptyState } from '@/components/crm/EmptyState';
import { LogCallPanel } from '@/components/crm/LogCallPanel';
import type { PillVariant } from '@/components/crm/Pill';

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'due_today', apiTab: 'today',    label: 'Due Today', icon: Clock,          color: 'var(--crm-amber)' },
  { key: 'overdue',   apiTab: 'overdue',  label: 'Overdue',   icon: Flame,          color: 'var(--crm-danger)' },
  { key: 'at_risk',   apiTab: 'at_risk',  label: 'At Risk',   icon: AlertTriangle,  color: '#C05621' },
  { key: 'due_soon',  apiTab: 'upcoming', label: 'Due Soon',  icon: BellOff,        color: 'var(--crm-blue)' },
  { key: 'dormant',   apiTab: 'dormant',  label: 'Dormant',   icon: TrendingDown,   color: 'var(--crm-muted)' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// Maps old ?tab= values and new ?segment= values → TabKey
function resolveTab(segment: string | null, tab: string | null): TabKey {
  const s = segment ?? tab ?? '';
  if (s === 'due_today' || s === 'today') return 'due_today';
  if (s === 'overdue') return 'overdue';
  if (s === 'at_risk') return 'at_risk';
  if (s === 'due_soon' || s === 'upcoming') return 'due_soon';
  if (s === 'dormant') return 'dormant';
  return 'due_today';
}

// Segment string (title-case or snake_case) → Pill variant
function segPillVariant(segment: string): PillVariant {
  const s = segment.toLowerCase().replace(/\s/g, '_');
  if (s === 'overdue') return 'overdue';
  if (s === 'due_soon') return 'upcoming';
  if (s === 'due_today') return 'dueToday';
  if (s === 'at_risk') return 'warn';
  if (s === 'active') return 'success';
  if (s === 'new') return 'success';
  return 'neutral';
}

// ─── Customer row ─────────────────────────────────────────────────────────────

function minSnoozeDate() {
  const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
}

function CustomerRow({ item, onLogCall, queueKey }: {
  item: any; onLogCall: (item: any) => void; queueKey: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm-queue', queueKey] });

  const { mutate: snooze, isPending: snoozing } = useMutation({
    mutationFn: () => api.snoozeCrmCustomer(item.userId, snoozeDate),
    onSuccess: () => { toast({ title: 'Snoozed' }); setShowSnooze(false); setSnoozeDate(''); invalidate(); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });
  const { mutate: dismiss, isPending: dismissing } = useMutation({
    mutationFn: () => api.dismissCrmCustomer(item.userId),
    onSuccess: () => { toast({ title: 'Dismissed' }); invalidate(); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });
  const { mutate: escalate, isPending: escalating } = useMutation({
    mutationFn: () => api.escalateCrmCustomer(item.userId),
    onSuccess: () => { toast({ title: 'Escalated' }); invalidate(); },
    onError: () => toast({ title: 'Failed', variant: 'destructive' }),
  });

  const now = Date.now();
  const reorderMs = item.predictedReorderDate ? new Date(item.predictedReorderDate).getTime() : null;
  const daysDiff = reorderMs ? Math.round((now - reorderMs) / 86_400_000) : 0;
  const daysLate = Math.max(daysDiff, 0);
  const daysUntil = daysDiff < 0 ? Math.abs(daysDiff) : 0;

  const pillVariant = segPillVariant(item.segment ?? '');
  const segNorm = (item.segment ?? '').toLowerCase().replace(/\s/g, '_');

  return (
    <div
      className="overflow-hidden transition-all duration-150"
      style={{
        background: 'var(--crm-paper)',
        border: '1px solid var(--crm-line)',
        borderLeft: `3px solid ${SEG_LEFT_COLOR[segNorm] ?? 'var(--crm-line)'}`,
        borderRadius: 12,
      }}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <CustomerAvatar name={item.user?.name} isVip={item.isVip} size={36} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/crm/customers/${item.userId}`}
              className="font-semibold text-[13px] hover:underline underline-offset-2"
              style={{ color: 'var(--crm-ink)' }}
            >
              {item.user?.name ?? item.user?.phone ?? '—'}
            </Link>
            {item.isVip && <Pill variant="vip">VIP</Pill>}
            <Pill variant={pillVariant}>{segmentLabel(item.segment ?? '')}</Pill>
            {item.isEscalated && (
              <span
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--crm-danger-bg)', color: 'var(--crm-danger)' }}
              >
                <ArrowUpCircle className="h-2.5 w-2.5" /> Escalated
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-2.5 mt-0.5 text-[11px] flex-wrap"
            style={{ color: 'var(--crm-muted)' }}
          >
            <span className="font-mono">{item.user?.phone}</span>
            <span style={{ color: 'var(--crm-line)' }}>·</span>
            <span>LTV <span className="font-semibold crm-tabular" style={{ color: 'var(--crm-ink-2)' }}>{formatINR(item.ltv)}</span></span>
            {item.topProduct || item.topCategory ? (
              <>
                <span style={{ color: 'var(--crm-line)' }}>·</span>
                <span className="truncate max-w-[120px]">{item.topProduct ?? item.topCategory}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Late bar + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <LateBar daysLate={daysLate} daysUntil={daysUntil} />
          {item.user?.phone && (
            <a
              href={`tel:${item.user.phone}`}
              className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)', border: '1px solid var(--crm-success-bg)' }}
              title="Call"
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => onLogCall(item)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold flex-shrink-0"
            style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
          >
            Log
          </button>
          <Link
            href={`/crm/customers/${item.userId}`}
            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--crm-sand)', color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={() => setExpanded(e => !e)}
            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--crm-sand)', color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Expanded action strip */}
      {expanded && (
        <div
          className="px-4 pb-3 pt-0 flex items-center gap-2.5 flex-wrap"
          style={{ borderTop: '1px solid var(--crm-line)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--crm-muted)' }}>
            Actions
          </p>

          {!showSnooze ? (
            <button
              onClick={() => setShowSnooze(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{ background: 'var(--crm-sand)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
            >
              <BellOff className="h-3 w-3" /> Snooze
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                min={minSnoozeDate()}
                value={snoozeDate}
                onChange={e => setSnoozeDate(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-[12px] focus:outline-none"
                style={{ border: '1px solid var(--crm-gold)', color: 'var(--crm-ink)', background: 'var(--crm-amber-bg)' }}
              />
              <button
                onClick={() => snoozeDate && snooze()}
                disabled={!snoozeDate || snoozing}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40"
                style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
              >
                {snoozing ? '…' : 'Confirm'}
              </button>
              <button onClick={() => { setShowSnooze(false); setSnoozeDate(''); }}>
                <X className="h-3.5 w-3.5" style={{ color: 'var(--crm-muted)' }} />
              </button>
            </div>
          )}

          <button
            onClick={() => dismiss()}
            disabled={dismissing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
            style={{ background: 'var(--crm-danger-bg)', color: 'var(--crm-danger)', border: '1px solid var(--crm-danger-bg)' }}
          >
            <X className="h-3 w-3" /> Dismiss
          </button>

          {!item.isEscalated && (
            <button
              onClick={() => escalate()}
              disabled={escalating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
              style={{ background: 'var(--crm-amber-bg)', color: 'var(--crm-amber)', border: '1px solid var(--crm-amber-bg)' }}
            >
              <ArrowUpCircle className="h-3 w-3" /> Escalate
            </button>
          )}

          <Link
            href={`/crm/customers/${item.userId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={{ background: 'var(--crm-blue-bg)', color: 'var(--crm-blue)', border: '1px solid var(--crm-blue-bg)' }}
          >
            <MessageCircle className="h-3 w-3" /> WA Nudge
          </Link>
        </div>
      )}
    </div>
  );
}

// Left-border accent per normalized segment (lowercase, spaces→underscores)
const SEG_LEFT_COLOR: Record<string, string> = {
  overdue:   'var(--crm-danger)',
  due_today: 'var(--crm-amber)',
  at_risk:   '#C05621',
  due_soon:  'var(--crm-blue)',
  dormant:   'var(--crm-muted)',
  active:    'var(--crm-success)',
  new:       'var(--crm-blue)',
  lost:      'var(--crm-muted)',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function QueuePage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    resolveTab(searchParams.get('segment'), searchParams.get('tab'))
  );
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [logCallItem, setLogCallItem] = useState<any | null>(null);

  // Sync tab from URL params
  useEffect(() => {
    const t = resolveTab(searchParams.get('segment'), searchParams.get('tab'));
    setActiveTab(t);
    setPage(1);
  }, [searchParams]);

  // Reset page on tab or search change
  useEffect(() => { setPage(1); }, [activeTab, search]);

  const tabCfg = TABS.find(t => t.key === activeTab) ?? TABS[0];

  const { data = [], isLoading } = useQuery({
    queryKey: ['crm-queue', tabCfg.apiTab],
    queryFn: () => api.getCrmQueue(tabCfg.apiTab),
  });

  // Client-side search filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data as any[];
    return (data as any[]).filter(item =>
      (item.user?.name ?? '').toLowerCase().includes(q) ||
      (item.user?.phone ?? '').includes(q)
    );
  }, [data, search]);

  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      {/* Header */}
      <div
        className="px-7 py-5"
        style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1
              className="text-[20px] font-semibold"
              style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}
            >
              Call Queue
            </h1>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
              {isLoading ? 'Loading…' : `${filtered.length} customers`}
              {search && ` matching "${search}"`}
              {` · `}
              <span style={{ color: tabCfg.color }}>{tabCfg.label}</span>
            </p>
          </div>

          {/* Search */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)' }}
          >
            <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--crm-muted)' }} />
            <input
              type="text"
              placeholder="Name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none text-[12px] w-36"
              style={{ color: 'var(--crm-ink)' }}
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X className="h-3 w-3" style={{ color: 'var(--crm-muted)' }} />
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setPage(1); }}
                className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium rounded-lg whitespace-nowrap transition-all flex-shrink-0"
                style={active
                  ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)', fontWeight: 600 }
                  : { color: 'var(--crm-muted)', background: 'transparent' }}
              >
                <t.icon className="h-3.5 w-3.5" style={{ color: active ? 'var(--crm-gold)' : t.color }} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="p-7 space-y-2.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-7 w-7 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : !pageItems.length ? (
          <EmptyState
            icon={tabCfg.icon}
            title={search ? 'No matches' : 'All clear'}
            body={search ? `No customers match "${search}"` : `No customers in ${tabCfg.label.toLowerCase()}`}
          />
        ) : (
          pageItems.map((item: any) => (
            <CustomerRow
              key={item._id ?? item.userId}
              item={item}
              onLogCall={setLogCallItem}
              queueKey={tabCfg.apiTab}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && !isLoading && (
        <div
          className="flex items-center justify-between px-7 py-4"
          style={{ borderTop: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }}
        >
          <button
            onClick={() => setPage(p => Math.max(p - 1, 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-30"
            style={{ background: 'var(--crm-sand)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>
            Page {page} of {totalPages} · {filtered.length} customers
          </p>
          <button
            onClick={() => setPage(p => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-30"
            style={{ background: 'var(--crm-sand)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {logCallItem && (
        <LogCallPanel
          item={logCallItem}
          onClose={() => setLogCallItem(null)}
          queueKey={tabCfg.apiTab}
        />
      )}
    </div>
  );
}
