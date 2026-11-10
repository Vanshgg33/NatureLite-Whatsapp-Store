'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Pill, type PillVariant } from '@/components/crm/Pill';
import { EmptyState } from '@/components/crm/EmptyState';

const CATEGORY: Record<string, string> = {
  damaged: 'Damaged / leaked', wrong_item: 'Wrong item', missing_item: 'Missing item', quality: 'Quality / expiry',
  late_delivery: 'Late delivery', delivery_behaviour: 'Delivery behaviour', payment: 'Payment / billing', other: 'Other',
};
const STATUS: Record<string, string> = {
  new: 'New', investigating: 'Investigating', awaiting_customer: 'Awaiting customer', resolved: 'Resolved', reopened: 'Reopened', closed: 'Closed',
};
const RESOLUTIONS = [
  { id: 'replacement', label: 'Send replacement' },
  { id: 'wallet_credit', label: 'Wallet credit' },
  { id: 'refund', label: 'Refund (manual)' },
  { id: 'apology', label: 'Apology only' },
  { id: 'rejected', label: 'Reject' },
];
const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'mine', label: 'Mine' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'resolved', label: 'Resolved' },
];

const OPEN = ['new', 'investigating', 'awaiting_customer', 'reopened'];

function dueLabel(c: any): { text: string; variant: PillVariant } {
  if (!OPEN.includes(c.status)) return { text: STATUS[c.status], variant: 'success' };
  const now = Date.now();
  if (!c.firstRespondedAt && new Date(c.firstResponseDueAt).getTime() < now) return { text: 'Reply overdue', variant: 'danger' };
  const left = new Date(c.resolutionDueAt).getTime() - now;
  if (left < 0) return { text: 'Overdue', variant: 'danger' };
  const h = Math.round(left / 3_600_000);
  return { text: h < 24 ? `${h}h left` : `${Math.round(h / 24)}d left`, variant: h < 6 ? 'dueToday' : 'neutral' };
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: c, isLoading } = useQuery({ queryKey: ['crm-complaint', id], queryFn: () => api.getCrmComplaint(id) });
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [resType, setResType] = useState('replacement');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm-complaint', id] });
    qc.invalidateQueries({ queryKey: ['crm-complaints'] });
  };
  const onError = (e: any) => {
    const m = e?.response?.data?.message;
    toast({ title: Array.isArray(m) ? m.join(', ') : (m ?? 'Failed'), variant: 'destructive' });
  };
  // WhatsApp only delivers free text within 24h of the customer's last message, so tell the agent when it didn't go through.
  const warnIfUndelivered = (r: any) => {
    if (r?.customerNotified === false) {
      toast({ title: 'Saved, but the WhatsApp message was not delivered', description: 'The customer has not messaged in the last 24 hours. Call them instead.', variant: 'destructive' });
    }
  };

  const reply = useMutation({
    mutationFn: () => api.replyCrmComplaint(id, text, internal),
    onSuccess: (r) => { setText(''); refresh(); warnIfUndelivered(r); },
    onError,
  });
  const { data: agents = [] } = useQuery({ queryKey: ['crm-complaint-agents'], queryFn: () => api.getCrmComplaintAgents() });
  const assign = useMutation({ mutationFn: (agentId: string) => api.assignCrmComplaint(id, agentId), onSuccess: refresh, onError });
  const status = useMutation({ mutationFn: (s: string) => api.setCrmComplaintStatus(id, s), onSuccess: refresh, onError });
  const resolve = useMutation({
    mutationFn: () => api.resolveCrmComplaint(id, { type: resType, reason, amount: amount ? Number(amount) : undefined }),
    onSuccess: (r) => {
      if (r?.customerNotified !== false) toast({ title: 'Ticket resolved, customer notified' });
      setReason(''); setAmount(''); refresh(); warnIfUndelivered(r);
    },
    onError,
  });

  const isOpen = c && OPEN.includes(c.status);
  const needsAmount = resType === 'wallet_credit' || resType === 'refund';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onClose}>
      <div className="w-full max-w-lg h-full flex flex-col" style={{ background: 'var(--crm-paper)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--crm-line)' }}>
          <div>
            <p className="font-semibold text-[15px]" style={{ color: 'var(--crm-ink)' }}>{c?.ticketNo ?? '…'}</p>
            {c && (
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
                <Link href={`/crm/customers/${c.customerId?._id}`} className="hover:underline font-semibold">{c.customerId?.name ?? c.customerId?.phone}</Link>
                <span className="font-mono"> · {c.customerId?.phone}</span>
                {c.orderNumber && <> · Order {c.orderNumber}</>}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" style={{ color: 'var(--crm-muted)' }} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ background: 'var(--crm-sand)' }}>
          {isLoading && <p className="text-[12px] text-center" style={{ color: 'var(--crm-muted)' }}>Loading…</p>}
          {c && (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <Pill variant="warn">{CATEGORY[c.category]}</Pill>
                <Pill variant={dueLabel(c).variant}>{dueLabel(c).text}</Pill>
                <Pill>{STATUS[c.status]}</Pill>
                <span className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--crm-muted)' }}>
                  Owner:
                  {isOpen ? (
                    <select value={c.assignedTo ?? ''} disabled={assign.isPending}
                      onChange={e => e.target.value && assign.mutate(e.target.value)}
                      className="px-1.5 py-0.5 rounded-md text-[11px]" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }}>
                      {!c.assignedTo && <option value="">Unassigned</option>}
                      {agents.map(a => <option key={a._id} value={a._id}>{a.name} ({a.open} open)</option>)}
                    </select>
                  ) : (c.assignedToName || 'Unassigned')}
                  · via {c.source}
                </span>
              </div>

              {c.description && (
                <p className="text-[13px] whitespace-pre-wrap p-3 rounded-xl" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)', color: 'var(--crm-ink)' }}>
                  {c.description}
                </p>
              )}
              {c.media?.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {c.media.map((u: string) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="text-[12px] underline" style={{ color: 'var(--crm-blue)' }}>
                      {/\.(mp4|mov|webm)$/i.test(u) ? 'Video' : 'Photo'}
                    </a>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {c.events.map((e: any) => (
                  <div key={e._id} className="text-[12px] px-3 py-2 rounded-lg"
                    style={e.kind === 'note'
                      ? { background: 'var(--crm-warn-bg)', color: 'var(--crm-warn-text)' }
                      : e.kind === 'reply'
                        ? { background: 'var(--crm-forest)', color: '#fff' }
                        : { background: 'var(--crm-paper)', color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }}>
                    <p className="whitespace-pre-wrap">{e.kind === 'note' ? 'Internal note: ' : ''}{e.text}</p>
                    <p className="text-[10px] mt-1 opacity-70">{e.byName} · {new Date(e.at).toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>

              {c.resolution && (
                <p className="text-[12px] p-3 rounded-xl" style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }}>
                  Resolved: {c.resolution.type.replace(/_/g, ' ')}
                  {c.resolution.replacementOrderNumber && <> → order {c.resolution.replacementOrderNumber}</>}
                  {c.resolution.amount ? <> · ₹{c.resolution.amount}</> : null}
                </p>
              )}

              {isOpen && (
                <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Resolve</p>
                  <div className="flex flex-wrap gap-1.5">
                    {RESOLUTIONS.map(r => (
                      <button key={r.id} onClick={() => setResType(r.id)} className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                        style={resType === r.id
                          ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' }
                          : { background: 'var(--crm-sand)', color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {resType === 'replacement' && !c.orderId && (
                    <p className="text-[11px]" style={{ color: 'var(--crm-danger)' }}>No linked order, a replacement can&apos;t be created.</p>
                  )}
                  {needsAmount && (
                    <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)"
                      className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--crm-line)' }} />
                  )}
                  <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required, shown in the audit trail)"
                    className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--crm-line)' }} />
                  <button disabled={resolve.isPending || !reason.trim() || (needsAmount && !amount)} onClick={() => resolve.mutate()}
                    className="px-4 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-50" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>
                    {resolve.isPending ? 'Saving…' : 'Resolve & notify customer'}
                  </button>
                </div>
              )}

              {c.status === 'resolved' && (
                <div className="flex gap-2">
                  <button onClick={() => status.mutate('closed')} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>Close</button>
                  <button onClick={() => status.mutate('reopened')} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>Reopen</button>
                </div>
              )}
            </>
          )}
        </div>

        {isOpen && (
          <div className="p-4 space-y-2" style={{ borderTop: '1px solid var(--crm-line)' }}>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
              placeholder={internal ? 'Internal note (customer will not see it)' : 'Reply to customer on WhatsApp'}
              className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--crm-line)' }} />
            <div className="flex items-center justify-between">
              <label className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--crm-muted)' }}>
                <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Internal note
              </label>
              <button disabled={reply.isPending || !text.trim()} onClick={() => reply.mutate()}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-50" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>
                {internal ? 'Add note' : 'Send reply'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComplaintsPage() {
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // Wait for a pause in typing so each keystroke isn't a request.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const params = {
    status: tab === 'open' || tab === 'mine' ? 'open' : tab === 'resolved' ? 'resolved' : undefined,
    mine: tab === 'mine',
    overdue: tab === 'overdue',
    search: debouncedSearch.trim() || undefined,
  };
  const { data, isLoading, error } = useQuery({
    queryKey: ['crm-complaints', params],
    queryFn: () => api.getCrmComplaints(params),
    refetchInterval: 60_000,
  });
  const rows: any[] = data?.data ?? [];

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      <div className="px-7 py-5" style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
        <h1 className="text-[20px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Complaints</h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
          {data ? `${data.openCount} open · ${data.overdueCount} overdue` : 'Loading…'}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
              style={tab === t.id
                ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' }
                : { background: 'var(--crm-sand)', color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }}>
              {t.label}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ticket, order, name, phone"
            className="ml-auto w-64 px-3 py-1.5 rounded-lg text-[12px]" style={{ border: '1px solid var(--crm-line)' }} />
        </div>
      </div>

      <div className="p-7 space-y-2.5">
        {isLoading ? null : error ? (
          <p className="text-[13px] text-center py-16" style={{ color: 'var(--crm-danger)' }}>Could not load complaints</p>
        ) : !rows.length ? (
          <EmptyState icon={AlertTriangle} title="No complaints here" body="New tickets from WhatsApp, calls and the website show up automatically" />
        ) : rows.map(c => {
          const due = dueLabel(c);
          return (
            <button key={c._id} onClick={() => setOpenId(c._id)} className="w-full text-left flex items-center gap-3 px-4 py-3.5"
              style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)', borderRadius: 12 }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[13px]" style={{ color: 'var(--crm-ink)' }}>{c.ticketNo}</span>
                  <Pill variant="warn">{CATEGORY[c.category]}</Pill>
                  <Pill variant={due.variant}>{due.text}</Pill>
                </div>
                <p className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--crm-muted)' }}>
                  {c.customerId?.name ?? c.customerId?.phone} · {c.orderNumber || 'no order'} · {c.assignedToName || 'Unassigned'}
                  {c.description && <> · {c.description}</>}
                </p>
              </div>
              <span className="text-[11px] shrink-0" style={{ color: 'var(--crm-muted)' }}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</span>
            </button>
          );
        })}
      </div>

      {openId && <Detail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
