'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/crm/format';
import { ReportPage, Card } from '@/components/crm/ReportPage';
import { usePageState } from '@/hooks/usePageState';

type Pair = { current: number; previous: number };
const METRICS: Array<[key: string, label: string, money?: boolean]> = [
  ['revenue', 'Revenue (online + store)', true], ['onlineRevenue', 'Online revenue (delivered)', true], ['storeRevenue', 'Store bills', true],
  ['orders', 'Online orders delivered'], ['storeBills', 'Store bills'], ['newCustomers', 'New customers'],
  ['calls', 'Calls made'], ['leads', 'New leads'], ['walkins', 'Walk-ins'],
];
const when = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Delta({ p }: { p: Pair }) {
  if (!p.previous) return <span style={{ color: 'var(--crm-muted)' }}>{p.current ? 'new' : '—'}</span>;
  const pct = Math.round(((p.current - p.previous) / p.previous) * 100);
  const color = pct > 0 ? 'var(--crm-success)' : pct < 0 ? 'var(--crm-danger)' : 'var(--crm-muted)';
  return <span style={{ color }}>{pct > 0 ? '▲' : pct < 0 ? '▼' : ''} {Math.abs(pct)}%</span>;
}

export default function CrmDigestPage() {
  const [period, setPeriod] = usePageState<'day' | 'week'>('crm-digest.period', 'day');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-digest', period], queryFn: () => api.getCrmDigest(period), refetchInterval: 5 * 60_000,
  });
  const vs = period === 'day' ? 'yesterday to the same time' : 'the 7 days before';

  return (
    <ReportPage title="Digest & Alerts" icon={Bell} loading={isLoading} error={isError}
      note={`How the business is doing vs ${vs}, and what needs action now. Refreshes every 5 minutes.`}>
      {data && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {(['day', 'week'] as const).map(p => (
              <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p}
                className="px-3 py-1.5 rounded-md text-[12px] font-medium border"
                style={period === p ? { background: 'var(--crm-forest)', color: '#fff', borderColor: 'var(--crm-forest)' } : { background: 'var(--crm-paper)', color: 'var(--crm-ink)', borderColor: 'var(--crm-line)' }}>
                {p === 'day' ? 'Today' : 'Last 7 days'}
              </button>
            ))}
            <span className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{when(data.from)} – {when(data.to)}</span>
          </div>

          <section aria-label="Alerts" className="space-y-2">
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Alerts {data.alerts.length > 0 && `(${data.alerts.length})`}</h2>
            {data.alerts.length === 0 ? (
              <Card><p className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--crm-success)' }}><CheckCircle2 className="h-4 w-4" /> Nothing needs attention right now.</p></Card>
            ) : data.alerts.map((a: any) => {
              const high = a.severity === 'high';
              const body = (
                <div className="flex items-start gap-3 rounded-[14px] p-3.5" style={{ background: 'var(--crm-paper)', border: `1px solid ${high ? 'var(--crm-danger)' : 'var(--crm-line)'}`, borderLeftWidth: 4 }}>
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: high ? 'var(--crm-danger)' : 'var(--crm-amber)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--crm-ink)' }}>{a.title}</p>
                    <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>{a.detail}</p>
                  </div>
                  <span className="text-[10px] uppercase font-semibold tracking-wide shrink-0" style={{ color: high ? 'var(--crm-danger)' : 'var(--crm-amber)' }}>{high ? 'Urgent' : 'Watch'}</span>
                  {a.href && <ArrowRight className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--crm-muted)' }} />}
                </div>
              );
              return a.href ? <Link key={a.key} href={a.href} className="block hover:opacity-90">{body}</Link> : <div key={a.key}>{body}</div>;
            })}
          </section>

          <section aria-label="Digest" className="space-y-2">
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Digest</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {METRICS.map(([key, label, money]) => {
                const p: Pair = data.metrics[key];
                return (
                  <Card key={key}>
                    <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{label}</p>
                    <p className="text-[20px] font-semibold crm-tabular" style={{ color: 'var(--crm-forest)' }}>{money ? formatINR(p.current) : p.current.toLocaleString('en-IN')}</p>
                    <p className="text-[11px] crm-tabular" style={{ color: 'var(--crm-muted)' }}>
                      <Delta p={p} /> · was {money ? formatINR(p.previous) : p.previous.toLocaleString('en-IN')}
                    </p>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}
    </ReportPage>
  );
}
