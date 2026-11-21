'use client';
// The list behind every My Day tile and Live Board segment (?view=… or ?bucket=…, managers may pass ?callerId=).
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/crm/format';
import { ReportPage, DataTable } from '@/components/crm/ReportPage';
import { fmtClock, istDateTime, istTime, outcomeLabel } from '@/lib/crm/caller';

const TITLES: Record<string, string> = {
  assigned: 'Assigned today', done: 'Done today', remaining: 'Remaining', calls: 'Calls today', connected: 'Connected calls',
  wa: 'WhatsApp sent today', callbacks: 'Callbacks due', orders: 'Orders won today',
  untouched: 'Untouched', in_progress: 'In progress', not_reached: 'Not reached', parked: 'Parked',
};

function DayList() {
  const sp = useSearchParams();
  const params = { view: sp.get('view') ?? undefined, bucket: sp.get('bucket') ?? undefined, callerId: sp.get('callerId') ?? undefined, hour: sp.get('hour') ?? undefined };
  const { data, isLoading, isError } = useQuery({ queryKey: ['caller-list', params], queryFn: () => api.callerList(params), refetchInterval: 15_000 });
  const key = params.bucket ?? params.view ?? 'assigned';
  const title = `${TITLES[key] ?? 'List'}${params.hour ? ` · ${params.hour}:00–${Number(params.hour) + 1}:00` : ''}`;
  const rows: any[] = data?.rows ?? [];
  const who = (c: any) => c ? <Link href={`/crm/customers/${c._id}`} className="underline">{c.name || formatPhone(c.phone) || 'Unnamed'}</Link> : '—';

  let table;
  if (data?.kind === 'leads') {
    table = <DataTable head={['Customer', 'Phone', 'Score', 'Why', 'State', 'Last outcome', ...(params.callerId === 'all' ? ['Caller'] : [])]} empty="Nothing here."
      rows={rows.map((r) => [who(r.customerId), formatPhone(r.customerId?.phone), r.score, (r.reasons ?? []).join(', ') || r.source, r.parkedReason ? `parked: ${r.parkedReason}` : r.state, outcomeLabel(r.lastOutcome), ...(params.callerId === 'all' ? [r.callerId?.name ?? '—'] : [])])} />;
  } else if (data?.kind === 'reminders') {
    table = <DataTable head={['Customer', 'Phone', 'Due (IST)', 'Note']} empty="No callbacks due."
      rows={rows.map((r) => [who(r.customerId), formatPhone(r.customerId?.phone), <span key={r._id} style={{ color: +new Date(r.dueAt) < Date.now() ? 'var(--crm-danger)' : undefined }}>{istDateTime(r.dueAt)}</span>, r.text])} />;
  } else {
    table = <DataTable head={['Time', 'Customer', 'Outcome', 'Talk', 'Note']} empty="Nothing logged yet."
      rows={rows.map((r) => [istTime(r.createdAt), who(r.customerId), r.type === 'whatsapp' ? `WhatsApp: ${r.templateName || 'message'}` : `${outcomeLabel(r.outcome)}${r.flagged ? ' ⚑' : ''}`, r.durationSec ? fmtClock(r.durationSec) : '—', r.notes || r.messageText || ''])} />;
  }
  return <ReportPage title={title} icon={ListChecks} loading={isLoading} error={isError} note="Updates live. Customer names open the full profile.">{table}</ReportPage>;
}

export default function CallerDayPage() {
  return <Suspense fallback={null}><DayList /></Suspense>;
}
