'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, ChevronLeft, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/utils';
import { formatINR, segmentLabel } from '@/lib/crm/format';
import { CustomerAvatar } from '@/components/crm/CustomerAvatar';
import { Pill } from '@/components/crm/Pill';
import { LateBar } from '@/components/crm/LateBar';
import { EmptyState } from '@/components/crm/EmptyState';
import type { PillVariant } from '@/components/crm/Pill';

// ─── Segment filter config ────────────────────────────────────────────────────

const SEGMENTS = [
  'new', 'active', 'due_soon', 'due_today',
  'overdue', 'at_risk', 'dormant', 'lost',
] as const;

function segPillVariant(segment: string): PillVariant {
  const s = (segment ?? '').toLowerCase().replace(/\s/g, '_');
  if (s === 'overdue') return 'overdue';
  if (s === 'due_soon') return 'upcoming';
  if (s === 'due_today') return 'dueToday';
  if (s === 'at_risk') return 'warn';
  if (s === 'active' || s === 'new') return 'success';
  return 'neutral';
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function CustomerRow({ item }: { item: any }) {
  const router = useRouter();
  const segment = item.segment ?? '';

  const now = Date.now();
  const reorderMs = item.predictedReorderDate
    ? new Date(item.predictedReorderDate).getTime() : null;
  const daysDiff = reorderMs ? Math.round((now - reorderMs) / 86_400_000) : 0;
  const daysLate = Math.max(daysDiff, 0);
  const daysUntil = daysDiff < 0 ? Math.abs(daysDiff) : 0;

  return (
    <button
      onClick={() => router.push(`/crm/customers/${item.userId}`)}
      className="w-full rounded-xl px-4 py-3.5 text-left transition-all group crm-count-in"
      style={{
        background: 'var(--crm-paper)',
        border: '1px solid var(--crm-line)',
        borderLeft: item.isEscalated ? '3px solid var(--crm-danger)' : undefined,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--crm-gold)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(212,160,23,0.08)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = item.isEscalated ? 'var(--crm-danger)' : 'var(--crm-line)';
        (e.currentTarget as HTMLElement).style.boxShadow = '';
      }}
    >
      <div
        className="grid items-center gap-3"
        style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 80px 100px 28px' }}
      >
        {/* Customer */}
        <div className="flex items-center gap-3 min-w-0">
          <CustomerAvatar name={item.user?.name} isVip={item.isVip} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-semibold text-[13px] truncate" style={{ color: 'var(--crm-ink)' }}>
                {item.user?.name ?? item.user?.phone ?? '—'}
              </p>
              {item.isEscalated && (
                <AlertTriangle className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--crm-danger)' }} />
              )}
            </div>
            <p className="text-[11px] font-mono truncate" style={{ color: 'var(--crm-muted)' }}>
              {item.user?.phone}
            </p>
          </div>
        </div>

        {/* Segment */}
        <div>
          {segment
            ? <Pill variant={segPillVariant(segment)}>{segmentLabel(segment)}</Pill>
            : <span className="text-[12px]" style={{ color: 'var(--crm-line)' }}>—</span>
          }
        </div>

        {/* LTV */}
        <p
          className="text-[13px] font-semibold crm-tabular"
          style={{ color: 'var(--crm-forest)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
        >
          {formatINR(item.ltv ?? 0)}
        </p>

        {/* Due / overdue bar */}
        <div>
          <LateBar daysLate={daysLate} daysUntil={daysUntil} />
        </div>

        {/* Arrow */}
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          style={{ background: 'var(--crm-sand)' }}
        >
          <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--crm-gold)' }} />
        </div>
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [issues, setIssues] = useState(false);
  const [page, setPage] = useState(1);
  const dSearch = useDebouncedValue(search, 350);

  function setSegmentFilter(s: string) {
    setSegment(s);
    setIssues(false);
    setPage(1);
  }
  function toggleIssues() {
    setIssues(v => !v);
    setSegment('');
    setPage(1);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['crm-customers', segment, dSearch, issues, page],
    queryFn: () => api.getCrmCustomers({
      segment: segment || undefined,
      search: dSearch || undefined,
      isEscalated: issues || undefined,
      page,
    }),
  });

  const items: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const pages: number = data?.pages ?? 1;

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
              Customers
            </h1>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
              {isLoading ? 'Loading…' : `${total} customers`}
              {issues && ' · escalated'}
              {segment && ` · ${segmentLabel(segment)}`}
            </p>
          </div>

          {/* Search */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)' }}
          >
            <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--crm-muted)' }} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Name or phone…"
              className="bg-transparent outline-none text-[12px] w-36"
              style={{ color: 'var(--crm-ink)' }}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="flex items-center gap-1 text-[11px] font-medium mr-1 flex-shrink-0"
            style={{ color: 'var(--crm-muted)' }}
          >
            <SlidersHorizontal className="h-3 w-3" />
          </span>

          {/* All */}
          <button
            onClick={() => { setSegmentFilter(''); setIssues(false); }}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0"
            style={!segment && !issues
              ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' }
              : { background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
          >
            All
          </button>

          {/* Issues (escalated) */}
          <button
            onClick={toggleIssues}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0"
            style={issues
              ? { background: 'var(--crm-danger-bg)', color: 'var(--crm-danger)', border: '1.5px solid color-mix(in srgb, var(--crm-danger) 30%, transparent)' }
              : { background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
          >
            <AlertTriangle className="h-3 w-3" />
            Issues
          </button>

          {/* Segment filters */}
          {SEGMENTS.map(s => {
            const active = segment === s;
            return (
              <button
                key={s}
                onClick={() => setSegmentFilter(active ? '' : s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0"
                style={active
                  ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' }
                  : { background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
              >
                {segmentLabel(s)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Column headers */}
      <div className="px-7 pt-5 pb-2">
        <div
          className="grid text-[10px] font-bold uppercase tracking-[0.15em] px-4"
          style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 80px 100px 28px', color: 'var(--crm-muted)' }}
        >
          <span>Customer</span>
          <span>Segment</span>
          <span>LTV</span>
          <span>Overdue</span>
          <span />
        </div>
      </div>

      {/* List */}
      <div className="px-7 pb-4 space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-7 w-7 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : !items.length ? (
          <EmptyState
            title="No customers found"
            body={issues ? 'No escalated customers' : segment ? `No customers in ${segmentLabel(segment)}` : 'Try adjusting your filters'}
          />
        ) : (
          items.map((item: any) => (
            <CustomerRow key={String(item.userId ?? item._id)} item={item} />
          ))
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && !isLoading && (
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
            Page {page} of {pages} · {total} customers
          </p>
          <button
            onClick={() => setPage(p => Math.min(p + 1, pages))}
            disabled={page === pages}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-30"
            style={{ background: 'var(--crm-sand)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
