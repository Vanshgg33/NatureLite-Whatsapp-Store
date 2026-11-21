'use client';

// Live Board (Caller Command Center 8.2): the TV screen for managers. Polls every 5 s (SSE cannot carry the auth header).
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Maximize2, Minimize2, Shuffle, Swords, Trophy, AlertTriangle, MoreVertical, FileText, Flame } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { BADGES, PRESENCE, fmtClock, istTime, useNow } from '@/lib/crm/caller';

const BUCKETS = [
  { key: 'untouched', label: 'Untouched', color: '#9ca3af' },
  { key: 'in_progress', label: 'In progress', color: '#2563eb' },
  { key: 'connected', label: 'Connected', color: '#16a34a' },
  { key: 'not_reached', label: 'Not reached', color: '#d97706' },
  { key: 'parked', label: 'Parked', color: '#6b7280' },
];
const CALLER_COLORS = ['#C9A04A', '#2A4434', '#2563eb', '#C05621', '#7c3aed', '#0d9488'];

function useCountUp(value: number, ms = 600) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setV(value); from.current = value; return; }
    const start = performance.now(); const a = from.current; let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setV(Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

function Kpi({ label, value, suffix = '', sub, tone, tv }: { label: string; value: number; suffix?: string; sub?: string; tone?: string; tv: boolean }) {
  const v = useCountUp(value);
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: tone ?? 'var(--crm-muted)' }}>{label}</p>
      <p className={`${tv ? 'text-[40px]' : 'text-[26px]'} font-semibold tabular-nums leading-tight`} style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}>{v}{suffix}</p>
      {sub && <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{sub}</p>}
    </div>
  );
}

function CallerCard({ c, color, tv, modes, onAct }: { c: any; color: string; tv: boolean; modes: any[]; onAct: (a: string, c: any, extra?: any) => void }) {
  const now = useNow(1000);
  const p = PRESENCE[c.presence] ?? PRESENCE.offline;
  const [menu, setMenu] = useState(false);
  const callSec = c.onCall ? (+(c.onCall.endedAt ? new Date(c.onCall.endedAt) : now) - +new Date(c.onCall.startedAt)) / 1000 : 0;
  const d = c.day;
  const pct = d.assigned ? Math.round((d.done / d.assigned) * 100) : 0;
  const mode = modes.find((m) => m.key === c.mode);
  return (
    <div className="rounded-2xl p-4 space-y-3 relative" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)', borderTop: `4px solid ${color}` }}>
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full flex items-center justify-center text-[17px] font-semibold flex-shrink-0" style={{ background: color, color: '#fff' }}>{(c.name?.[0] ?? '?').toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className={`${tv ? 'text-[20px]' : 'text-[15px]'} font-semibold truncate`} style={{ color: 'var(--crm-ink)' }}>{c.name}</p>
          <p className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--crm-muted)' }}>
            <span className={`h-2.5 w-2.5 rounded-full ${p.pulse ? 'animate-pulse' : ''}`} style={{ background: p.color }} />
            <b style={{ color: p.color }}>{p.label}</b>
            {mode && <> · {mode.emoji} {mode.label}{c.forced ? ' (forced)' : ''}</>}
          </p>
        </div>
        <button type="button" onClick={() => setMenu((v) => !v)} aria-label={`Controls for ${c.name}`} className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--crm-muted)' }}><MoreVertical className="h-4 w-4" /></button>
        {menu && (
          <div className="absolute right-3 top-14 z-20 w-56 rounded-xl shadow-xl overflow-hidden" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }} onMouseLeave={() => setMenu(false)}>
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--crm-muted)' }}>Force mode (60 min)</p>
            <div className="max-h-40 overflow-y-auto">
              {modes.map((m) => <button key={m.key} onClick={() => { setMenu(false); onAct('force', c, m.key); }} className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-black/5">{m.emoji} {m.label}</button>)}
              {c.forced && <button onClick={() => { setMenu(false); onAct('force', c, null); }} className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-black/5" style={{ color: 'var(--crm-danger)' }}>Clear forced mode</button>}
            </div>
            <div style={{ borderTop: '1px solid var(--crm-line)' }}>
              {[['message', 'Message caller'], ['pull', 'Pull 25 more for them'], ['reassign', 'Reassign their leads'], ['pause', 'Pause caller']].map(([k, l]) => (
                <button key={k} onClick={() => { setMenu(false); onAct(k, c); }} className="block w-full text-left px-3 py-2 text-[12px] hover:bg-black/5" style={{ color: k === 'reassign' || k === 'pause' ? 'var(--crm-danger)' : 'var(--crm-ink)' }}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl px-3 py-2 flex items-center justify-between" style={{ background: c.onCall ? 'rgba(22,163,74,0.08)' : 'var(--crm-sand)' }}>
        <span className="text-[12px] truncate" style={{ color: 'var(--crm-ink-2)' }}>{c.onCall ? `📞 ${c.onCall.name}` : c.presence === 'offline' ? 'Not on shift' : 'Between calls'}</span>
        {c.onCall && <span className={`${tv ? 'text-[24px]' : 'text-[18px]'} font-semibold tabular-nums`} style={{ color: c.onCall.endedAt ? '#2563eb' : '#16a34a' }}>{fmtClock(callSec)}</span>}
      </div>

      <div className="grid grid-cols-4 gap-1 text-center">
        {[['Assigned', d.assigned], ['Done', d.done], ['Calls', d.calls], ['Conn.', `${d.connected}`], ['WA', d.wa], ['Callbacks', d.callbacksDue], ['Orders', d.orders], ['Points', d.points]].map(([l, v]) => (
          <div key={l as string}>
            <div className={`${tv ? 'text-[20px]' : 'text-[15px]'} font-semibold tabular-nums`} style={{ color: l === 'Callbacks' && d.callbacksOverdue ? 'var(--crm-danger)' : 'var(--crm-ink)' }}>{v}</div>
            <div className="text-[9px] uppercase tracking-[0.08em]" style={{ color: 'var(--crm-muted)' }}>{l}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--crm-muted)' }}>
          <span>{pct}% of list</span>
          <span style={{ color: c.pace.actual < c.pace.required ? 'var(--crm-danger)' : 'var(--crm-success)' }}>pace {c.pace.actual}/h · need {c.pace.required}/h</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--crm-sand-2)' }}>
          <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>

      <div className="h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={d.hourly} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Area type="monotone" dataKey="calls" stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-1 text-[10px]" style={{ color: 'var(--crm-muted)' }}>
        <span>🔥 streak {d.streak}</span>
        {d.skipRate > 15 && <span style={{ color: 'var(--crm-danger)' }}>· skips {d.skipRate}%</span>}
        {d.flagged > 0 && <span style={{ color: 'var(--crm-danger)' }}>· {d.flagged} short calls</span>}
        {c.breakMin > 0 && <span>· break {c.breakMin}m</span>}
        {c.duel && <span style={{ color: '#7c3aed' }}>· ⚔️ duel till {istTime(c.duel.endsAt)}</span>}
        {d.badges.map((b: string) => <span key={b}>· {BADGES[b] ?? b}</span>)}
      </div>
    </div>
  );
}

export default function LiveBoardPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tv, setTv] = useState(false);
  const [panel, setPanel] = useState(0);
  const [replay, setReplay] = useState<number | null>(null);
  const [duelA, setDuelA] = useState('');
  const [duelB, setDuelB] = useState('');
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['caller-live'], queryFn: () => api.callerLive(), refetchInterval: 5_000 });
  const fail = (t: string) => (e: unknown) => toast({ title: t, description: getApiError(e), variant: 'destructive' });
  const done = (t: string) => () => { toast({ title: t }); qc.invalidateQueries({ queryKey: ['caller-live'] }); };

  const distribute = useMutation({
    mutationFn: async (mode: 'fresh' | 'rebalance') => {
      const p: any = await api.callerDistribute(mode, true);
      const lines = Object.entries(p.perCaller).map(([id, n]) => `${data?.callers.find((c: any) => c.callerId === id)?.name ?? id}: +${n}`).join('\n');
      if (!window.confirm(`${mode === 'fresh' ? 'Distribute today' : 'Rebalance'}: ${p.poolSize} new leads${p.moved ? `, ${p.moved} untouched to re-deal` : ''} across ${p.callers} callers.\n\n${lines}\n\nGo ahead?`)) return null;
      return api.callerDistribute(mode, false);
    },
    onSuccess: (r: any) => { if (r) done(`Done: ${r.inserted} new, ${r.movedApplied} moved`)(); },
    onError: fail('Distribution failed'),
  });
  const act = useMutation({
    mutationFn: async ({ a, c, extra }: { a: string; c: any; extra?: any }) => {
      if (a === 'force') return api.callerForceMode(c.callerId, extra, 60);
      if (a === 'pull') return api.callerPullFor(c.callerId);
      if (a === 'reassign') { if (!window.confirm(`Move all of ${c.name}'s open leads (callbacks too) to the others?`)) return null; return api.callerReassign(c.callerId); }
      if (a === 'pause') { if (!window.confirm(`Put ${c.name} on a break?`)) return null; return api.callerPause(c.callerId); }
      if (a === 'message') { const t = window.prompt(`Message to ${c.name}`); if (!t?.trim()) return null; return api.callerAddReminder({ callerId: c.callerId, text: `From manager: ${t.trim()}` }); }
      return null;
    },
    onSuccess: (r) => { if (r) done('Done')(); },
    onError: fail('Action failed'),
  });
  const duel = useMutation({ mutationFn: () => api.callerDuel(duelA, duelB, 60), onSuccess: done('Duel started: 60 minutes'), onError: fail('Could not start duel') });

  // TV mode: full screen + rotating bottom panels
  useEffect(() => {
    if (!tv) return;
    const id = setInterval(() => setPanel((p) => (p + 1) % 3), 15_000);
    return () => clearInterval(id);
  }, [tv]);
  const toggleTv = async () => {
    const on = !tv;
    setTv(on);
    try { if (on) await document.documentElement.requestFullscreen?.(); else if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* not allowed: still enlarges */ }
  };
  useEffect(() => { const h = () => { if (!document.fullscreenElement) setTv(false); }; document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);

  const callers: any[] = useMemo(() => data?.callers ?? [], [data]);
  const colorOf = (id: string) => CALLER_COLORS[Math.max(0, callers.findIndex((c) => c.callerId === id)) % CALLER_COLORS.length];
  const hours: number[] = callers[0]?.day.hourly.map((h: any) => h.hour) ?? [];
  const currentHour = new Date().getHours();
  const asOf = replay ?? currentHour;
  const timeline = hours.map((h) => Object.fromEntries([['hour', `${h}:00`], ...callers.map((c) => [c.name, h <= asOf ? c.day.hourly.find((x: any) => x.hour === h)?.calls ?? 0 : 0])]));
  const replayTotals = callers.reduce((t, c) => {
    c.day.hourly.filter((h: any) => h.hour <= asOf).forEach((h: any) => { t.calls += h.calls; t.connected += h.connected; });
    return t;
  }, { calls: 0, connected: 0 });

  if (isError) return <div className="p-8 text-[14px]" style={{ color: 'var(--crm-danger)' }}>{getApiError(error, 'Live Board is for managers.')}</div>;
  if (isLoading || !data) return <div className="flex justify-center py-24"><div className="h-8 w-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} /></div>;
  const k = data.kpis;
  const totals = data.distribution.totals;
  const totalLeads = BUCKETS.reduce((s, b) => s + (totals[b.key] ?? 0), 0);
  const leaderboard = [...callers].sort((a, b) => b.day.points - a.day.points);

  const Distribution = (
    <section className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
      <h2 className="text-[13px] font-semibold flex items-center gap-2" style={{ color: 'var(--crm-ink)' }}><Activity className="h-4 w-4" /> Today&apos;s {totalLeads} leads</h2>
      {[{ id: 'all', name: 'Team', d: totals }, ...callers.map((c) => ({ id: c.callerId, name: c.name, d: data.distribution.perCaller[c.callerId] ?? {} }))].map((row) => {
        const sum = BUCKETS.reduce((s, b) => s + (row.d[b.key] ?? 0), 0);
        return (
          <div key={row.id} className="flex items-center gap-3">
            <span className="w-20 text-[12px] truncate" style={{ color: 'var(--crm-ink-2)', fontWeight: row.id === 'all' ? 600 : 400 }}>{row.name}</span>
            <div className="flex-1 flex h-5 rounded-md overflow-hidden" style={{ background: 'var(--crm-sand-2)' }}>
              {BUCKETS.map((b) => (row.d[b.key] ?? 0) > 0 && (
                <Link key={b.key} href={`/crm/caller/day?bucket=${b.key}&callerId=${row.id}`} title={`${b.label}: ${row.d[b.key]}`}
                  className="h-full transition-all duration-500 hover:opacity-80" style={{ width: `${((row.d[b.key] ?? 0) / Math.max(1, sum)) * 100}%`, background: b.color }} />
              ))}
            </div>
            <span className="w-10 text-right text-[12px] tabular-nums" style={{ color: 'var(--crm-muted)' }}>{sum}</span>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--crm-muted)' }}>
        {BUCKETS.map((b) => <span key={b.key} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />{b.label} {totals[b.key] ?? 0}</span>)}
      </div>
    </section>
  );
  const Leaderboard = (
    <section className="rounded-2xl p-4" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
      <h2 className="text-[13px] font-semibold flex items-center gap-2 mb-2" style={{ color: 'var(--crm-ink)' }}><Trophy className="h-4 w-4" style={{ color: 'var(--crm-gold)' }} /> Leaderboard</h2>
      {leaderboard.map((c, i) => (
        <div key={c.callerId} className="flex items-center gap-3 py-1.5">
          <span className="w-6 text-[14px] font-bold" style={{ color: i === 0 ? 'var(--crm-gold)' : 'var(--crm-muted)' }}>{i + 1}</span>
          <span className="flex-1 text-[13px] truncate" style={{ color: 'var(--crm-ink)' }}>{c.name} <span className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>{c.day.badges.map((b: string) => BADGES[b]?.split(' ')[0] ?? '').join(' ')}</span></span>
          <span className="text-[11px] flex items-center gap-0.5" style={{ color: 'var(--crm-muted)' }}><Flame className="h-3 w-3" />{c.day.bestStreak}</span>
          <span className="w-16 text-right text-[14px] font-semibold tabular-nums" style={{ color: 'var(--crm-ink)' }}>{c.day.points} pts</span>
        </div>
      ))}
      {!leaderboard.length && <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>No callers yet.</p>}
    </section>
  );
  const Timeline = (
    <section className="rounded-2xl p-4" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h2 className="text-[13px] font-semibold" style={{ color: 'var(--crm-ink)' }}>Calls per hour</h2>
        <label className="ml-auto flex items-center gap-2 text-[11px]" style={{ color: 'var(--crm-muted)' }}>
          Replay to {asOf}:00
          <input type="range" min={hours[0] ?? 9} max={Math.min(currentHour, hours[hours.length - 1] ?? 20)} value={Math.min(asOf, currentHour)}
            onChange={(e) => setReplay(Number(e.target.value) >= currentHour ? null : Number(e.target.value))} aria-label="Day replay" />
          <span className="tabular-nums">{replayTotals.calls} calls · {replayTotals.connected} connected</span>
        </label>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={timeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--crm-line)" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {callers.map((c) => <Bar key={c.callerId} dataKey={c.name} fill={colorOf(c.callerId)} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
  const Alerts = (
    <section className="rounded-2xl p-4" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
      <h2 className="text-[13px] font-semibold flex items-center gap-2 mb-2" style={{ color: 'var(--crm-ink)' }}><AlertTriangle className="h-4 w-4" style={{ color: 'var(--crm-danger)' }} /> Alerts</h2>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {data.alerts.map((a: any) => (
          <div key={a._id} className="flex gap-2 text-[12px]">
            <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--crm-muted)' }}>{istTime(a.createdAt ?? a.dueAt)}</span>
            <span style={{ color: a.status === 'done' ? 'var(--crm-muted)' : 'var(--crm-ink)' }}>
              {a.text}{a.customerId?._id && <> · <Link className="underline" href={`/crm/customers/${a.customerId._id}`}>{a.customerId.name || a.customerId.phone}</Link></>}
            </span>
          </div>
        ))}
        {!data.alerts.length && <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>All quiet.</p>}
      </div>
    </section>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className={`min-h-full space-y-4 ${tv ? 'p-6' : 'p-4 sm:p-6'}`} style={{ background: 'var(--crm-sand)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h1 className={`${tv ? 'text-[28px]' : 'text-[20px]'} font-semibold flex items-center gap-2`} style={{ color: 'var(--crm-ink)' }}>
              <span className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ background: '#16a34a' }} /> Live Board
            </h1>
            <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>Updates every 5 s · {istTime(data.now)} IST · calling {data.config.callingHours.from}:00–{data.config.callingHours.to}:00</p>
          </div>
          {!tv && (
            <>
              <button onClick={() => distribute.mutate('fresh')} disabled={distribute.isPending} className="px-3 py-2 rounded-xl text-[12px] font-semibold" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>Distribute today</button>
              <button onClick={() => distribute.mutate('rebalance')} disabled={distribute.isPending} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium" style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)' }}><Shuffle className="h-3.5 w-3.5" /> Rebalance</button>
              <Link href="/crm/live/report" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium" style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)' }}><FileText className="h-3.5 w-3.5" /> Day report</Link>
            </>
          )}
          <button onClick={toggleTv} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium" style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)' }}>
            {tv ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} {tv ? 'Exit TV' : 'TV mode'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <Kpi tv={tv} label="Leads today" value={k.totalLeads} sub={`${k.done} done`} />
          <Kpi tv={tv} label="Remaining" value={k.remaining} tone={k.remaining ? 'var(--crm-amber)' : 'var(--crm-success)'} />
          <Kpi tv={tv} label="Calls" value={k.calls} />
          <Kpi tv={tv} label="Connected" value={k.connectPct} suffix="%" sub={`${k.connected} calls`} tone="var(--crm-success)" />
          <Kpi tv={tv} label="WhatsApp" value={k.wa} tone="#25D366" />
          <Kpi tv={tv} label="Callbacks" value={k.callbacksPending} sub="pending" tone="var(--crm-amber)" />
          <Kpi tv={tv} label="Orders" value={k.orders} tone="var(--crm-gold)" />
          <Kpi tv={tv} label="Pace /h" value={k.pace.actual} sub={`need ${k.pace.required}/h`} tone={k.pace.actual < k.pace.required ? 'var(--crm-danger)' : 'var(--crm-success)'} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {callers.map((c) => <CallerCard key={c.callerId} c={c} color={colorOf(c.callerId)} tv={tv} modes={data.modes} onAct={(a, cc, extra) => act.mutate({ a, c: cc, extra })} />)}
          {!callers.length && <p className="text-[13px]" style={{ color: 'var(--crm-muted)' }}>No callers (Senior Agents) yet. Add them in Team &amp; roles.</p>}
        </div>

        {tv ? (
          <div className="grid gap-4 lg:grid-cols-2">{[Distribution, Leaderboard, Timeline][panel]}{Alerts}</div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">{Distribution}{Leaderboard}</div>
            {Timeline}
            <div className="grid gap-4 lg:grid-cols-2">
              {Alerts}
              <section className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
                <h2 className="text-[13px] font-semibold flex items-center gap-2" style={{ color: 'var(--crm-ink)' }}><Swords className="h-4 w-4" style={{ color: '#7c3aed' }} /> Duel (60 min, connected calls)</h2>
                <div className="flex flex-wrap gap-2">
                  {[[duelA, setDuelA], [duelB, setDuelB]].map(([v, set], i) => (
                    <select key={i} value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className="px-2 py-1.5 rounded-lg text-[12px]" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)' }}>
                      <option value="">Caller {i + 1}</option>
                      {callers.filter((c) => c.presence !== 'offline').map((c) => <option key={c.callerId} value={c.callerId}>{c.name}</option>)}
                    </select>
                  ))}
                  <button onClick={() => duel.mutate()} disabled={!duelA || !duelB || duelA === duelB || duel.isPending} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40" style={{ background: '#7c3aed', color: '#fff' }}>Start duel</button>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--crm-muted)' }}>Both callers share one pool; the result lands in Alerts.</p>
              </section>
            </div>
          </>
        )}
      </div>
    </MotionConfig>
  );
}
