'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';

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

// ─── Main page ───────────────────────────────────────────────────────────────

function PurchasePageInner() {
  const { user } = useAdminAuthStore();
  const router = useRouter();
  const params = useSearchParams();
  const isBoard = params.get('view') === 'board';

  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [search, setSearch] = useState('');

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

          {/* Two-column: attention + category mix */}
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

          {/* Request table with tabs */}
          {summary?.counts && (
            <RequestTable
              requests={requests}
              counts={summary.counts}
              stageFilter={stageFilter}
              onBoardToggle={() => router.push('/fms/purchase?view=board')}
            />
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
