'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { formatINR, segmentLabel } from '@/lib/crm/format';
import { CustomerAvatar } from './CustomerAvatar';
import { Pill } from './Pill';
import type { PillVariant } from './Pill';

// ─── Outcome config ───────────────────────────────────────────────────────────

export const CALL_OUTCOMES = [
  { value: 'connected',      label: 'Connected',      key: '1', color: 'var(--crm-blue)',    pillVariant: 'upcoming' as PillVariant },
  { value: 'ordered',        label: 'Ordered ✓',      key: '2', color: 'var(--crm-success)', pillVariant: 'success'  as PillVariant },
  { value: 'no_answer',      label: 'No Answer',      key: '3', color: 'var(--crm-muted)',   pillVariant: 'neutral'  as PillVariant },
  { value: 'not_interested', label: 'Not Interested', key: '4', color: 'var(--crm-danger)',  pillVariant: 'overdue'  as PillVariant },
  { value: 'callback',       label: 'Callback',       key: '5', color: 'var(--crm-amber)',   pillVariant: 'dueToday' as PillVariant },
] as const;

// Map segment → Pill variant (reused from queue page)
function segToPill(segment: string): PillVariant {
  const s = segment.toLowerCase().replace(/\s/g, '_');
  if (s === 'overdue') return 'overdue';
  if (s === 'due_soon') return 'upcoming';
  if (s === 'due_today') return 'dueToday';
  if (s === 'at_risk') return 'warn';
  if (s === 'active' || s === 'new') return 'success';
  return 'neutral';
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LogCallPanelProps {
  /** Full queue row item (has .user, .segment, .ltv, etc.) */
  item: any;
  onClose: () => void;
  /** React Query key to invalidate on success, e.g. 'today' */
  queueKey: string;
  /** Called immediately on successful save (before close animation) */
  onSaved?: () => void;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function LogCallPanel({ item, onClose, queueKey, onSaved }: LogCallPanelProps) {
  const [outcome, setOutcome] = useState<string>('connected');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [visible, setVisible] = useState(false);

  const { toast } = useToast();
  const qc = useQueryClient();

  // Slide in after mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const closePanel = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      api.logCrmCall({
        customerId: item.userId,
        outcome,
        notes: notes.trim() || undefined,
        callbackAt: callbackAt || undefined,
      }),
    onSuccess: () => {
      const o = CALL_OUTCOMES.find(o => o.value === outcome);
      toast({ title: outcome === 'ordered' ? '✓ Order conversion logged!' : `Call logged · ${o?.label}` });
      qc.invalidateQueries({ queryKey: ['crm-queue', queueKey] });
      qc.invalidateQueries({ queryKey: ['crm-metrics'] });
      onSaved?.();
      closePanel();
    },
    onError: () => toast({ title: 'Failed to log call', variant: 'destructive' }),
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
      if (e.key === 'Escape') { closePanel(); return; }
      if (inInput) return;
      const byKey = CALL_OUTCOMES.find(o => o.key === e.key);
      if (byKey) { setOutcome(byKey.value); return; }
      if (e.key === 'Enter' && !isPending) mutate();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closePanel, isPending, mutate]);

  const name = item.user?.name ?? item.user?.phone ?? '—';
  const phone = item.user?.phone ?? '';
  const segment = item.segment ?? '';
  const isOrdered = outcome === 'ordered';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(19,36,27,0.45)',
          backdropFilter: 'blur(2px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms',
        }}
        onClick={closePanel}
      />

      {/* Side panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col w-full sm:w-[380px]"
        style={{
          background: 'var(--crm-paper)',
          borderLeft: '1px solid var(--crm-line)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Log call"
      >
        {/* Header bar — forest bg when ordered, normal otherwise */}
        <div
          className="px-5 py-4 flex items-center justify-between transition-colors duration-300"
          style={{
            background: isOrdered ? 'var(--crm-success)' : 'var(--crm-forest)',
            borderBottom: '1px solid var(--crm-line)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <CustomerAvatar name={name} isVip={item.isVip} size={36} />
            <div className="min-w-0">
              <p
                className="font-semibold text-[14px] truncate"
                style={{ color: isOrdered ? 'var(--crm-paper)' : 'var(--crm-cream)' }}
              >
                {name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <Pill variant={segToPill(segment)}>{segmentLabel(segment)}</Pill>
                <span className="text-[11px]" style={{ color: isOrdered ? 'rgba(255,255,255,0.7)' : 'var(--crm-on-dark-muted)' }}>
                  LTV {formatINR(item.ltv ?? 0)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {phone && (
              <a
                href={`tel:${phone}`}
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{
                  background: isOrdered ? 'rgba(255,255,255,0.2)' : 'var(--crm-forest-2)',
                  color: isOrdered ? '#fff' : 'var(--crm-gold)',
                }}
                title={`Call ${phone}`}
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={closePanel}
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{
                background: isOrdered ? 'rgba(255,255,255,0.2)' : 'var(--crm-forest-2)',
                color: isOrdered ? '#fff' : 'var(--crm-on-dark-muted)',
              }}
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Outcome picker */}
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2"
              style={{ color: 'var(--crm-muted)' }}
            >
              Outcome <span className="normal-case font-normal tracking-normal">(press 1–5)</span>
            </p>
            <div className="space-y-1.5">
              {CALL_OUTCOMES.map(o => {
                const active = outcome === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => setOutcome(o.value)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all"
                    style={active
                      ? { background: `color-mix(in srgb, ${o.color} 12%, transparent)`, color: o.color, border: `1.5px solid color-mix(in srgb, ${o.color} 30%, transparent)` }
                      : { background: 'var(--crm-sand)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}
                  >
                    {/* Key hint */}
                    <span
                      className="text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={active
                        ? { background: o.color, color: '#fff' }
                        : { background: 'var(--crm-line)', color: 'var(--crm-muted)' }}
                    >
                      {o.key}
                    </span>
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: o.color }} />
                    {o.label}
                    {active && <span className="ml-auto text-[10px]" style={{ color: o.color }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Callback datetime — only for 'callback' */}
          {outcome === 'callback' && (
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5"
                style={{ color: 'var(--crm-muted)' }}
              >
                Callback time
              </p>
              <input
                type="datetime-local"
                value={callbackAt}
                onChange={e => setCallbackAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] focus:outline-none"
                style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)', background: 'var(--crm-sand)' }}
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5"
              style={{ color: 'var(--crm-muted)' }}
            >
              Notes
            </p>
            <textarea
              placeholder="Add a note… (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] resize-none focus:outline-none"
              style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)', background: 'var(--crm-sand)' }}
            />
          </div>

          {/* Ordered banner */}
          {isOrdered && (
            <div
              className="rounded-xl px-4 py-3 text-[13px] font-medium"
              style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }}
            >
              🎉 Mark this as a conversion — customer will move to Active segment after next engine run.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 flex gap-2.5"
          style={{ borderTop: '1px solid var(--crm-line)' }}
        >
          <button
            onClick={closePanel}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium"
            style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => mutate()}
            disabled={isPending}
            className="flex-[2] py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-50 transition-colors"
            style={{
              background: isOrdered ? 'var(--crm-success)' : 'var(--crm-forest)',
              color: isOrdered ? '#fff' : 'var(--crm-gold)',
            }}
          >
            {isPending ? 'Saving…' : 'Save call · Enter'}
          </button>
        </div>
      </div>
    </>
  );
}
