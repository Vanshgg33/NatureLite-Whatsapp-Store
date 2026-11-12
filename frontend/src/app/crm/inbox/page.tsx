'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/crm/format';
import { ReportPage, Card } from '@/components/crm/ReportPage';

const when = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

// Read-only: replying from here needs the 24-hour-window / template rules wired to the WhatsApp provider.
export default function CrmInboxPage() {
  const [phone, setPhone] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['crm-inbox'], queryFn: () => api.getCrmInbox(), refetchInterval: 15_000 });
  const thread = useQuery({ queryKey: ['crm-thread', phone], queryFn: () => api.getCrmThread(phone!), enabled: !!phone });
  return (
    <ReportPage title="WhatsApp inbox" icon={MessageCircle} loading={list.isLoading} error={list.isError} note="Read-only view of recent conversations. Conversations waiting for a reply are marked. Replying, assigning and templates are not built.">
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {!list.data?.length && <p>No conversations yet.</p>}
          {list.data?.map((c: any) => (
            <button key={c.phone} onClick={() => setPhone(c.phone)} className="w-full text-left rounded-[14px] p-3" aria-pressed={phone === c.phone}
              style={{ background: 'var(--crm-paper)', border: `1px solid ${phone === c.phone ? 'var(--crm-gold)' : 'var(--crm-line)'}` }}>
              <p className="text-[13px] font-semibold flex justify-between">
                <span>{c.name || formatPhone(c.phone)}</span>
                {c.needsReply && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--crm-gold)', color: 'var(--crm-forest)' }}>Needs reply</span>}
              </p>
              <p className="text-[12px] truncate" style={{ color: 'var(--crm-muted)' }}>{c.lastText}</p>
              <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{when(c.lastAt)}</p>
            </button>
          ))}
        </div>
        <Card>
          {!phone ? <p>Select a conversation.</p> : thread.isLoading ? <p>Loading…</p> : (
            <div className="space-y-2">
              {thread.data?.map((m: any) => (
                <div key={m._id} className={m.direction === 'outbound' ? 'text-right' : ''}>
                  <span className="inline-block rounded-xl px-3 py-1.5 text-[13px] max-w-[80%] text-left"
                    style={{ background: m.direction === 'outbound' ? 'var(--crm-forest)' : 'var(--crm-sand)', color: m.direction === 'outbound' ? '#fff' : 'var(--crm-ink)' }}>
                    {m.content?.text || `[${m.messageType}]`}
                  </span>
                  <p className="text-[10px]" style={{ color: 'var(--crm-muted)' }}>{when(m.createdAt)} · {m.status}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </ReportPage>
  );
}
