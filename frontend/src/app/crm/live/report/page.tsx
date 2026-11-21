'use client';
// Day-close report (Caller Command Center 11): per caller, any date. Callers see only their own row.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { ReportPage, DataTable } from '@/components/crm/ReportPage';
import { BADGES, istTime } from '@/lib/crm/caller';

const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export default function DayReportPage() {
  const [date, setDate] = useState(todayIST());
  const { data, isLoading, isError } = useQuery({ queryKey: ['caller-report', date], queryFn: () => api.callerReport(date) });
  const callers: any[] = data?.callers ?? [];
  return (
    <ReportPage title="Day-close report" icon={FileText} loading={isLoading} error={isError} note="Assigned vs worked, quality and what rolls over to tomorrow.">
      <input type="date" value={date} max={todayIST()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Report date"
        className="px-3 py-2 rounded-lg text-[13px] w-fit" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }} />
      <DataTable csv={`day-report-${date}`} head={['Caller', 'Shift', 'Assigned', 'Worked', 'Calls', 'Connect %', 'WhatsApp', 'Callbacks set / kept', 'Orders', 'Points', 'Best / worst hour', 'Longest idle']}
        empty="No shifts on this day."
        rows={callers.map((c) => [
          c.name, `${istTime(c.startedAt)}–${c.endedAt ? istTime(c.endedAt) : 'open'}${c.breakMin ? ` (${c.breakMin}m break)` : ''}`,
          c.assigned, c.worked, c.calls, c.connectPct, c.wa, `${c.callbacksSet} / ${c.callbacksKept}`, c.orders,
          `${c.points}${c.badges.length ? ` ${c.badges.map((b: string) => BADGES[b]?.split(' ')[0] ?? '').join('')}` : ''}`,
          `${c.bestHour ?? '—'}:00 / ${c.worstHour ?? '—'}:00`, `${c.longestIdleMin} min`,
        ])} />
      {callers.map((c) => (
        <div key={c.callerId} className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="font-semibold text-[14px] mb-2" style={{ color: 'var(--crm-ink)' }}>{c.name}: untouched, rolled to tomorrow ({c.untouched.length})</h2>
            <DataTable head={['Customer', 'Phone']} empty="None, list cleared." rows={c.untouched.map((u: any) => [u.name, u.phone ?? ''])} />
          </div>
          <div>
            <h2 className="font-semibold text-[14px] mb-2" style={{ color: 'var(--crm-ink)' }}>{c.name}: parked ({c.parked.length})</h2>
            <DataTable head={['Customer', 'Reason']} empty="None parked." rows={c.parked.map((p: any) => [p.name, p.reason])} />
          </div>
        </div>
      ))}
    </ReportPage>
  );
}
