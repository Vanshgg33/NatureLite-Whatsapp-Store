'use client';

import { Suspense, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ExternalLink } from 'lucide-react';

import { api } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/fms/purchase/page-header';
import { StageBadge, WaitChip } from '@/components/fms/purchase/chips';
import { KpiStrip, PipelineStrip } from '@/components/fms/purchase/kpi-strip';
import { RequestCard } from '@/components/fms/purchase/request-card';
import { RequestTable } from '@/components/fms/purchase/request-table';
import { AttentionList, CategoryMix, buildAlerts } from '@/components/fms/purchase/attention-list';
import { getStage, getOverdueMs, Stage } from '@/lib/fms/stage';
import { fmtDate, shortPr } from '@/lib/fms/format';
import { parseTagsParam, buildTagsParam } from './tag-filter-utils';
import Loading from './loading';

// ─── Board view ──────────────────────────────────────────────────────────────

const BOARD_COLS: { key: Stage; label: string; dot: string }[] = [
  { key: 'NEEDS_PO',          label: 'Needs PO',         dot: '#D9902B' },
  { key: 'AWAITING_APPROVAL', label: 'Awaiting approval', dot: '#2F6FB5' },
  { key: 'AWAITING_DELIVERY', label: 'Awaiting delivery', dot: '#7B8780' },
  { key: 'READY_TO_CLOSE',    label: 'Ready to close',    dot: '#2F8A57' },
];

function BoardView({ requests, onListToggle }: { requests: any[]; onListToggle: () => void }) {
  const open = requests.filter(r => {
    const s = getStage(r);
    return s !== 'CLOSED' && s !== 'CANCELLED' && s !== 'DRAFT';
  });
  const hasOverdue = open.some(r => getOverdueMs(r, getStage(r)) !== null);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-7 pt-6 pb-4 gap-4 flex-wrap">
        <div>
          <h1 className="font-fraunces text-[28px] font-semibold text-fms-ink">Purchase requests</h1>
          <p className="text-sm text-fms-muted font-jakarta mt-0.5">{open.length} open requests</p>
        </div>
        <div className="flex items-center gap-2">
          {hasOverdue && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full font-jakarta" style={{ background: '#FDECEA', color: '#A3241A' }}>
              Overdue · {open.filter(r => getOverdueMs(r, getStage(r)) !== null).length}
            </span>
          )}
          <button
            onClick={onListToggle}
            className="text-xs font-medium text-fms-muted hover:text-fms-ink font-jakarta px-3 py-1.5 rounded-fms-control border border-fms-line2 transition-colors"
          >
            ← List view
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto px-7 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {BOARD_COLS.map(({ key, label, dot }) => {
            const col = open.filter(r => getStage(r) === key);
            return (
              <div key={key} className="w-72 flex flex-col gap-3 rounded-fms-card p-3" style={{ background: '#EFEDE6' }}>
                <div className="flex items-center gap-2 px-1">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: dot }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-fms-muted font-jakarta">{label}</span>
                  <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-white text-fms-ink font-jakarta shadow-sm">
                    {col.length}
                  </span>
                </div>
                {col.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-8">
                    <p className="text-xs text-fms-muted font-jakarta text-center px-4">Nothing here right now.</p>
                  </div>
                ) : (
                  col.map(r => <RequestCard key={r._id} req={r} />)
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile S8 ───────────────────────────────────────────────────────────────

function MobileQueue({ requests, summary }: { requests: any[]; summary: any }) {
  const open = requests.filter(r => {
    const s = getStage(r);
    return s !== 'CLOSED' && s !== 'CANCELLED' && s !== 'DRAFT';
  });
  const byStage = summary?.byStage || {};
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    /* extra pb-16 to clear the fixed bottom tab bar */
    <div className="flex flex-col h-full bg-fms-page pb-16">
      {/* Dark header */}
      <div className="px-4 pt-5 pb-4 rounded-b-[20px]" style={{ background: '#17382A' }}>
        <p className="text-white/50 text-xs font-jakarta mb-0.5">{dateStr}</p>
        <h1 className="text-white font-fraunces text-[26px] font-semibold leading-tight">
          {summary?.myAction ?? open.length} waiting on you
        </h1>
        <div className="flex gap-2 mt-3">
          {[
            { label: 'Need PO',  val: byStage['NEEDS_PO'] || 0,          bg: '#FDF3E3', text: '#8A4B06' },
            { label: 'Approve',  val: byStage['AWAITING_APPROVAL'] || 0,  bg: '#EDF3FB', text: '#1F4F8A' },
            { label: 'Overdue',  val: summary?.overdue || 0,              bg: '#FDECEA', text: '#A3241A' },
          ].map(({ label, val, bg, text }) => (
            <div key={label} className="flex-1 rounded-fms-control p-2 text-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <p className="text-[10px] font-jakarta" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
              <p className="text-xl font-semibold font-fraunces" style={{ color: val > 0 ? bg : 'white' }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-auto px-4 pt-4 space-y-3">
        {open.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-fms-muted font-jakarta">Nothing in the queue.</p>
          </div>
        ) : (
          open.map(r => <RequestCard key={r._id} req={r} />)
        )}
      </div>
    </div>
  );
}

// ─── Item-level view (shown when tags are selected) ──────────────────────────

const ITEM_STAGE_META: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  NEEDS_PO:          { label: 'Needs PO',         dot: '#D9902B', bg: '#FDF3E3', text: '#8A4B06' },
  AWAITING_APPROVAL: { label: 'Awaiting approval', dot: '#2F6FB5', bg: '#EDF3FB', text: '#1F4F8A' },
  AWAITING_DELIVERY: { label: 'Awaiting delivery', dot: '#7B8780', bg: '#F2F4F3', text: '#3E4A43' },
  PARTLY_RECEIVED:   { label: 'Partly received',   dot: '#8A4B06', bg: '#FDF3E3', text: '#8A4B06' },
  READY_TO_CLOSE:    { label: 'Ready to close',    dot: '#2F8A57', bg: '#EAF3EE', text: '#1E5E3F' },
  CLOSED:            { label: 'Closed',             dot: '#3E4A43', bg: '#F2F4F3', text: '#3E4A43' },
  DROPPED:           { label: 'Dropped',            dot: '#B0B8B3', bg: '#F7F6F2', text: '#8A9490' },
};

// Derive the effective stage of a single item line from aggregation result
function itemLineStage(item: any): keyof typeof ITEM_STAGE_META {
  if (item.lineStatus === 'DROPPED') return 'DROPPED';
  if (!item.lineStatus || item.lineStatus === 'NEEDS_PO') return 'NEEDS_PO';
  // PO_RAISED: parent's stage reflects rollup; if parent is still NEEDS_PO (partial split),
  // this line is in AWAITING_APPROVAL since it was just moved to a child PO
  const s = item.stage as string;
  if (!s || s === 'NEEDS_PO' || s === 'DRAFT') return 'AWAITING_APPROVAL';
  return (ITEM_STAGE_META[s] ? s : 'AWAITING_APPROVAL') as keyof typeof ITEM_STAGE_META;
}

const STAGE_SLA_DAYS: Partial<Record<string, number>> = {
  NEEDS_PO: 2, AWAITING_APPROVAL: 1, AWAITING_DELIVERY: 5, PARTLY_RECEIVED: 5, READY_TO_CLOSE: 1,
};

function waitDays(item: any): number {
  const from = item.stageEnteredAt ?? item.createdAt;
  if (!from) return 0;
  return Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000);
}

function ItemView({ items, loading }: { items: any[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 border-2 border-[#1E5E3F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Summary counts by derived stage
  const stageCounts: Partial<Record<string, number>> = {};
  for (const item of items) {
    const s = itemLineStage(item);
    stageCounts[s] = (stageCounts[s] ?? 0) + 1;
  }
  const summaryStages = Object.entries(stageCounts).filter(([, n]) => n! > 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summaryStages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summaryStages.map(([stage, count]) => {
            const m = ITEM_STAGE_META[stage] ?? ITEM_STAGE_META.NEEDS_PO;
            return (
              <div key={stage} className="flex items-center gap-2 px-3 py-2 rounded-[10px] border border-[#ECE9E1] bg-white shadow-[0_1px_2px_rgba(24,33,28,.04)]">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: m.dot }} />
                <span className="text-xs font-jakarta text-[#66706A]">{m.label}</span>
                <span className="text-xs font-semibold font-jetbrains" style={{ color: m.text }}>{count}</span>
              </div>
            );
          })}
          <div className="flex items-center px-3 py-2 rounded-[10px] border border-[#ECE9E1] bg-white shadow-[0_1px_2px_rgba(24,33,28,.04)]">
            <span className="text-xs font-jakarta text-[#8A9490]">Total</span>
            <span className="ml-2 text-xs font-semibold font-jetbrains text-[#18211C]">{items.length} lines</span>
          </div>
        </div>
      )}

      {/* Item table */}
      <div className="bg-white rounded-fms-card border border-fms-line shadow-[0_1px_2px_rgba(24,33,28,.06)] overflow-hidden">
        {items.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-fms-muted font-jakarta">No items match the selected tags.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-fms-line bg-[#FAFAF8]">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-fms-muted uppercase tracking-[0.06em] font-jakarta">Material</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-fms-muted uppercase tracking-[0.06em] font-jakarta">Qty</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-fms-muted uppercase tracking-[0.06em] font-jakarta">Request</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-fms-muted uppercase tracking-[0.06em] font-jakarta">Stage</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-fms-muted uppercase tracking-[0.06em] font-jakarta">Waiting</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => {
                  const stage = itemLineStage(item);
                  const meta  = ITEM_STAGE_META[stage];
                  const days  = waitDays(item);
                  const sla   = STAGE_SLA_DAYS[stage];
                  const overdue = sla !== undefined && days > sla;
                  const linkTarget = item.lineStatus === 'PO_RAISED' && item.childPoId
                    ? `/fms/purchase/${item.childPoId}`
                    : `/fms/purchase/${item.reqId}`;

                  return (
                    <tr key={item._id ?? idx} className="border-b border-fms-line last:border-0 hover:bg-[#FAFAF8] transition-colors">
                      {/* Material */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-fms-ink font-jakarta text-sm">{item.materialName}</p>
                        {item.tagName && (
                          <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-jakarta px-1.5 py-0.5 rounded-full"
                            style={{ background: item.tagColor ? `${item.tagColor}22` : '#F7F6F2', color: item.tagColor ?? '#66706A' }}>
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: item.tagColor ?? '#8A9490' }} />
                            {item.tagName}
                          </span>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="px-4 py-3 text-right font-jetbrains text-sm text-fms-ink whitespace-nowrap">
                        {item.qty} <span className="text-fms-muted text-xs">{item.uom ?? 'kg'}</span>
                      </td>

                      {/* Request / PO */}
                      <td className="px-4 py-3">
                        <Link href={`/fms/purchase/${item.reqId}`}
                          className="text-[#1E5E3F] hover:underline font-jetbrains text-xs font-medium">
                          {shortPr(item.reqNo)}
                        </Link>
                        {item.lineStatus === 'PO_RAISED' && item.childPoId && (
                          <Link href={`/fms/purchase/${item.childPoId}`}
                            className="ml-2 text-[10px] text-[#2F6FB5] hover:underline font-jakarta inline-flex items-center gap-0.5">
                            PO <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </td>

                      {/* Stage chip */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium font-jakarta"
                          style={{ background: meta.bg, color: meta.text }}>
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: meta.dot }} />
                          {meta.label}
                        </span>
                      </td>

                      {/* Waiting */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {stage !== 'DROPPED' && stage !== 'CLOSED' ? (
                          <span className={`text-xs font-jetbrains font-medium ${overdue ? 'text-[#A3241A]' : 'text-fms-muted'}`}>
                            {days}d{overdue ? ' !' : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-fms-muted font-jakarta">—</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <Link href={linkTarget}
                          className="text-xs text-[#1E5E3F] hover:underline font-jakarta font-medium">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

function PurchasePageInner() {
  const { user } = useAdminAuthStore();
  const router = useRouter();
  const params = useSearchParams();
  const isBoard = params.get('view') === 'board';

  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [search, setSearch] = useState('');
  const selectedTagNames = parseTagsParam(params.get('tags'));

  const { data: summary } = useQuery({
    queryKey: ['purchase-summary'],
    queryFn: () => api.getPurchaseSummary(),
    refetchInterval: 15000,
  });

  const { data: rawRequests = [], isLoading } = useQuery({
    queryKey: ['purchase-requests'],
    queryFn: () => api.getPurchaseRequests(),
    refetchInterval: 15000,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['purchase-tags'],
    queryFn: () => api.getPurchaseTags(),
    staleTime: 60_000,
  });

  const { data: tagItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['purchase-items', selectedTagNames],
    queryFn: () => api.getPurchaseItems({ tags: selectedTagNames.join(',') }),
    enabled: selectedTagNames.length > 0,
    staleTime: 15_000,
  });

  // Count items per tag name from cached requests (no extra call)
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rawRequests) {
      for (const item of (r.items ?? [])) {
        if (item.tagName && item.lineStatus !== 'DROPPED') {
          counts[item.tagName] = (counts[item.tagName] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [rawRequests]);

  const requests = search
    ? rawRequests.filter((r: any) =>
        r.reqNo?.toLowerCase().includes(search.toLowerCase()) ||
        r.items?.some((i: any) => i.materialName?.toLowerCase().includes(search.toLowerCase()))
      )
    : rawRequests;

  const canCreate = user?.purchaseRole === 'requester' || user?.role === 'superadmin' || (!user?.storeId && user?.role === 'admin');

  const alerts = buildAlerts(requests);

  const subtitle = summary
    ? `${summary.counts.open} open · ${summary.pipelineKg.toLocaleString('en-IN')} kg on order${summary.oldestOpen ? ` · oldest ${summary.oldestOpen.days} d` : ''}`
    : undefined;

  if (isLoading) return <Loading />;

  // ── Board view ──
  if (isBoard) {
    return (
      <BoardView
        requests={requests}
        onListToggle={() => router.push('/fms/purchase')}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-fms-page">
      {/* ── Desktop: S1 ── */}
      <div className="hidden md:block">
        <PageHeader
          title={summary?.myAction ? `${summary.myAction} request${summary.myAction !== 1 ? 's' : ''} need you` : 'Purchase requests'}
          subtitle={subtitle}
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fms-muted pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="PR no, material…"
                  className="pl-8 pr-3 py-1.5 text-xs font-jakarta rounded-fms-control border border-fms-line2 bg-white focus:outline-none focus:ring-2 focus:ring-fms-brand focus:ring-offset-1 w-48"
                />
              </div>
              {canCreate && (
                <Link href="/fms/purchase/new">
                  <Button size="sm" className="text-xs font-jakarta rounded-fms-control text-white" style={{ background: '#1E5E3F' }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New Request
                  </Button>
                </Link>
              )}
            </div>
          }
        />

        <div className="px-7 pb-7 space-y-5">
          {summary && <KpiStrip summary={summary} />}

          {summary?.byStage && (
            <PipelineStrip
              byStage={summary.byStage}
              activeFilter={stageFilter}
              onFilter={setStageFilter}
            />
          )}

          {/* Tag filter bar */}
          {(tags as any[]).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap -mt-2">
              <button
                onClick={() => router.push('/fms/purchase')}
                className="px-3 py-1 rounded-full text-xs font-medium border font-jakarta transition-colors"
                style={!selectedTagNames.length ? { background: '#1E5E3F', color: '#fff', borderColor: '#1E5E3F' } : { background: '#fff', color: '#66706A', borderColor: '#ECE9E1' }}>
                All
              </button>
              {(tags as any[]).map((t: any) => {
                const active = selectedTagNames.includes(t.name);
                const next = active
                  ? selectedTagNames.filter(n => n !== t.name)
                  : [...selectedTagNames, t.name];
                const count = tagCounts[t.name];
                return (
                  <button key={t._id}
                    onClick={() => router.push(next.length ? `/fms/purchase?tags=${buildTagsParam(next)}` : '/fms/purchase')}
                    className="px-3 py-1 rounded-full text-xs font-medium border font-jakarta transition-colors inline-flex items-center gap-1.5"
                    style={active ? { background: t.color, color: '#fff', borderColor: t.color } : { background: '#fff', color: '#66706A', borderColor: '#ECE9E1' }}>
                    {t.name}
                    {count != null && count > 0 && (
                      <span className="text-[10px] font-jetbrains" style={active ? { opacity: 0.85 } : { color: '#8A9490' }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {selectedTagNames.length > 0 ? (
            /* ── Tag item view ── */
            <ItemView items={tagItems} loading={itemsLoading} />
          ) : (
            /* ── Normal attention + table ── */
            <>
              <div className="grid grid-cols-5 gap-5">
                <div className="col-span-3">
                  <p className="text-[11px] font-semibold text-fms-muted uppercase tracking-[0.07em] font-jakarta mb-2">Needs attention</p>
                  <AttentionList alerts={alerts} />
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-semibold text-fms-muted uppercase tracking-[0.07em] font-jakarta mb-2">By category (kg)</p>
                  <div className="bg-fms-surface rounded-fms-card border border-fms-line p-4 shadow-[0_1px_2px_rgba(24,33,28,.06)]">
                    <CategoryMix mix={summary?.mixByCategory || []} />
                  </div>
                </div>
              </div>

              {summary?.counts && (
                <RequestTable
                  requests={requests}
                  counts={summary.counts}
                  stageFilter={stageFilter}
                  onBoardToggle={() => router.push('/fms/purchase?view=board')}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Mobile: S8 ── */}
      <div className="block md:hidden h-full">
        <MobileQueue requests={requests} summary={summary} />
      </div>
    </div>
  );
}

export default function FmsPurchasePage() {
  return (
    <Suspense fallback={<Loading />}>
      <PurchasePageInner />
    </Suspense>
  );
}
