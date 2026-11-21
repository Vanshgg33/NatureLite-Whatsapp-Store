'use client';

// Caller Cockpit (Caller Command Center): one lead at a time, measured call timer, one-tap dispositions,
// WhatsApp quick-send, auto-next. The server picks the lead (atomic claim) and the next action (attempt ladder).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  Phone, PhoneOff, X, Coffee, Play, Square, SkipForward, MessageCircle, Clock, Flame, Trophy, Zap, Receipt, Languages, ChevronRight, Send,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { getApiError } from '@/lib/api-error';
import { formatINR, segmentLabel, displayName, formatPhone } from '@/lib/crm/format';
import {
  OUTCOMES, NOT_INTERESTED_REASONS, SKIP_REASONS, BREAK_REASONS, PRESENCE, BADGES,
  callbackChips, fmtClock, istTime, istDateTime, outcomeLabel, toLocalInput, useNow, chime,
} from '@/lib/crm/caller';
import { CustomerAvatar } from '@/components/crm/CustomerAvatar';
import { Pill } from '@/components/crm/Pill';
import { CustomerReminders } from '@/components/crm/CustomerReminders';
import { CrmBillSheet, useCanBillFromCrm } from '@/components/crm/CrmBillSheet';
import { useAdminAuthStore } from '@/lib/admin-store';

// ─── script helper (editable later via CRM settings → scripts) ───────────────
const SCRIPTS: Record<string, { en: string; hi: string }> = {
  default: {
    en: 'Namaste {name} ji, this is {agent} from NatureLite Foods. Is this a good time for two minutes?',
    hi: 'नमस्ते {name} जी, मैं NatureLite Foods से {agent} बोल रहा/रही हूँ। क्या अभी दो मिनट बात हो सकती है?',
  },
  repurchase_rush: {
    en: 'Namaste {name} ji! Your {product} should be finishing about now. Shall I send the same pack again today?',
    hi: 'नमस्ते {name} जी! आपका {product} अब ख़त्म होने वाला होगा। क्या आज वही पैक फिर से भेज दें?',
  },
  winback: {
    en: 'Namaste {name} ji, we missed you! Fresh wood-pressed oil and A2 ghee are in, and I have a special return offer for you.',
    hi: 'नमस्ते {name} जी, आपकी कमी महसूस हुई! ताज़ा कच्ची घानी तेल और A2 घी आया है, आपके लिए एक ख़ास ऑफ़र है।',
  },
  new_lead_blitz: {
    en: 'Namaste {name} ji, thank you for reaching NatureLite Foods! What were you looking for: oils, ghee or flours?',
    hi: 'नमस्ते {name} जी, NatureLite Foods से जुड़ने के लिए धन्यवाद! आप क्या ढूँढ रहे थे: तेल, घी या आटा?',
  },
  callback_hunter: {
    en: 'Namaste {name} ji, calling back as promised. Is now a good time?',
    hi: 'नमस्ते {name} जी, जैसा वादा किया था, वापस कॉल कर रहा/रही हूँ। क्या अभी बात हो सकती है?',
  },
};
const WA_KEYS = [
  { key: 'catalogue', label: 'Catalogue' }, { key: 'refill', label: 'Refill link' }, { key: 'missed_you', label: 'Missed you' },
  { key: 'thank_you', label: 'Order thanks' }, { key: 'warmup', label: 'Offer' },
];
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

// ─── small parts ─────────────────────────────────────────────────────────────
function Ring({ value, max, size = 44, label }: { value: number; max: number; size?: number; label?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const p = max ? Math.min(1, value / max) : 0;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--crm-sand-2)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--crm-gold)" strokeWidth={5} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: 'stroke-dashoffset 500ms' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums" style={{ color: 'var(--crm-ink)' }}>{Math.round(p * 100)}%</span>
    </div>
  );
}

function Confetti({ show }: { show: boolean }) {
  const bits = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ i, x: (Math.random() - 0.5) * 600, r: Math.random() * 360, c: ['#C9A04A', '#16a34a', '#2563eb', '#dc2626'][i % 4] })), []);
  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-start justify-center overflow-hidden" aria-hidden>
          {bits.map((b) => (
            <motion.span key={b.i} className="absolute top-1/3 h-2.5 w-1.5 rounded-sm" style={{ background: b.c }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: b.x, y: 420, opacity: 0, rotate: b.r }} exit={{ opacity: 0 }}
              transition={{ duration: 1.6, ease: 'easeOut' }} />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col items-center px-2">
      <span className="text-[15px] font-semibold tabular-nums" style={{ color: tone ?? 'var(--crm-ink)' }}>{value}</span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--crm-muted)' }}>{label}</span>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────
export default function CallerCockpitPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const agent = useAdminAuthStore((s) => s.user?.name ?? '');
  const canBill = useCanBillFromCrm();
  const now = useNow(1000);
  const fail = useCallback((title: string) => (e: unknown) => toast({ title, description: getApiError(e), variant: 'destructive' }), [toast]);

  const shiftQ = useQuery({ queryKey: ['caller-shift'], queryFn: () => api.callerShift(), refetchInterval: 30_000 });
  const meQ = useQuery({ queryKey: ['caller-me'], queryFn: () => api.callerMe(), refetchInterval: 20_000 });
  const shift = shiftQ.data?.shift ?? null;
  const cfg = shiftQ.data?.config;
  const modes: any[] = shiftQ.data?.modes ?? [];
  const mode = modes.find((m) => m.key === shiftQ.data?.mode) ?? modes[0];
  const active = shift && shift.status !== 'ended';
  const onBreak = shift?.status === 'break';
  const day = meQ.data?.day;

  const [cur, setCur] = useState<any>(null);       // /next response
  const [loadingLead, setLoadingLead] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [skipOpen, setSkipOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [waKey, setWaKey] = useState('');
  const [waText, setWaText] = useState('');
  const [billOpen, setBillOpen] = useState(false);
  const [sprint, setSprint] = useState(0);         // dispositions in this mode run (target ring)
  const [party, setParty] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const lead = cur?.lead ?? null;
  const customerId: string = lead?.userId ?? '';
  const onCall = shift?.onCall && String(shift.onCall.customerId) === customerId ? shift.onCall : null;

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['caller-shift'] });
    qc.invalidateQueries({ queryKey: ['caller-me'] });
    qc.invalidateQueries({ queryKey: ['crm-reminders'] });
  }, [qc]);

  const loadNext = useCallback(async (m?: string) => {
    setLoadingLead(true);
    try {
      const r = await api.callerNext(m);
      setCur(r);
      setOutcome(''); setCallbackAt(''); setReason(''); setNotes(''); setWaKey(''); setWaText('');
    } catch (e) { fail('Could not load the next lead')(e); } finally { setLoadingLead(false); }
  }, [fail]);

  // first lead once the shift is known; again whenever the shift (re)starts
  const shiftKey = active && !onBreak ? `${shift?._id}:${shiftQ.data?.mode}` : '';
  useEffect(() => { if (shiftKey) loadNext(); else setCur(null); }, [shiftKey, loadNext]);

  // ─── presence heartbeat every 20 s + idle nudge ───────────────────────────
  const touched = useRef(true);
  const lastTouch = useRef(Date.now());
  useEffect(() => {
    const mark = () => { touched.current = true; lastTouch.current = Date.now(); };
    const evs = ['mousemove', 'keydown', 'click', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, mark));
  }, []);
  const isCaller = useAdminAuthStore((s) => s.user?.departmentType === 'crm_senior');
  useEffect(() => {
    if (!active || isCaller) return; // callers: CrmShell sends presence from every CRM page
    const beat = () => { api.callerHeartbeat(touched.current).catch(() => {}); touched.current = false; };
    beat();
    const id = setInterval(beat, 20_000);
    return () => clearInterval(id);
  }, [active, isCaller]);
  const idleMin = cfg?.idleNudgeMin ?? 5;
  const idle = active && !onBreak && !onCall && now - lastTouch.current > idleMin * 60_000;

  // ─── mutations ────────────────────────────────────────────────────────────
  const shiftAct = useMutation({
    mutationFn: (v: { action: 'start' | 'break' | 'resume' | 'end'; reason?: string }) => api.callerShiftAction(v.action, v.reason),
    onSuccess: (r: any, v) => {
      qc.setQueryData(['caller-shift'], r);
      refreshAll();
      setBreakOpen(false);
      if (v.action === 'end' && r?.summary) toast({ title: 'Shift ended', description: `${r.summary.calls} calls · ${r.summary.connectPct}% connected · ${r.summary.orders} orders · ${r.summary.points} pts` });
    },
    onError: fail('Shift update failed'),
  });
  const setMode = useMutation({
    mutationFn: (m: string) => api.callerSetMode(m),
    onSuccess: (r: any) => { qc.setQueryData(['caller-shift'], r); setSprint(0); },
    onError: fail('Could not switch mode'),
  });
  const startCall = useMutation({
    mutationFn: () => api.callerStartCall(customerId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caller-shift'] }); if (lead?.user?.phone) window.location.href = `tel:${lead.user.phone}`; },
    onError: fail('Cannot start the call'),
  });
  const hangup = useMutation({ mutationFn: () => api.callerHangup(), onSuccess: () => qc.invalidateQueries({ queryKey: ['caller-shift'] }), onError: fail('Hang-up failed') });
  const save = useMutation({
    mutationFn: () => api.callerEndCall({
      customerId, outcome, notes: notes.trim() || undefined, reason: reason || undefined,
      callbackAt: outcome === 'callback' && callbackAt ? new Date(callbackAt).toISOString() : undefined,
    }),
    onSuccess: (r: any) => {
      setLastResult({ ...r, name: displayName(lead?.user?.name, lead?.user?.phone) });
      const n = sprint + 1;
      setSprint(n);
      const target = mode?.target?.calls;
      if (target && n === target) { setParty(true); chime(); setTimeout(() => setParty(false), 1800); toast({ title: `🎉 ${mode.label} target hit: ${target} calls!` }); }
      if (r?.flagged) toast({ title: 'Short call flagged', description: `Under ${cfg?.shortCallSec ?? 5}s marked as connected`, variant: 'destructive' });
      if (r?.waSent) toast({ title: '“Sorry we missed you” sent on WhatsApp' });
      refreshAll();
      loadNext(); // auto-next
    },
    onError: fail('Could not save the call'),
  });
  const skip = useMutation({
    mutationFn: (why: string) => api.callerSkip(lead.assignment._id, why),
    onSuccess: () => { setSkipOpen(false); refreshAll(); loadNext(); },
    onError: fail('Skip failed'),
  });
  const pull = useMutation({
    mutationFn: () => api.callerPullMore(),
    onSuccess: (r: any) => { toast({ title: r.moved ? `Pulled ${r.moved} more leads` : r.topUp ? `Added ${r.topUp} new leads` : 'Nothing left to pull' }); refreshAll(); loadNext(); },
    onError: fail('Pull failed'),
  });
  const warmup = useMutation({
    mutationFn: () => api.callerWarmup(),
    onSuccess: (r: any) => toast({ title: `WhatsApp sent to ${r.sent} of ${r.batch}`, description: r.failed?.length ? `Failed: ${r.failed.slice(0, 3).join(', ')}` : 'Replies float to the top in a few minutes' }),
    onError: fail('Warm-up failed'),
  });
  const sendWa = useMutation({
    mutationFn: () => api.sendCrmNudge({ customerId, templateName: waKey, message: waText }),
    onSuccess: () => { toast({ title: 'WhatsApp sent' }); setWaKey(''); setWaText(''); refreshAll(); },
    onError: fail('WhatsApp failed'),
  });

  const chosen = OUTCOMES.find((o) => o.value === outcome);
  const canSave = !!outcome && !save.isPending && (!chosen?.asks || (chosen.asks === 'time' ? !!callbackAt : !!reason));

  // ─── keyboard: C call · H hang up · Enter save · S skip ───────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role="dialog"]') || billOpen) return;
      if (!lead) return;
      if (e.key === 'c' && !onCall) startCall.mutate();
      if (e.key === 'h' && onCall && !onCall.endedAt) hangup.mutate();
      if (e.key === 'Enter' && onCall && canSave) save.mutate();
      if (e.key === 's' && !onCall) setSkipOpen(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lead, onCall, canSave, billOpen, startCall, hangup, save]);

  // ─── timers ───────────────────────────────────────────────────────────────
  const shiftSec = shift ? (+(shift.endedAt ? new Date(shift.endedAt) : now) - +new Date(shift.startedAt)
    - (shift.breaks ?? []).reduce((s: number, b: any) => s + (+(b.end ? new Date(b.end) : now) - +new Date(b.start)), 0)) / 1000 : 0;
  const callSec = onCall ? (+(onCall.endedAt ? new Date(onCall.endedAt) : now) - +new Date(onCall.startedAt)) / 1000 : 0;
  const wrapSec = onCall?.endedAt ? (now - +new Date(onCall.endedAt)) / 1000 : 0;
  const modeLeft = mode?.timer && shift?.modeStartedAt ? mode.timer.minutes * 60 - (now - +new Date(shift.modeStartedAt)) / 1000 : null;
  const speedMin = lead?.assignment?.arrivedAt ? (now - +new Date(lead.assignment.arrivedAt)) / 60_000 : null;

  const name = displayName(lead?.user?.name, lead?.user?.phone);
  const firstName = (lead?.user?.name || '').split(' ')[0] || 'Sir/Madam';
  const script = SCRIPTS[mode?.key] ?? SCRIPTS.default;
  const scriptText = fill(script[lang], { name: firstName, agent: agent.split(' ')[0] || 'NatureLite', product: lead?.topProduct || lead?.topCategory || 'order' });
  const presence = PRESENCE[shiftQ.data?.presence ?? 'offline'] ?? PRESENCE.offline;
  const assigned = day?.assigned ?? 0;
  const doneN = day?.done ?? 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-full flex flex-col" style={{ background: 'var(--crm-sand)' }}>
        <Confetti show={party} />

        {/* ── Header: shift ── */}
        <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3" style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
          <Link href="/crm/queue" className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)', color: 'var(--crm-muted)' }} title="Exit cockpit" aria-label="Exit cockpit">
            <X className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold leading-none" style={{ color: 'var(--crm-ink)' }}>Caller Cockpit</h1>
            <p className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: 'var(--crm-muted)' }}>
              <span className={`h-2 w-2 rounded-full ${presence.pulse ? 'animate-pulse' : ''}`} style={{ background: presence.color }} />
              {presence.label}{active && <> · shift {fmtClock(shiftSec)}</>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!active && (
              <button onClick={() => shiftAct.mutate({ action: 'start' })} disabled={shiftAct.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-50" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>
                <Play className="h-4 w-4" /> {shift?.status === 'ended' ? 'Restart shift' : 'Start shift'}
              </button>
            )}
            {active && !onBreak && (
              <div className="relative">
                <button onClick={() => setBreakOpen((v) => !v)} disabled={!!onCall} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium disabled:opacity-40"
                  style={{ background: 'var(--crm-sand)', border: '1px solid var(--crm-line)', color: 'var(--crm-ink-2)' }}>
                  <Coffee className="h-3.5 w-3.5" /> Break
                </button>
                {breakOpen && (
                  <div className="absolute right-0 mt-1 z-30 rounded-xl shadow-lg overflow-hidden" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
                    {BREAK_REASONS.map((r) => (
                      <button key={r} onClick={() => shiftAct.mutate({ action: 'break', reason: r })} className="block w-full text-left px-4 py-2 text-[13px] hover:bg-black/5" style={{ color: 'var(--crm-ink)' }}>{r}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {onBreak && (
              <button onClick={() => shiftAct.mutate({ action: 'resume' })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold" style={{ background: '#7c3aed', color: '#fff' }}>
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            )}
            {active && (
              <button onClick={() => { if (window.confirm('End your shift for today?')) shiftAct.mutate({ action: 'end' }); }} disabled={!!onCall}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium disabled:opacity-40" style={{ color: 'var(--crm-danger)', border: '1px solid var(--crm-line)' }}>
                <Square className="h-3.5 w-3.5" /> End shift
              </button>
            )}
          </div>
        </div>

        {/* ── Mode bar ── */}
        {active && (
          <div className="px-4 sm:px-6 py-2 flex items-center gap-1.5 overflow-x-auto" style={{ background: 'var(--crm-paper)', borderBottom: '1px solid var(--crm-line)' }}>
            {modes.map((m) => {
              const on = m.key === mode?.key;
              const locked = shiftQ.data?.forced && !on;
              return (
                <button key={m.key} onClick={() => !on && setMode.mutate(m.key)} disabled={locked || !m.open || setMode.isPending || !!onCall}
                  title={!m.open ? `Opens ${m.timeWindow?.from}:00–${m.timeWindow?.to}:00` : locked ? 'Your manager set your mode' : m.description}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all flex-shrink-0 disabled:opacity-35"
                  style={on ? { background: 'var(--crm-forest)', color: 'var(--crm-gold)' } : { color: 'var(--crm-ink-2)', background: 'var(--crm-sand)' }}>
                  <span aria-hidden>{m.emoji}</span>{m.label}
                </button>
              );
            })}
            {shiftQ.data?.forced && <span className="text-[11px] px-2 whitespace-nowrap" style={{ color: 'var(--crm-amber)' }}>Set by manager</span>}
          </div>
        )}

        {/* ── Idle nudge / mode timer ── */}
        {idle && (
          <div className="mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl text-[13px] font-medium flex items-center gap-2" style={{ background: 'var(--crm-amber)', color: '#fff' }}>
            <Clock className="h-4 w-4" /> No activity for {idleMin}+ min. Ready for the next call?
          </div>
        )}
        {active && !onBreak && modeLeft !== null && (
          <div className="mx-4 sm:mx-6 mt-3 px-4 py-2 rounded-xl flex items-center gap-3 text-[13px]" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
            <Zap className="h-4 w-4" style={{ color: 'var(--crm-gold)' }} />
            {modeLeft > 0 ? (
              <span style={{ color: 'var(--crm-ink)' }}>{mode.label}: <b className="tabular-nums">{fmtClock(modeLeft)}</b> left</span>
            ) : (
              <span style={{ color: 'var(--crm-ink)' }}>{mode.label} done! {mode.timer?.breakAfter ? `Take your ${mode.timer.breakAfter}-minute break.` : ''}</span>
            )}
            {mode.target?.calls && <span className="ml-auto flex items-center gap-2" style={{ color: 'var(--crm-muted)' }}>{sprint}/{mode.target.calls} <Ring value={sprint} max={mode.target.calls} size={34} label="Sprint target" /></span>}
            {modeLeft <= 0 && mode.timer?.breakAfter && !onCall && (
              <button onClick={() => shiftAct.mutate({ action: 'break', reason: `${mode.label} break` })} className="px-3 py-1 rounded-lg text-[12px] font-semibold" style={{ background: '#7c3aed', color: '#fff' }}>Start break</button>
            )}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 p-4 sm:p-6">
          {shiftQ.isLoading ? (
            <div className="flex justify-center py-20"><div className="h-8 w-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--crm-gold)', borderTopColor: 'transparent' }} /></div>
          ) : !active ? (
            <Empty title={shift?.status === 'ended' ? 'Shift ended' : 'Start your shift'} body={shift?.status === 'ended' ? 'Good work today. Your summary is in Performance → day-close report.' : 'Starting your shift checks you in and deals you an even share of today’s leads.'} />
          ) : onBreak ? (
            <Empty title="On a break" body="Resume when you are back; your leads are waiting." />
          ) : !lead ? (
            <Empty
              title={cur?.reason === 'list_done' ? 'Zero left! 🎉' : cur?.reason === 'mode_closed' ? `${mode?.label} is closed now` : cur?.reason === 'mode_empty' ? `No leads for ${mode?.label}` : loadingLead ? 'Finding your next lead…' : 'No lead right now'}
              body={cur?.reason === 'list_done' ? 'You touched every lead in your list.' : cur?.reason === 'mode_closed' ? `Opens ${mode?.timeWindow?.from}:00–${mode?.timeWindow?.to}:00 IST.` : cur?.nextDueAt ? `Next retry/callback due at ${istTime(cur.nextDueAt)}. Try another mode meanwhile.` : 'Switch mode, or pull more leads.'}
            >
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {mode?.key !== 'cleanup' && <button onClick={() => setMode.mutate('cleanup')} disabled={shiftQ.data?.forced} className="px-4 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-40" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>🧹 Cleanup mode</button>}
                <button onClick={() => pull.mutate()} disabled={pull.isPending} className="px-4 py-2 rounded-xl text-[13px] font-semibold" style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink)' }}>Pull 25 more</button>
                <button onClick={() => loadNext()} className="px-4 py-2 rounded-xl text-[13px]" style={{ color: 'var(--crm-muted)' }}>Refresh</button>
              </div>
            </Empty>
          ) : (
            <motion.div key={customerId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
              className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] max-w-7xl mx-auto">

              {/* Left: customer */}
              <section className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
                <div className="flex items-start gap-3">
                  <CustomerAvatar name={lead.user?.name} isVip={lead.isVip} size={52} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[19px] font-semibold leading-tight truncate" style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces, Georgia, serif)' }}>{name}</h2>
                    <p className="text-[13px] tabular-nums" style={{ color: 'var(--crm-ink-2)' }}>{formatPhone(lead.user?.phone) || 'No phone'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {lead.segment && <Pill variant="neutral">{segmentLabel(lead.segment)}</Pill>}
                      {lead.isVip && <Pill variant="vip">VIP</Pill>}
                      {lead.assignment?.rolloverCount > 0 && <Pill variant="warn">Rolled over</Pill>}
                    </div>
                  </div>
                  <div className="text-center flex-shrink-0">
                    <div className="text-[22px] font-bold tabular-nums" style={{ color: (lead.assignment?.score ?? 0) >= (cfg?.hotScore ?? 70) ? 'var(--crm-danger)' : 'var(--crm-ink)' }}>{lead.assignment?.score ?? 0}</div>
                    <div className="text-[9px] uppercase tracking-[0.1em]" style={{ color: 'var(--crm-muted)' }}>score</div>
                  </div>
                </div>
                {!!lead.assignment?.reasons?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {lead.assignment.reasons.map((r: string) => (
                      <span key={r} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--crm-amber-bg, #fdf3dd)', color: 'var(--crm-ink-2)' }}>
                        {(lead.assignment?.score ?? 0) >= (cfg?.hotScore ?? 70) && <Flame className="inline h-3 w-3 mr-0.5" style={{ color: 'var(--crm-danger)' }} />}{r}
                      </span>
                    ))}
                  </div>
                )}
                {speedMin !== null && (
                  <div className="px-3 py-2 rounded-xl text-[13px] font-semibold flex items-center gap-2" style={{ background: speedMin > 15 ? 'var(--crm-danger)' : 'var(--crm-success)', color: '#fff' }}>
                    <Clock className="h-4 w-4" /> Lead arrived {Math.floor(speedMin)} min ago{speedMin > 15 ? ' (goal: 15)' : ''}
                  </div>
                )}
                {lead.assignment?.source === 'callback' && (
                  <div className={`px-3 py-2 rounded-xl text-[13px] ${lead.callbackAt && +new Date(lead.callbackAt) < now ? 'animate-pulse' : ''}`}
                    style={{ background: lead.callbackAt && +new Date(lead.callbackAt) < now ? 'var(--crm-danger)' : 'var(--crm-amber)', color: '#fff' }}>
                    Callback promised for {istTime(lead.callbackAt ?? lead.assignment?.dueAt)}
                    {lead.history?.find((h: any) => h.outcome === 'callback')?.notes ? `: “${lead.history.find((h: any) => h.outcome === 'callback').notes}”` : ''}
                  </div>
                )}
                {mode?.hint && <p className="text-[12px] italic" style={{ color: 'var(--crm-muted)' }}>💡 {mode.hint}</p>}
                <div className="grid grid-cols-3 gap-px rounded-xl overflow-hidden" style={{ background: 'var(--crm-line)' }}>
                  {[['LTV', formatINR(lead.ltv ?? 0)], ['Orders', String(lead.orderCount ?? 0)], ['Buys', lead.topProduct || lead.topCategory || '—']].map(([l, v]) => (
                    <div key={l} className="py-2.5 px-2 text-center" style={{ background: 'var(--crm-sand)' }}>
                      <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--crm-ink)' }}>{v}</div>
                      <div className="text-[9px] uppercase tracking-[0.1em]" style={{ color: 'var(--crm-muted)' }}>{l}</div>
                    </div>
                  ))}
                </div>
                {lead.predictedReorderDate && <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>Refill expected {istDateTime(lead.predictedReorderDate)}</p>}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--crm-muted)' }}>History</p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {!lead.history?.length && <p className="text-[12px]" style={{ color: 'var(--crm-muted)' }}>First contact.</p>}
                    {(lead.history ?? []).map((h: any) => (
                      <div key={h._id} className="text-[12px] flex gap-2">
                        <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--crm-muted)' }}>{new Date(h.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}</span>
                        <span className="min-w-0" style={{ color: 'var(--crm-ink-2)' }}>
                          <b>{h.type === 'whatsapp' ? 'WhatsApp' : outcomeLabel(h.outcome)}</b>{h.agentId?.name ? ` · ${h.agentId.name}` : ''}{h.notes ? ` · ${h.notes}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <Link href={`/crm/customers/${customerId}`} target="_blank" className="flex items-center gap-1 text-[12px] font-medium" style={{ color: 'var(--crm-muted)' }}>
                  Full profile <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </section>

              {/* Centre: timer + disposition */}
              <section className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
                <div className="text-center">
                  <div className="text-[44px] font-semibold tabular-nums leading-none" style={{ color: onCall ? (onCall.endedAt ? (wrapSec > 45 ? 'var(--crm-amber)' : 'var(--crm-blue)') : 'var(--crm-success)') : 'var(--crm-muted)' }}>
                    {onCall ? fmtClock(onCall.endedAt ? wrapSec : callSec) : '00:00'}
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--crm-muted)' }}>
                    {!onCall ? 'Tap Call to start the timer' : onCall.endedAt ? `Wrap-up (target 45 s) · talk ${fmtClock(callSec)}` : 'On call'}
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    {!onCall ? (
                      <button onClick={() => startCall.mutate()} disabled={startCall.isPending || !lead.user?.phone}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[15px] font-semibold disabled:opacity-40 transition-transform hover:scale-[1.03] active:scale-[0.97]"
                        style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>
                        <Phone className="h-5 w-5" /> Call <kbd className="text-[10px] opacity-60 font-normal">C</kbd>
                      </button>
                    ) : !onCall.endedAt ? (
                      <button onClick={() => hangup.mutate()} className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[15px] font-semibold" style={{ background: 'var(--crm-danger)', color: '#fff' }}>
                        <PhoneOff className="h-5 w-5" /> Hung up <kbd className="text-[10px] opacity-60 font-normal">H</kbd>
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl p-3" style={{ background: 'var(--crm-sand)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--crm-muted)' }}>Script</span>
                    <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--crm-forest)' }}>
                      <Languages className="h-3 w-3" /> {lang === 'en' ? 'हिंदी' : 'English'}
                    </button>
                  </div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--crm-ink)' }}>{scriptText}</p>
                </div>

                <fieldset disabled={!onCall} className="space-y-3 disabled:opacity-45">
                  {(['connected', 'not_connected'] as const).map((g) => (
                    <div key={g}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--crm-muted)' }}>{g === 'connected' ? 'Connected' : 'Not connected'}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {OUTCOMES.filter((o) => o.group === g).map((o) => {
                          const on = outcome === o.value;
                          return (
                            <button key={o.value} type="button" onClick={() => { setOutcome(o.value); setReason(''); }}
                              className="px-2.5 py-2 rounded-xl text-[12px] font-medium transition-all"
                              style={on ? { background: o.color, color: '#fff' } : { background: 'var(--crm-sand)', color: 'var(--crm-ink-2)', border: '1px solid var(--crm-line)' }}>
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {chosen?.asks === 'time' && (
                    <div className="flex flex-wrap gap-1.5">
                      {callbackChips(new Date(now)).map((c) => (
                        <button key={c.label} type="button" onClick={() => setCallbackAt(toLocalInput(c.at))} className="px-2.5 py-1.5 rounded-lg text-[12px]"
                          style={{ border: '1px solid var(--crm-line)', background: callbackAt === toLocalInput(c.at) ? 'var(--crm-amber)' : 'var(--crm-paper)', color: callbackAt === toLocalInput(c.at) ? '#fff' : 'var(--crm-ink-2)' }}>{c.label}</button>
                      ))}
                      <input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} aria-label="Pick callback time"
                        className="px-2 py-1.5 rounded-lg text-[12px] focus:outline-none" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-paper)' }} />
                    </div>
                  )}
                  {chosen?.asks === 'reason' && (
                    <div className="flex flex-wrap gap-1.5">
                      {NOT_INTERESTED_REASONS.map((r) => (
                        <button key={r} type="button" onClick={() => setReason(r)} className="px-2.5 py-1.5 rounded-lg text-[12px]"
                          style={reason === r ? { background: 'var(--crm-danger)', color: '#fff' } : { border: '1px solid var(--crm-line)', color: 'var(--crm-ink-2)' }}>{r}</button>
                      ))}
                    </div>
                  )}
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Note (optional)" maxLength={2000}
                    className="w-full px-3 py-2 rounded-xl text-[13px] resize-none focus:outline-none" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)' }} />
                  <button type="button" onClick={() => save.mutate()} disabled={!canSave}
                    className="w-full py-3 rounded-xl text-[14px] font-semibold disabled:opacity-40" style={{ background: 'var(--crm-forest)', color: 'var(--crm-gold)' }}>
                    {save.isPending ? 'Saving…' : 'Save & next · Enter'}
                  </button>
                </fieldset>
                {!onCall && <p className="text-[11px] text-center" style={{ color: 'var(--crm-muted)' }}>Every call ends in an outcome, then the next lead loads automatically.</p>}
              </section>

              {/* Right: WhatsApp, order, reminders */}
              <section className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--crm-muted)' }}>WhatsApp</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WA_KEYS.map((w) => (
                      <button key={w.key} type="button" onClick={() => { setWaKey(w.key); setWaText(fill(cfg?.waTemplates?.[w.key] ?? '', { name: firstName })); }}
                        className="px-2.5 py-1.5 rounded-lg text-[12px]" style={waKey === w.key ? { background: '#25D366', color: '#fff' } : { border: '1px solid var(--crm-line)', color: 'var(--crm-ink-2)' }}>
                        {w.label}
                      </button>
                    ))}
                  </div>
                  {lastResult?.next?.suggestWa && !waKey && <p className="text-[11px] mt-1.5" style={{ color: 'var(--crm-muted)' }}>Tip: after {lastResult.name} the ladder suggested “{WA_KEYS.find((w) => w.key === lastResult.next.suggestWa)?.label}”.</p>}
                  {waKey && (
                    <div className="mt-2 space-y-2">
                      <textarea value={waText} onChange={(e) => setWaText(e.target.value)} rows={4} maxLength={1000}
                        className="w-full px-3 py-2 rounded-xl text-[13px] resize-none focus:outline-none" style={{ border: '1px solid var(--crm-line)', background: 'var(--crm-sand)' }} />
                      <button type="button" onClick={() => sendWa.mutate()} disabled={!waText.trim() || sendWa.isPending}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-40" style={{ background: '#25D366', color: '#fff' }}>
                        <Send className="h-4 w-4" /> {sendWa.isPending ? 'Sending…' : 'Send WhatsApp'}
                      </button>
                    </div>
                  )}
                </div>
                {canBill && (
                  <button type="button" onClick={() => setBillOpen(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold"
                    style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-forest)' }}>
                    <Receipt className="h-4 w-4" /> Create order / bill
                  </button>
                )}
                <CustomerReminders customerId={customerId} compact />
              </section>
            </motion.div>
          )}
        </div>

        {/* ── Bottom bar ── */}
        {active && (
          <div className="sticky bottom-0 px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ background: 'var(--crm-paper)', borderTop: '1px solid var(--crm-line)' }}>
            <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--crm-ink)' }}>{mode?.emoji} {mode?.label}</span>
            <div className="flex items-center gap-2"><Ring value={doneN} max={assigned} label="List done" /><span className="text-[12px] tabular-nums" style={{ color: 'var(--crm-ink-2)' }}>{doneN}/{assigned}</span></div>
            <div className="flex items-center divide-x" style={{ borderColor: 'var(--crm-line)' }}>
              <Stat label="Calls" value={day?.calls ?? 0} />
              <Stat label="Connect" value={`${day?.connectPct ?? 0}%`} />
              <Stat label="Streak" value={<span className="flex items-center gap-0.5"><Flame className="h-3.5 w-3.5" style={{ color: 'var(--crm-danger)' }} />{day?.streak ?? 0}</span>} />
              <Stat label="Points" value={<span className="flex items-center gap-0.5"><Trophy className="h-3.5 w-3.5" style={{ color: 'var(--crm-gold)' }} />{day?.points ?? 0}</span>} />
            </div>
            <div className="hidden md:flex gap-1">{(day?.badges ?? []).map((b: string) => <span key={b} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--crm-sand)' }}>{BADGES[b] ?? b}</span>)}</div>
            <div className="ml-auto flex items-center gap-2">
              {mode?.key === 'wa_warmup' && (
                <button onClick={() => warmup.mutate()} disabled={warmup.isPending} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold" style={{ background: '#25D366', color: '#fff' }}>
                  <MessageCircle className="h-3.5 w-3.5" /> {warmup.isPending ? 'Sending…' : 'WhatsApp 20 leads'}
                </button>
              )}
              {assigned > 0 && doneN / assigned >= 0.9 && (
                <button onClick={() => pull.mutate()} disabled={pull.isPending} className="px-3 py-2 rounded-xl text-[12px] font-semibold" style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-forest)' }}>Pull 25 more</button>
              )}
              {lead && !onCall && (
                <div className="relative">
                  <button onClick={() => setSkipOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium" style={{ border: '1px solid var(--crm-line)', color: 'var(--crm-ink-2)' }}>
                    Skip <SkipForward className="h-3.5 w-3.5" />
                  </button>
                  {skipOpen && (
                    <div className="absolute right-0 bottom-full mb-1 z-30 w-52 rounded-xl shadow-lg overflow-hidden" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
                      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--crm-muted)' }}>Why skip?</p>
                      {SKIP_REASONS.map((r) => (
                        <button key={r} onClick={() => skip.mutate(r)} className="block w-full text-left px-3 py-2 text-[13px] hover:bg-black/5" style={{ color: 'var(--crm-ink)' }}>{r}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {canBill && customerId && <CrmBillSheet open={billOpen} customerId={customerId} onClose={() => setBillOpen(false)} />}
      </div>
    </MotionConfig>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-md mx-auto mt-10 rounded-2xl p-10 text-center" style={{ background: 'var(--crm-paper)', border: '1px solid var(--crm-line)' }}>
      <p className="text-[20px] font-semibold mb-1" style={{ color: 'var(--crm-ink)', fontFamily: 'var(--font-serif, Fraunces)' }}>{title}</p>
      <p className="text-[13px]" style={{ color: 'var(--crm-muted)' }}>{body}</p>
      {children}
    </div>
  );
}
