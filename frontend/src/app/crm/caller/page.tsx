'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Phone, ChevronLeft, ChevronRight, SkipForward,
  Clock, Flame, AlertTriangle, BellOff, TrendingDown, CheckCircle2, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, segmentLabel, displayName, formatPhone } from '@/lib/crm/format';
import { CustomerAvatar } from '@/components/crm/CustomerAvatar';
import { Pill } from '@/components/crm/Pill';
import { LateBar } from '@/components/crm/LateBar';
import { LogCallPanel } from '@/components/crm/LogCallPanel';
import type { PillVariant } from '@/components/crm/Pill';

// ─── Segment tabs for caller mode ────────────────────────────────────────────

const SEGMENTS = [
  { apiTab: 'today',    label: 'Due Today',  icon: Clock,          color: 'var(--crm-amber)' },
  { apiTab: 'overdue',  label: 'Overdue',    icon: Flame,          color: 'var(--crm-danger)' },
  { apiTab: 'at_risk',  label: 'At Risk',    icon: AlertTriangle,  color: '#C05621' },
  { apiTab: 'upcoming', label: 'Due Soon',   icon: BellOff,        color: 'var(--crm-blue)' },
  { apiTab: 'dormant',  label: 'Dormant',    icon: TrendingDown,   color: 'var(--crm-muted)' },
] as const;

type ApiTab = (typeof SEGMENTS)[number]['apiTab'];

function segPillVariant(segment: string): PillVariant {
  const s = segment.toLowerCase().replace(/\s/g, '_');
  if (s === 'overdue') return 'overdue';
  if (s === 'due_soon') return 'upcoming';
  if (s === 'due_today') return 'dueToday';
  if (s === 'at_risk') return 'warn';
  if (s === 'active' || s === 'new') return 'success';
  return 'neutral';
}

// ─── Customer card ────────────────────────────────────────────────────────────

function CustomerCard({ item }: { item: any }) {
  const name = displayName(item.user?.name, item.user?.phone);
  const phone = item.user?.phone ?? '';
  const segment = item.segment ?? '';

  const now = Date.now();
  const reorderMs = item.predictedReorderDate
    ? new Date(item.predictedReorderDate).getTime() : null;
  const daysDiff = reorderMs ? Math.round((now - reorderMs) / 86_400_000) : 0;
  const daysLate = Math.max(daysDiff, 0);
  const daysUntil = daysDiff < 0 ? Math.abs(daysDiff) : 0;

  const lastOrderDate = item.lastOrderAt
    ? new Date(item.lastOrderAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      className="w-full max-w-md rounded-2xl overflow-hidden"
      style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}
    >
      {/* Top accent */}
      <div className="h-1 w-full" style={{ background: 'var(--crm-gold)' }} />

      <div className="p-7 text-center">
        {/* Avatar */}
        <div className="flex justify-center mb-4">
          <CustomerAvatar name={item.user?.name} isVip={item.isVip} size={80} />
        </div>

        {/* Name */}
        <h2
          className="text-[22px] font-semibold leading-tight mb-1"
          style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}
        >
          {name}
        </h2>

        {/* Segment + VIP */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <Pill variant={segPillVariant(segment)}>{segmentLabel(segment)}</Pill>
          {item.isVip && <Pill variant="vip">VIP</Pill>}
        </div>

        {/* Phone — prominent */}
        <a
          href={`tel:${phone}`}
          className="flex items-center justify-center gap-2 mx-auto mb-5 px-5 py-3 rounded-xl font-semibold text-[16px] transition-opacity hover:opacity-80"
          style={{
            background: 'var(--crm-forest)',
            color: 'var(--crm-gold)',
            width: 'fit-content',
          }}
        >
          <Phone className="h-4 w-4" />
          {formatPhone(phone) || 'No phone'}
        </a>

        {/* Stats row */}
        <div
          className="grid grid-cols-3 gap-px rounded-xl overflow-hidden"
          style={{ background: 'var(--crm-line)' }}
        >
          {[
            { label: 'LTV', value: formatINR(item.ltv ?? 0) },
            { label: 'Orders', value: String(item.orderCount ?? 0) },
            { label: 'Overdue', value: <LateBar daysLate={daysLate} daysUntil={daysUntil} /> },
          ].map(stat => (
            <div
              key={stat.label}
              className="flex flex-col items-center py-3 px-2"
              style={{ background: 'var(--crm-sand)' }}
            >
              <div
                className="crm-display text-[15px] font-semibold mb-0.5"
                style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces)' }}
              >
                {stat.value}
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--crm-muted)' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Last order + top product */}
        {(lastOrderDate || item.topProduct || item.topCategory) && (
          <div className="mt-4 space-y-1">
            {lastOrderDate && (
              <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>
                Last order: <span style={{ color: 'var(--crm-ink-2)' }}>{lastOrderDate}</span>
              </p>
            )}
            {(item.topProduct || item.topCategory) && (
              <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>
                Buys: <span style={{ color: 'var(--crm-ink-2)' }}>{item.topProduct ?? item.topCategory}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* View profile link */}
      <div style={{ borderTop: '1px solid var(--crm-line)' }}>
        <Link
          href={`/crm/customers/${item.userId}`}
          className="flex items-center justify-center gap-1.5 py-3 text-[12px] font-medium transition-opacity hover:opacity-70"
          style={{ color: 'var(--crm-muted)' }}
        >
          View full profile <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── Done state ───────────────────────────────────────────────────────────────

function DoneCard({ label, onReset }: { label: string; onReset: () => void }) {
  return (
    <div
      className="w-full max-w-md rounded-2xl p-10 text-center"
      style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}
    >
      <div
        className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: 'var(--crm-success-bg)' }}
      >
        <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--crm-success)' }} />
      </div>
      <p
        className="text-[20px] font-semibold mb-1"
        style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces)' }}
      >
        Queue cleared!
      </p>
      <p className="text-[13px] mb-6" style={{ color: 'var(--crm-muted)' }}>
        All {label.toLowerCase()} customers called.
      </p>
      <button
        onClick={onReset}
        className="px-5 py-2.5 rounded-xl text-[13px] font-semibold"
        style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
      >
        Start over
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallerPage() {
  const [apiTab, setApiTab] = useState<ApiTab>('today');
  const [index, setIndex] = useState(0);
  const [panelItem, setPanelItem] = useState<any | null>(null);

  const seg = SEGMENTS.find(s => s.apiTab === apiTab) ?? SEGMENTS[0];

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['crm-queue', apiTab],
    queryFn: () => api.getCrmQueue(apiTab),
  });

  const queue = data as any[];
  const total = queue.length;
  const current = queue[index] ?? null;
  const done = !isLoading && total > 0 && index >= total;
  const empty = !isLoading && total === 0;

  // Reset index when segment changes
  useEffect(() => { setIndex(0); }, [apiTab]);

  const next = useCallback(() => setIndex(i => Math.min(i + 1, total)), [total]);
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (panelItem) return; // panel handles its own keys
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'n') next();
      if (e.key === 'ArrowLeft' || e.key === 'p') prev();
      if ((e.key === 'l' || e.key === 'Enter') && current) setPanelItem(current);
      if (e.key === 'c' && current?.user?.phone) {
        window.location.href = `tel:${current.user.phone}`;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, panelItem, next, prev]);

  const pct = total > 0 ? Math.round((index / total) * 100) : 0;

  return (
    <div className="min-h-full flex flex-col" style={{ background: 'var(--crm-sand)' }}>
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between gap-4"
        style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/crm/queue"
            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--crm-sand)', color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }}
            title="Exit caller mode"
          >
            <X className="h-4 w-4" />
          </Link>
          <div>
            <h1
              className="text-[15px] font-semibold leading-none"
              style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-sans, DM Sans, system-ui)' }}
            >
              Caller Mode
            </h1>
            {!isLoading && total > 0 && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
                {Math.min(index + 1, total)} of {total} · {seg.label}
              </p>
            )}
          </div>
        </div>

        {/* Segment tabs — scrollable */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 justify-end">
          {SEGMENTS.map(s => {
            const active = s.apiTab === apiTab;
            return (
              <button
                key={s.apiTab}
                onClick={() => setApiTab(s.apiTab)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all flex-shrink-0"
                style={active
                  ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' }
                  : { color: 'var(--crm-muted)' }}
              >
                <s.icon className="h-3 w-3" style={{ color: active ? 'var(--crm-gold)' : s.color }} />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1 w-full" style={{ background: 'var(--crm-sand-2)' }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'var(--crm-gold)' }}
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
        {isLoading ? (
          <div
            className="h-8 w-8 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }}
          />
        ) : done ? (
          <DoneCard label={seg.label} onReset={() => { setIndex(0); refetch(); }} />
        ) : empty ? (
          <div
            className="w-full max-w-md rounded-2xl p-10 text-center"
            style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}
          >
            <p className="text-[18px] font-semibold mb-1" style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif)' }}>
              All clear
            </p>
            <p className="text-[13px]" style={{ color: 'var(--crm-muted)' }}>
              No customers in {seg.label.toLowerCase()}
            </p>
          </div>
        ) : current ? (
          <CustomerCard item={current} />
        ) : null}

        {/* Nav + action buttons */}
        {current && !done && (
          <div className="flex items-center gap-3">
            <button
              onClick={prev}
              disabled={index === 0}
              className="h-10 w-10 rounded-xl flex items-center justify-center disabled:opacity-30 transition-opacity"
              style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)', color: 'var(--crm-muted)' }}
              title="Previous (← / P)"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              onClick={() => setPanelItem(current)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}
              title="Log call (L / Enter)"
            >
              Log call <span className="text-[10px] opacity-60 font-normal">L</span>
            </button>

            <button
              onClick={next}
              disabled={index >= total - 1}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-medium disabled:opacity-30 transition-opacity"
              style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)', color: 'var(--crm-ink-2)' }}
              title="Skip (→ / N)"
            >
              Skip <SkipForward className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setIndex(i => Math.min(i + 1, total))}
              className="h-10 w-10 rounded-xl flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)', color: 'var(--crm-muted)' }}
              title="Next (→ / N)"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Keyboard hint */}
        {current && !done && (
          <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>
            <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)' }}>C</kbd> call &nbsp;
            <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)' }}>L</kbd> log &nbsp;
            <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)' }}>→</kbd> skip &nbsp;
            <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--crm-sand-2)', color: 'var(--crm-ink-2)' }}>←</kbd> back
          </p>
        )}
      </div>

      {/* Log call panel */}
      {panelItem && (
        <LogCallPanel
          item={panelItem}
          onClose={() => setPanelItem(null)}
          queueKey={apiTab}
          onSaved={next}
        />
      )}
    </div>
  );
}
