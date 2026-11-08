'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, ShoppingCart, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/crm/format';
import { CustomerAvatar } from '@/components/crm/CustomerAvatar';
import { Pill } from '@/components/crm/Pill';
import { EmptyState } from '@/components/crm/EmptyState';
import { LogCallPanel } from '@/components/crm/LogCallPanel';

const STEP_LABEL: Record<string, string> = {
  cart: 'Cart',
  coupon_prompt: 'Coupon',
  coupon_input: 'Coupon',
  checkout: 'Checkout',
  address_input: 'Address',
  payment_selection: 'Payment',
  payment_pending: 'Pay link (unpaid)',
};

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function ChatPanel({ item, onClose }: { item: any; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-chat', item.userId],
    queryFn: () => api.getCrmChat(item.userId),
  });
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [data]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onClose}>
      <div className="w-full max-w-md h-full flex flex-col" style={{ background: 'var(--crm-paper)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--crm-line)' }}>
          <div>
            <p className="font-semibold text-[14px]" style={{ color: 'var(--crm-ink)' }}>{item.user?.name ?? item.user?.phone}</p>
            <p className="text-[11px] font-mono" style={{ color: 'var(--crm-muted)' }}>{item.user?.phone}</p>
          </div>
          <button onClick={onClose} aria-label="Close chat"><X className="h-4 w-4" style={{ color: 'var(--crm-muted)' }} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ background: 'var(--crm-sand)' }}>
          {isLoading && <p className="text-[12px] text-center" style={{ color: 'var(--crm-muted)' }}>Loading…</p>}
          {isError && <p className="text-[12px] text-center" style={{ color: 'var(--crm-danger)' }}>Could not load chat</p>}
          {data && !data.messages.length && <p className="text-[12px] text-center" style={{ color: 'var(--crm-muted)' }}>No messages found (kept for 60 days)</p>}
          {data?.messages.map(m => (
            <div key={m.id} className={m.direction === 'outbound' ? 'flex justify-end' : 'flex justify-start'}>
              <div className="max-w-[80%] px-3 py-2 rounded-xl text-[12px] whitespace-pre-wrap break-words"
                style={m.direction === 'outbound'
                  ? { background: 'var(--crm-forest)', color: '#fff' }
                  : { background: 'var(--crm-paper)', color: 'var(--crm-ink)', border: '1px solid var(--crm-line)' }}>
                {m.text}
                <p className="text-[10px] mt-1 opacity-60">{new Date(m.at).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {data && (
            <div className="text-center text-[11px] font-semibold py-2" style={{ color: 'var(--crm-amber)' }}>
              ── Left here: {STEP_LABEL[item.step] ?? item.step} · {ago(item.leftAt)} ──
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

export default function AbandonedPage() {
  const [logCallItem, setLogCallItem] = useState<any | null>(null);
  const [chatItem, setChatItem] = useState<any | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['crm-queue', 'abandoned'],
    queryFn: () => api.getCrmAbandoned(),
    refetchInterval: 60_000,
  });

  return (
    <div className="min-h-full" style={{ background: 'var(--crm-sand)' }}>
      <div className="px-7 py-5" style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
        <h1 className="text-[20px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Abandoned Carts</h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--crm-muted)' }}>
          {isLoading ? 'Loading…' : `${data.length} WhatsApp shoppers left before paying (last 7 days)`}
        </p>
      </div>

      <div className="p-7 space-y-2.5">
        {isLoading ? null : !data.length ? (
          <EmptyState icon={ShoppingCart} title="All clear" body="No abandoned carts right now" />
        ) : (
          data.map((item: any) => (
            <div
              key={item.userId}
              className="flex items-center gap-3 px-4 py-3.5"
              style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)', borderRadius: 12 }}
            >
              <CustomerAvatar name={item.user?.name} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setChatItem(item)} title="View chat" className="font-semibold text-[13px] hover:underline text-left" style={{ color: 'var(--crm-ink)' }}>
                    {item.user?.name ?? item.user?.phone ?? '—'}
                  </button>
                  <Pill variant="warn">Left at {STEP_LABEL[item.step] ?? item.step}</Pill>
                  <span className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{ago(item.leftAt)}</span>
                </div>
                <div className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--crm-muted)' }}>
                  <span className="font-mono">{item.user?.phone}</span> · <span className="font-semibold">{formatINR(item.total)}</span> ·{' '}
                  {item.items.map((i: any) => `${i.name} ×${i.quantity}`).join(', ')}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.user?.phone && (
                  <a href={`tel:${item.user.phone}`} title="Call" className="h-8 w-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--crm-success-bg)', color: 'var(--crm-success)' }}>
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                )}
                <button onClick={() => setLogCallItem(item)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                  style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>
                  Log
                </button>
                <Link href={`/crm/customers/${item.userId}`} title="Open customer / WA nudge" className="h-8 w-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--crm-sand)', color: 'var(--crm-muted)', border: '1px solid var(--crm-line)' }}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {chatItem && <ChatPanel item={chatItem} onClose={() => setChatItem(null)} />}
      {logCallItem && <LogCallPanel item={logCallItem} onClose={() => setLogCallItem(null)} queueKey="abandoned" />}
    </div>
  );
}
