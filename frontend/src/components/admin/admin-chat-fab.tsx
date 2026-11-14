'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type AdminChatProposal } from '@/lib/api';
import { useAdminAuthStore } from '@/lib/admin-store';
import { useAdminAccess } from '@/lib/admin-access';
import { renderMarkdown } from '@/components/admin/chat-markdown';

type Msg = { role: 'user' | 'assistant'; text: string; proposals?: AdminChatProposal[] };

const GREETING: Msg = {
  role: 'assistant',
  text: "Hi! I'm the NatureLite admin assistant. Ask me about orders, bills and customers, or ask me to change how billing calculates. I will show you the change and nothing happens until you confirm.",
};

const PROMPTS_BY_PAGE: Array<[string, string[]]> = [
  ['/billing/logics', ['What is billing set to right now?', 'How do I make tax round down?', 'Change round-off to round down']],
  ['/billing', ['How do I change how round-off works?', 'Who owes us money?', 'Unpaid bills this month']],
];
const DEFAULT_PROMPTS = ['Pending orders today', 'Who owes us money?', 'How do I change how round-off works?'];

const errorText = (e: any): string => {
  if (e?.response?.status === 429 || e?.message === 'RATE_LIMITED') return 'Too many messages in a minute. Wait a few seconds and ask again.';
  if (e?.message === 'TIMEOUT') return 'That took too long. Try again, or ask a shorter question.';
  return 'I could not reach the assistant. Check your connection and try again.';
};

/**
 * Floating assistant for the admin panels. It reuses the admin chatbot (POST /admin/chatbot/chat) and tells it
 * which page the question is asked from, so "how do I make tax round down" on the Logics page is answered in context.
 */
export function AdminChatFab() {
  const pathname = usePathname() ?? '';
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAdminAuthStore((s) => s.hasHydrated);
  const role = useAdminAuthStore((s) => s.user?.role);
  const { can } = useAdminAccess();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // What happened to each prepared change. Kept here, not inside the card, so closing and reopening the chat does not bring the buttons back.
  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentAt = useRef<number[]>([]);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 140);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    const now = Date.now();
    sentAt.current = sentAt.current.filter((t) => now - t < 60_000);
    if (sentAt.current.length >= 10) { // the server allows 10 a minute
      setMessages((m) => [...m, { role: 'assistant', text: errorText({ message: 'RATE_LIMITED' }) }]);
      return;
    }
    sentAt.current.push(now);

    const history = messages.slice(1).slice(-6); // completed turns only, without the greeting
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 60_000));
      const { reply, proposals } = await Promise.race([api.askAdminChatbot(text, history, pathname), timeout]);
      if (alive.current) setMessages((m) => [...m, { role: 'assistant', text: reply, proposals }]);
    } catch (e) {
      if (alive.current) setMessages((m) => [...m, { role: 'assistant', text: errorText(e) }]);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [input, loading, messages, pathname]);

  // Only signed-in admins who may use the assistant; the full chat page has its own screen.
  if (!hasHydrated || !isAuthenticated || (role !== 'admin' && role !== 'superadmin') || !can('chatbot.view') || pathname.startsWith('/admin/chatbot')) return null;

  const prompts = (PROMPTS_BY_PAGE.find(([p]) => pathname.startsWith(p))?.[1]) ?? DEFAULT_PROMPTS;

  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close assistant' : 'Open assistant'} aria-expanded={open}
        className="fixed bottom-14 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#1E3D2B] to-[#2d5a3f] shadow-lg shadow-[#1E3D2B]/40 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A838] focus-visible:ring-offset-2">
        {open ? <X className="h-5 w-5 text-[#E8A838]" /> : <Bot className="h-[22px] w-[22px] text-[#E8A838]" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Admin assistant"
            initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} transition={{ duration: 0.2 }}
            className="fixed bottom-[7.5rem] right-5 z-40 flex h-[min(560px,calc(100vh-9rem))] w-[min(400px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center gap-2.5 bg-gradient-to-br from-[#1E3D2B] to-[#2d5a3f] px-4 py-3">
              <Sparkles className="h-4 w-4 text-[#E8A838]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-white">Admin assistant</p>
                <p className="truncate text-[11px] leading-tight text-white/60">{pathname === '/billing/logics' ? 'Ask how to change billing logic' : 'Orders, billing, customers and how-to'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded p-1 text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A838]"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-3 py-3" aria-live="polite">
              {messages.map((m, i) => m.role === 'user'
                ? <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-[#1E3D2B] px-3 py-2 text-[13px] leading-relaxed text-white">{m.text}</div>
                : <div key={i} className="mr-4 rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm ring-1 ring-gray-100">{renderMarkdown(m.text)}{m.proposals?.map((p) => <ProposalCard key={p.id} p={p} status={cardStatus[p.id]} onStatus={(s) => setCardStatus((c) => ({ ...c, [p.id]: s }))} />)}</div>)}
              {loading && <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Working on it…</div>}
              {messages.length === 1 && !loading && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {prompts.map((p) => <button key={p} type="button" onClick={() => send(p)} className="rounded-full border border-[#1E3D2B]/20 bg-white px-3 py-1 text-xs text-[#1E3D2B] hover:bg-[#1E3D2B]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3D2B]">{p}</button>)}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form className="flex items-center gap-2 border-t bg-white p-2.5" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ask something…" aria-label="Message"
                className="h-9 flex-1 rounded-full border border-gray-200 bg-gray-50 px-3.5 text-sm focus-visible:border-[#1E3D2B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3D2B]/20" />
              <button type="submit" disabled={!input.trim() || loading} aria-label="Send"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1E3D2B] text-[#E8A838] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A838] focus-visible:ring-offset-1"><Send className="h-4 w-4" /></button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const SAMPLE_ROWS: Array<[string, string]> = [['taxableValue', 'Taxable value'], ['cgst', 'CGST'], ['sgst', 'SGST'], ['roundOff', 'Round-off'], ['billTotal', 'Bill total']];
const apiError = (e: any): string => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? e?.message ?? 'Something went wrong'; };

/** A change the assistant prepared. Nothing is applied until the person presses Confirm. */
type CardStatus = { state: 'busy' | 'done' | 'cancelled' | 'failed'; note: string };

function ProposalCard({ p, status, onStatus }: { p: AdminChatProposal; status?: CardStatus; onStatus: (s: CardStatus) => void }) {
  const qc = useQueryClient();
  const state = status?.state ?? 'idle';
  const note = status?.note ?? '';

  const run = async (action: 'confirm' | 'cancel') => {
    onStatus({ state: 'busy', note: '' });
    try {
      const r = action === 'confirm' ? await api.confirmChatProposal(p.id) : await api.cancelChatProposal(p.id);
      onStatus({ state: action === 'confirm' ? 'done' : 'cancelled', note: r.message });
      if (action === 'confirm') { qc.invalidateQueries({ queryKey: ['billing-logics'] }); qc.invalidateQueries({ queryKey: ['billing-formulas'] }); }
    } catch (e) { onStatus({ state: 'failed', note: apiError(e) }); }
  };

  return (
    <div className="mt-2 rounded-xl border border-[#2d7a4f]/40 bg-[#2d7a4f]/5 p-3 text-[13px]" role="group" aria-label="Change waiting for your confirmation">
      <p className="font-semibold text-gray-900">{p.title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-gray-700">{p.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p className="mt-1.5 text-xs text-gray-600">Applies to bills dated from <b>{p.startsOn}</b>. Reason: {p.reason}</p>
      {p.sample && (
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-gray-500"><th className="font-normal" /><th className="text-right font-normal">Today</th><th className="text-right font-normal">With this change</th></tr></thead>
          <tbody>
            {SAMPLE_ROWS.map(([k, label]) => {
              const a = p.sample!.today[k], b = p.sample!.withChange[k];
              return <tr key={k} className="border-t border-[#2d7a4f]/15"><td className="py-1 text-gray-700">{label}</td><td className="py-1 text-right tabular-nums">{a}</td><td className={`py-1 text-right tabular-nums ${a !== b ? 'font-semibold text-amber-700' : ''}`}>{b}</td></tr>;
            })}
          </tbody>
        </table>
      )}
      {p.sample && <p className="mt-1 text-[11px] text-gray-500">{p.sample.text}</p>}
      {(state === 'idle' || state === 'busy') && (
        <div className="mt-2.5 flex gap-2">
          <button type="button" disabled={state === 'busy'} onClick={() => run('confirm')} className="rounded-lg bg-[#1E3D2B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2d5a3f] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A838]">{state === 'busy' ? 'Working…' : 'Confirm change'}</button>
          <button type="button" disabled={state === 'busy'} onClick={() => run('cancel')} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3D2B]">Cancel</button>
        </div>
      )}
      {state === 'done' && <p className="mt-2 rounded-lg bg-green-100 p-2 text-xs text-green-900">✓ {note}</p>}
      {state === 'cancelled' && <p className="mt-2 text-xs text-gray-600">{note}</p>}
      {state === 'failed' && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">Not applied: {note}</p>}
    </div>
  );
}
