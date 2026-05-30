'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, Bot, User, RefreshCw, ShoppingCart, KeyRound,
  Users, ChevronRight, TrendingUp, Star, Tag, BarChart2, UserPlus,
  Copy, Check, RotateCcw, Lightbulb, X, Zap, AlertTriangle,
  CreditCard, Repeat, MessageCircle, Bell, Store,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  streaming?: boolean;
}

type HistoryItem = { role: 'user' | 'assistant'; text: string };

const MAX_HISTORY_TURNS = 6;

// ── Markdown renderer ──────────────────────────────────────────────────────────

// Tokenises **bold**, `code`, and _italic_ in a single left-to-right pass.
function parseInlineStyles(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match bold first so ** doesn't get confused with single *
  const TOKEN_RE = /(\*\*[^*\n]+?\*\*|`[^`\n]+?`|_[^_\n]+?_)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;

  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    const token = m[1];
    if (token.startsWith('**'))
      parts.push(<strong key={k++} className="font-semibold text-gray-900 dark:text-white">{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`'))
      parts.push(<code key={k++} className="bg-gray-100 dark:bg-gray-700 text-[#c0392b] dark:text-red-400 px-1.5 py-0.5 rounded font-mono text-[11px] font-medium">{token.slice(1, -1)}</code>);
    else
      parts.push(<em key={k++} className="italic text-gray-500 dark:text-gray-400">{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return parts.length ? parts : [<span key={0}>{text}</span>];
}

function renderTable(tableText: string, key: string): React.ReactNode {
  const rows = tableText.trim().split('\n').filter(r => r.trim().startsWith('|'));
  if (rows.length < 2) return null;
  const parseRow = (row: string) => row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
  const headers = parseRow(rows[0]);
  const body = rows.slice(2).map(parseRow);
  return (
    <div key={key} className="overflow-x-auto my-3 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm">
      <table className="w-full text-xs">
        <thead className="bg-[#1E3D2B]/8 dark:bg-[#E8A838]/10">
          <tr>{headers.map((h, i) => <th key={i} className="px-3 py-2.5 text-left font-bold text-[#1E3D2B] dark:text-[#E8A838] whitespace-nowrap text-[11px] tracking-wide uppercase">{parseInlineStyles(h)}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={cn('border-t border-gray-100 dark:border-white/5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]', ri % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-gray-50/40 dark:bg-white/[0.02]')}>
              {row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-gray-700 dark:text-gray-300 text-[12px] leading-relaxed">{parseInlineStyles(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let seg = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    // ── Fenced code block ───────────────────────────────────────────────────
    if (t.startsWith('```')) {
      const lang = t.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <pre key={`cb-${seg++}`} className="bg-gray-900 dark:bg-black/40 rounded-xl p-4 overflow-x-auto my-3 border border-white/10">
          {lang && <div className="text-[10px] text-gray-500 font-mono mb-2 uppercase tracking-wider">{lang}</div>}
          <code className="text-xs text-green-300 font-mono whitespace-pre leading-relaxed">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // ── Markdown table ──────────────────────────────────────────────────────
    if (t.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tbl = renderTable(tableLines.join('\n'), `tbl-${seg++}`);
      if (tbl) elements.push(tbl);
      continue;
    }

    // ── H1 ──────────────────────────────────────────────────────────────────
    if (t.startsWith('# ') && !t.startsWith('##')) {
      elements.push(
        <h2 key={`h1-${seg++}`} className="text-base font-bold text-[#1E3D2B] dark:text-white mt-5 mb-2 pb-1.5 border-b border-gray-200 dark:border-white/10">
          {parseInlineStyles(t.slice(2).trim())}
        </h2>
      );
      i++; continue;
    }

    // ── H2 ──────────────────────────────────────────────────────────────────
    if (t.startsWith('## ') && !t.startsWith('###')) {
      elements.push(
        <h3 key={`h2-${seg++}`} className="text-sm font-bold text-[#1E3D2B] dark:text-[#E8A838] mt-4 mb-1.5">
          {parseInlineStyles(t.slice(3).trim())}
        </h3>
      );
      i++; continue;
    }

    // ── H3 ──────────────────────────────────────────────────────────────────
    if (t.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${seg++}`} className="text-[13px] font-semibold text-[#1E3D2B] dark:text-[#E8A838] mt-3 mb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E8A838] shrink-0" />
          {parseInlineStyles(t.slice(4).trim())}
        </h4>
      );
      i++; continue;
    }

    // ── Blockquote — colour by content ──────────────────────────────────────
    if (t.startsWith('> ')) {
      const content = t.slice(2).trim();
      const isWarning = /⚠️|❌|partial|unavailable|error/i.test(content);
      const isSuccess = /✅|sent|success/i.test(content);
      const isAction = /📧|ready.to.send/i.test(content);
      const cls = isWarning
        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 text-amber-900 dark:text-amber-300'
        : isSuccess
        ? 'bg-green-50 dark:bg-green-950/20 border-green-500 text-green-800 dark:text-green-300'
        : isAction
        ? 'bg-[#1E3D2B]/5 dark:bg-[#E8A838]/10 border-[#1E3D2B] dark:border-[#E8A838] text-[#1E3D2B] dark:text-[#E8A838]'
        : 'bg-blue-50 dark:bg-blue-950/20 border-blue-400 text-blue-800 dark:text-blue-300';
      elements.push(
        <div key={`bq-${seg++}`} className={`border-l-4 px-3 py-2 rounded-r-lg my-2 text-[13px] leading-relaxed ${cls}`}>
          {parseInlineStyles(content)}
        </div>
      );
      i++; continue;
    }

    // ── Horizontal rule ─────────────────────────────────────────────────────
    if (t === '---' || t === '***' || t === '___') {
      elements.push(<hr key={`hr-${seg++}`} className="my-3 border-gray-100 dark:border-white/10" />);
      i++; continue;
    }

    // ── Unordered list — collect consecutive items into one <ul> ────────────
    if (t.startsWith('- ') || t.startsWith('* ')) {
      const items: { content: string; nested: boolean }[] = [];
      while (i < lines.length) {
        const lt = lines[i];
        const ltt = lt.trim();
        if (ltt.startsWith('- ') || ltt.startsWith('* ')) {
          items.push({ content: ltt.slice(2).trim(), nested: lt.startsWith('  ') || lt.startsWith('\t') });
          i++;
        } else if (ltt === '' && i + 1 < lines.length && (lines[i + 1].trim().startsWith('- ') || lines[i + 1].trim().startsWith('* '))) {
          i++; // absorb blank line between list items
        } else {
          break;
        }
      }
      elements.push(
        <ul key={`ul-${seg++}`} className="my-2 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className={cn('flex items-start gap-2.5 text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed', item.nested && 'pl-5')}>
              <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-[#1E3D2B]/40 dark:bg-[#E8A838]/60 shrink-0" />
              <span>{parseInlineStyles(item.content)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Ordered list — collect consecutive items into one <ol> ──────────────
    if (/^\d+\.\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const nm = lines[i].trim().match(/^\d+\.\s(.*)/);
        if (nm) items.push(nm[1].trim());
        i++;
      }
      elements.push(
        <ol key={`ol-${seg++}`} className="my-2 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
              <span className="shrink-0 h-5 w-5 rounded-full bg-[#1E3D2B]/8 dark:bg-[#E8A838]/20 text-[#1E3D2B] dark:text-[#E8A838] text-[10px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
              <span>{parseInlineStyles(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Empty line ───────────────────────────────────────────────────────────
    if (t === '') { elements.push(<div key={`sp-${seg++}`} className="h-1.5" />); i++; continue; }

    // ── Paragraph ───────────────────────────────────────────────────────────
    elements.push(
      <p key={`p-${seg++}`} className="text-[13px] leading-relaxed text-gray-800 dark:text-gray-200 my-0.5">
        {parseInlineStyles(t)}
      </p>
    );
    i++;
  }

  return elements;
}

// ── Briefing Card ──────────────────────────────────────────────────────────────

function BriefingCard({ briefing, onAsk }: { briefing: Record<string, string | null>; onAsk: (q: string) => void }) {
  const stats = briefing.dashboard ? parseKeyValues(briefing.dashboard) : null;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl mx-auto">
      <div className="bg-brand-green/5 border border-brand-green/20 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-brand-green" />
          <h3 className="font-bold text-[13px] text-[#1E3D2B] dark:text-white">Today at a Glance</h3>
        </div>
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {stats.map(({ key, value }) => (
              <div key={key} className="bg-white dark:bg-white/5 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">{key}</p>
                <p className="font-bold text-[13px] text-[#1E3D2B] dark:text-white">{value}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {briefing.lowStock && briefing.lowStock.trim() !== 'No low stock products found.' && (
            <button onClick={() => onAsk('which products are low on stock')} className="flex items-center gap-1.5 text-[11px] bg-red-50 dark:bg-red-950/20 text-red-600 border border-red-200/60 px-2.5 py-1 rounded-full hover:bg-red-100 transition-colors">
              <AlertTriangle className="h-3 w-3" /> Low Stock Alert
            </button>
          )}
          <button onClick={() => onAsk('how many orders are in each status')} className="flex items-center gap-1.5 text-[11px] bg-blue-50 dark:bg-blue-950/20 text-blue-600 border border-blue-200/60 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors">
            <Tag className="h-3 w-3" /> Order Status
          </button>
          <button onClick={() => onAsk('show revenue trend for last 14 days')} className="flex items-center gap-1.5 text-[11px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-200/60 px-2.5 py-1 rounded-full hover:bg-emerald-100 transition-colors">
            <TrendingUp className="h-3 w-3" /> Revenue Trend
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function parseKeyValues(text: string): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/\*\*([^*]+)\*\*:\s*(.+)/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].replace(/\*\*/g, '').split('|')[0].trim();
      if (pairs.length < 4) pairs.push({ key, value });
    }
  }
  return pairs;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [briefing, setBriefing] = useState<Record<string, string | null> | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserTextRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  // Load DB history on mount
  useEffect(() => {
    (async () => {
      try {
        const history = await api.getAdminChatHistory();
        if (history.length > 0) {
          setMessages(history.map((m) => ({
            ...m,
            sender: m.sender,
            timestamp: new Date(m.timestamp),
          })));
        }
      } catch { /* not fatal */ }
      setHistoryLoaded(true);
    })();
  }, []);

  // Load briefing once history loaded and chat is empty
  useEffect(() => {
    if (!historyLoaded) return;
    if (messages.length > 0) return;
    (async () => {
      try {
        const data = await api.getAdminChatbotBriefing();
        setBriefing(data);
      } catch { /* not fatal */ }
    })();
  }, [historyLoaded, messages.length]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const buildHistory = useCallback((currentMessages: Message[]): HistoryItem[] =>
    currentMessages.slice(-MAX_HISTORY_TURNS).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      text: m.text,
    })), []);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const trimmed = text.trim();
    lastUserTextRef.current = trimmed;

    const userMsg: Message = { id: `msg-${Date.now()}-user`, sender: 'user', text: trimmed, timestamp: new Date() };
    const historySnapshot = buildHistory(messages);

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);
    setShowSuggestions(false);
    setBriefing(null);

    // Create streaming assistant message placeholder
    const assistantId = `msg-${Date.now()}-assistant`;
    setMessages((prev) => [...prev, { id: assistantId, sender: 'assistant', text: '', timestamp: new Date(), streaming: true }]);

    abortRef.current = new AbortController();

    try {
      const token = api.getAdminAuthToken();
      const url = api.getAdminChatStreamUrl();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed, history: historySnapshot }),
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') break;
          try {
            const { delta } = JSON.parse(data);
            if (delta) {
              fullText += delta;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, text: fullText } : m)
              );
            }
          } catch { /* skip */ }
        }
      }

      // Mark streaming done
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m)
      );

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, text: '⏹ Stopped.', streaming: false } : m));
      } else {
        const errMsg = err?.message || 'Connection failed.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: `❌ **Failed to get a response.**\n\n*Error:* ${errMsg}\n\nPlease check server connection or \`GEMINI_API_KEY\` in your \`.env\`.`, streaming: false }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleResetChat = async () => {
    setMessages([]);
    setShowSuggestions(false);
    setBriefing(null);
    try { await api.clearAdminChatHistory(); } catch { /* not fatal */ }
    // Reload briefing for empty state
    setTimeout(async () => {
      try { const data = await api.getAdminChatbotBriefing(); setBriefing(data); } catch { /* */ }
    }, 300);
  };

  const handleStopStream = () => {
    abortRef.current?.abort();
  };

  const handleCopy = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch { /* clipboard N/A */ }
  };

  const handleRetry = () => {
    if (!lastUserTextRef.current) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.sender === 'assistant' && last.text.startsWith('❌')) return prev.slice(0, -1);
      return prev;
    });
    setTimeout(() => handleSendMessage(lastUserTextRef.current), 50);
  };

  const dynamicPrompts = [
    { title: 'Dashboard Overview', desc: "Today's orders, revenue, and pending fulfillments.", query: "give me an overview of today's orders, revenue, and customer counts", icon: TrendingUp, color: 'from-purple-500/10 to-pink-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
    { title: 'Low Stock Alert', desc: 'Which products are running low?', query: 'which products are low on stock', icon: ShoppingCart, color: 'from-orange-500/10 to-amber-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
    { title: 'Abandoned Carts', desc: 'Customers who left without ordering.', query: 'which customers left without ordering', icon: Users, color: 'from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
    { title: 'Revenue Trend', desc: 'Day-by-day revenue for 14 days.', query: 'show revenue trend for last 14 days', icon: BarChart2, color: 'from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
    { title: 'Week vs Last Week', desc: 'Compare this week to last week.', query: 'compare this week vs last week', icon: Zap, color: 'from-violet-500/10 to-purple-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
    { title: 'Store Sales', desc: 'Physical store performance today.', query: 'show store sales for today', icon: Store, color: 'from-teal-500/10 to-cyan-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
    { title: 'Failed Payments', desc: 'Failed and pending payment records.', query: 'show failed and pending payments', icon: CreditCard, color: 'from-red-500/10 to-rose-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
    { title: 'Active Subscriptions', desc: 'Recurring orders and upcoming deliveries.', query: 'show active subscriptions and upcoming deliveries', icon: Repeat, color: 'from-sky-500/10 to-blue-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' },
    { title: 'WhatsApp Queue', desc: 'Support sessions waiting for reply.', query: 'show whatsapp support queue', icon: MessageCircle, color: 'from-green-500/10 to-emerald-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
    { title: 'Wallet Balances', desc: 'Customers with unused wallet credits.', query: 'show customers with wallet balances', icon: Star, color: 'from-yellow-500/10 to-amber-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
    { title: 'Pending Reminders', desc: 'Overdue and upcoming store reminders.', query: 'show pending and overdue reminders', icon: Bell, color: 'from-pink-500/10 to-rose-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20' },
    { title: 'Active Coupons', desc: 'All coupons, usage, and expiry.', query: 'show me all coupons and their usage', icon: KeyRound, color: 'from-cyan-500/10 to-sky-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' },
    { title: 'Order Status', desc: 'Count of orders per status.', query: 'how many orders are in each status', icon: Tag, color: 'from-rose-500/10 to-pink-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
    { title: 'Recent Feedback', desc: 'Latest reviews and customer feedback.', query: 'show me recent customer reviews and feedback', icon: Star, color: 'from-amber-500/10 to-yellow-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
    { title: 'New Customers', desc: 'Customers who joined this week.', query: 'show new customers who joined this week', icon: UserPlus, color: 'from-indigo-500/10 to-violet-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
    { title: 'Monthly Report', desc: 'Full 30-day analytics summary.', query: 'monthly analytics report', icon: TrendingUp, color: 'from-slate-500/10 to-gray-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20' },
  ];

  const isEmpty = messages.length === 0 && historyLoaded;

  return (
    <div className="flex flex-col h-screen bg-[#F7F5F0] dark:bg-background">
      <Header title="AI - Aditya Intelligence" description="Talk to your dashboard data intelligently" />

      <div className="flex-1 flex flex-col min-h-0 p-6">
        <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 max-w-7xl w-full mx-auto">

          {/* Chat Window */}
          <div className="flex-1 flex flex-col bg-white/70 dark:bg-[#1E3D2B]/10 backdrop-blur-md border border-white/40 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden min-h-0">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5 bg-white/40 dark:bg-black/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 rounded-xl bg-brand-green/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-brand-green animate-pulse" />
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] text-gray-900 dark:text-white leading-tight">AI - Aditya Intelligence</h3>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleResetChat} title="Clear Conversation" className="hover:bg-red-500/10 hover:text-red-500 text-gray-400 rounded-full h-8 w-8 transition-colors">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
              <AnimatePresence initial={false}>
                {isEmpty ? (
                  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col justify-start items-center text-center p-4 max-w-2xl mx-auto pt-4">
                    <div className="h-16 w-16 rounded-full bg-brand-green/5 border border-brand-green/20 flex items-center justify-center mb-5 animate-bounce">
                      <Bot className="h-8 w-8 text-brand-green" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Welcome to AI - Aditya Intelligence!</h2>
                    <p className="text-sm text-muted-foreground mb-6">Ask anything about your store — orders, customers, inventory, payments, subscriptions, and more.</p>

                    {/* Proactive briefing */}
                    {briefing && <BriefingCard briefing={briefing} onAsk={handleSendMessage} />}

                    {/* Suggestion grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                      {dynamicPrompts.slice(0, 8).map((p, idx) => (
                        <motion.div key={idx} whileHover={{ y: -3, scale: 1.01 }} onClick={() => handleSendMessage(p.query)}
                          className={cn('cursor-pointer p-4 rounded-xl border bg-gradient-to-r flex flex-col text-left transition-all duration-200', p.color)}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <p.icon className="h-4 w-4" />
                            <h4 className="font-bold text-[13px] tracking-tight">{p.title}</h4>
                          </div>
                          <p className="text-[11px] leading-normal opacity-80">{p.desc}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  messages.map((msg) => (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className={cn('flex items-start gap-3.5 rounded-2xl p-4 shadow-sm group',
                        msg.sender === 'user' ? 'ml-auto max-w-[80%] bg-brand-green text-white rounded-tr-none flex-row-reverse' : 'w-full bg-white dark:bg-[#1E3D2B]/30 border border-gray-100 dark:border-white/5 rounded-tl-none')}>
                      <div className={cn('h-8 w-8 rounded-lg shrink-0 flex items-center justify-center', msg.sender === 'user' ? 'bg-white/10 text-white' : 'bg-brand-green/10 text-brand-green')}>
                        {msg.sender === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 overflow-hidden min-w-0">
                        {msg.sender === 'user' ? (
                          <p className="text-sm font-medium leading-relaxed break-words">{msg.text}</p>
                        ) : msg.streaming && !msg.text ? (
                          // Waiting for first token — bouncing dots
                          <div className="flex flex-col gap-2 py-1">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-brand-green animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="h-2 w-2 rounded-full bg-brand-green animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="h-2 w-2 rounded-full bg-brand-green animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">Fetching data & generating response...</span>
                          </div>
                        ) : (
                          // Text streaming in
                          <div className="space-y-1.5 break-words">
                            {renderMarkdown(msg.text)}
                            {msg.streaming && (
                              <span className="inline-block h-[1.1em] w-[2px] bg-brand-green rounded-full animate-[pulse_0.8s_ease-in-out_infinite] ml-0.5 align-middle" />
                            )}
                          </div>
                        )}
                        <div className={cn('flex items-center mt-1.5 gap-2', msg.sender === 'user' ? 'justify-start flex-row-reverse' : 'justify-between')}>
                          <span className={cn('text-[9px] font-mono', msg.sender === 'user' ? 'text-white/40' : 'text-muted-foreground')}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.sender === 'assistant' && !msg.streaming && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {msg.text.startsWith('❌') && (
                                <button onClick={handleRetry} title="Retry" className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 px-2 py-0.5 rounded-full transition-colors">
                                  <RotateCcw className="h-3 w-3" /> Retry
                                </button>
                              )}
                              <button onClick={() => handleCopy(msg.id, msg.text)} title="Copy" className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 transition-colors">
                                {copiedMsgId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions panel (post-first-message) */}
            <AnimatePresence>
              {messages.length > 0 && showSuggestions && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-gray-100 dark:border-white/5">
                  <div className="px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white/20 dark:bg-black/10 max-h-56 overflow-y-auto">
                    {dynamicPrompts.map((p, idx) => (
                      <motion.div key={idx} whileHover={{ scale: 1.02 }} onClick={() => handleSendMessage(p.query)}
                        className={cn('cursor-pointer p-2.5 rounded-lg border bg-gradient-to-r flex items-center gap-2 text-left transition-all duration-200', p.color)}>
                        <p.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-semibold text-[11px] truncate">{p.title}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input bar */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 bg-white/40 dark:bg-black/10 shrink-0">
              {messages.length > 0 && (
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={() => setShowSuggestions((p) => !p)}
                    className={cn('flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                      showSuggestions ? 'bg-brand-green/10 text-brand-green border-brand-green/20' : 'text-gray-400 border-gray-200 dark:border-white/10 hover:text-brand-green hover:border-brand-green/20')}>
                    {showSuggestions ? <X className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
                    Suggestions
                  </button>
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }}
                className="flex items-center gap-3 bg-white dark:bg-background border border-gray-200 dark:border-white/10 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-brand-green transition-all">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isLoading ? 'Thinking...' : "Ask anything (e.g. 'failed payments', 'store sales this week', 'compare this week vs last')"}
                  disabled={isLoading}
                  maxLength={500}
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-gray-400 dark:text-white"
                />
                {isLoading ? (
                  <Button type="button" size="icon" onClick={handleStopStream} className="bg-red-500 hover:bg-red-600 text-white rounded-lg h-9 w-9 flex items-center justify-center transition-colors">
                    <X className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" disabled={!inputValue.trim()} className="bg-brand-green hover:bg-[#153125] text-white rounded-lg h-9 w-9 flex items-center justify-center transition-colors disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </form>
            </div>

          </div>

          {/* Sidebar */}
          <div className="w-full md:w-72 shrink-0 flex flex-col gap-5">
            <Card className="rounded-2xl border-white/40 bg-white/50 backdrop-blur-md shadow-lg overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Sparkles className="h-4 w-4 text-brand-green" />
                  <h4 className="font-bold text-[14px] text-gray-900 dark:text-white">Data Coverage</h4>
                </div>
                <div className="space-y-2.5">
                  {[
                    { icon: TrendingUp, color: 'bg-purple-500/10 text-purple-600', label: 'Orders & Revenue' },
                    { icon: Users, color: 'bg-emerald-500/10 text-emerald-600', label: 'Customers & History' },
                    { icon: ShoppingCart, color: 'bg-orange-500/10 text-orange-600', label: 'Inventory & Products' },
                    { icon: Store, color: 'bg-teal-500/10 text-teal-600', label: 'Store Sales (offline)' },
                    { icon: CreditCard, color: 'bg-red-500/10 text-red-600', label: 'Payments & Failures' },
                    { icon: Repeat, color: 'bg-sky-500/10 text-sky-600', label: 'Subscriptions' },
                    { icon: MessageCircle, color: 'bg-green-500/10 text-green-600', label: 'WhatsApp Queue' },
                    { icon: Star, color: 'bg-yellow-500/10 text-yellow-600', label: 'Wallet & Reviews' },
                    { icon: Bell, color: 'bg-pink-500/10 text-pink-600', label: 'Reminders' },
                    { icon: KeyRound, color: 'bg-cyan-500/10 text-cyan-600', label: 'Coupons' },
                  ].map(({ icon: Icon, color, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className={cn('h-6 w-6 rounded-md flex items-center justify-center shrink-0', color)}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 font-medium">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-brand-green/[0.04] border border-brand-green/10 rounded-xl p-3 flex items-center gap-2.5">
                  <Bot className="h-4 w-4 text-brand-green shrink-0" />
                  <div>
                    <p className="text-[11px] font-bold text-brand-green">Streaming Active</p>
                    <span className="text-[9px] text-muted-foreground">Responses appear token-by-token</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-white/40 bg-white/50 backdrop-blur-md shadow-lg p-5">
              <h4 className="font-bold text-[13px] text-gray-900 dark:text-white mb-2">Prompting Tips</h4>
              <ul className="list-disc list-inside text-[11px] text-muted-foreground space-y-1.5 leading-relaxed pl-1">
                <li><em className="text-gray-700 font-medium">"orders in May 2025"</em> — date range queries</li>
                <li><em className="text-gray-700 font-medium">"compare this week vs last week"</em> — period comparison</li>
                <li><em className="text-gray-700 font-medium">"store sales last month"</em> — physical store data</li>
                <li><em className="text-gray-700 font-medium">"failed payments"</em> — payment tracking</li>
                <li><em className="text-gray-700 font-medium">"active subscriptions"</em> — recurring orders</li>
                <li>Follow-up questions work — the AI remembers context.</li>
              </ul>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
