'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, Send, Loader2, Sparkles } from 'lucide-react';

type Msg = { role: 'user' | 'assistant'; text: string };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7001/api/v1').replace(/\/$/, '');

const GREETING: Msg = {
  role: 'assistant',
  text: "Hi! I'm the NatureLite assistant. Ask me about our products, prices, or your order status.",
};

const QUICK_PROMPTS = ['What oils do you sell?', 'Check my order', 'Best ghee?'];

async function fetchReply(
  message: string,
  history: Msg[],
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(`${API_BASE}/chatbot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
    signal,
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // Backend wraps all responses: { success, data: { reply }, timestamp }
  const reply = json.data?.reply ?? json.reply;
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('Empty reply');
  return reply;
}

export function AiChatbotFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // Client-side rate limiter: timestamps of recent sends (mirrors backend 10 req/60s limit)
  const sendTimestamps = useRef<number[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      setHasNew(false);
      // Defer focus so the panel animation doesn't fight it
      const t = setTimeout(() => inputRef.current?.focus(), 140);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Client-side rate limit: max 10 messages per 60s (mirrors backend throttle)
    const now = Date.now();
    const recent = sendTimestamps.current.filter((t) => now - t < 60_000);
    if (recent.length >= 10) {
      const oldestInWindow = recent[0];
      const waitSec = Math.ceil((60_000 - (now - oldestInWindow)) / 1000);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `You're sending messages too quickly. Please wait ${waitSec}s before trying again.` },
      ]);
      return;
    }
    sendTimestamps.current = [...recent, now];

    setInput('');
    const userMsg: Msg = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Cancel any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 30s client timeout — compatible with all browsers (vs AbortSignal.timeout)
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      // History = completed prior turns only, no greeting (index 0), no current msg.
      // Gemini requires history alternates user→model starting with user.
      const history = messages.slice(1).slice(-6);
      const reply = await fetchReply(text, history, controller.signal);

      if (!mountedRef.current) return;
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
      if (!open) setHasNew(true);
    } catch (err) {
      if (!mountedRef.current) return;
      const errMsg = (err as Error).message;
      const errorText =
        errMsg === 'RATE_LIMITED'
          ? 'Too many messages. Please wait a moment before sending again.'
          : (err as Error).name === 'AbortError'
            ? 'The request timed out. Please try again.'
            : 'Connection error. Please try again or reach us on WhatsApp.';
      setMessages((prev) => [...prev, { role: 'assistant', text: errorText }]);
    } finally {
      clearTimeout(timer);
      if (mountedRef.current) setLoading(false);
    }
  }, [input, loading, messages, open]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const setQuickPrompt = (q: string) => {
    setInput(q);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* ── FAB button — stacked above WhatsApp FAB ── */}
      <div className="fixed z-[44] bottom-[154px] sm:bottom-[92px] right-5">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
          aria-expanded={open}
          aria-haspopup="dialog"
          style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1E3D2B 0%, #2d5a3f 100%)',
            boxShadow: '0 4px 20px -3px rgba(30,61,43,0.60)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span
                key="close"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 90 }}
                transition={{ duration: 0.16 }}
              >
                <X size={20} color="#E8A838" />
              </motion.span>
            ) : (
              <motion.span
                key="bot"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.16 }}
              >
                <Bot size={22} color="#E8A838" />
              </motion.span>
            )}
          </AnimatePresence>

          {/* Unread indicator */}
          <AnimatePresence>
            {hasNew && !open && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: '#E8A838',
                  border: '2px solid #1E3D2B',
                }}
              />
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Chat panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="NatureLite AI Assistant"
            aria-modal="false"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="ai-chat-panel"
            style={{
              position: 'fixed',
              right: 20,
              width: 'min(340px, calc(100vw - 40px))',
              height: 'min(460px, calc(100vh - 240px))',
              background: '#fff',
              borderRadius: 20,
              boxShadow:
                '0 16px 60px -8px rgba(30,61,43,0.28), 0 4px 18px -4px rgba(0,0,0,0.10)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 44,
            }}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1E3D2B 0%, #2d5a3f 100%)',
                padding: '13px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'rgba(232,168,56,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Sparkles size={17} color="#E8A838" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                  NatureLite Assistant
                </div>
                <div style={{ color: 'rgba(255,255,255,0.50)', fontSize: 11, marginTop: 2 }}>
                  Products · Orders · Help
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.50)',
                  display: 'flex',
                  padding: 4,
                  borderRadius: 6,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages — aria-live so screen readers announce new replies */}
            <div
              role="log"
              aria-live="polite"
              aria-label="Chat messages"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '14px 14px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {msg.role === 'assistant' && (
                    <div
                      aria-hidden
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: '#f0ead8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginRight: 7,
                        alignSelf: 'flex-end',
                      }}
                    >
                      <Bot size={13} color="#1E3D2B" />
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '80%',
                      background: msg.role === 'user' ? '#1E3D2B' : '#f7f3ea',
                      color: msg.role === 'user' ? '#fff' : '#1a1a1a',
                      borderRadius:
                        msg.role === 'user'
                          ? '16px 16px 4px 16px'
                          : '16px 16px 16px 4px',
                      padding: '9px 13px',
                      fontSize: 13,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7 }}>
                  <div
                    aria-hidden
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: '#f0ead8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Bot size={13} color="#1E3D2B" />
                  </div>
                  <div
                    role="status"
                    aria-label="Assistant is thinking"
                    style={{
                      background: '#f7f3ea',
                      borderRadius: '16px 16px 16px 4px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Loader2 size={13} color="#1E3D2B" className="ai-spin" />
                    <span style={{ fontSize: 12, color: '#666' }}>Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} aria-hidden />
            </div>

            {/* Quick prompts — only on first open */}
            {messages.length === 1 && !loading && (
              <div
                style={{
                  padding: '0 14px 10px',
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  flexShrink: 0,
                }}
              >
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuickPrompt(q)}
                    style={{
                      background: '#f0ead8',
                      border: '1px solid #e0d4b8',
                      borderRadius: 20,
                      padding: '5px 11px',
                      fontSize: 11,
                      color: '#1E3D2B',
                      cursor: 'pointer',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div
              style={{
                borderTop: '1px solid #ede8d8',
                padding: '10px 12px',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexShrink: 0,
                background: '#faf8f3',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about products or your order…"
                maxLength={400}
                disabled={loading}
                aria-label="Type your message"
                style={{
                  flex: 1,
                  border: '1.5px solid #e4dcc8',
                  borderRadius: 12,
                  padding: '8px 12px',
                  fontSize: 13,
                  outline: 'none',
                  background: '#fff',
                  color: '#1a1a1a',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#1E3D2B')}
                onBlur={(e) => (e.target.style.borderColor = '#e4dcc8')}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                aria-label="Send message"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: input.trim() && !loading ? '#1E3D2B' : '#ccc8be',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                  flexShrink: 0,
                }}
              >
                <Send size={14} color="#fff" style={{ marginLeft: 1 }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes ai-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .ai-spin { animation: ai-spin 1s linear infinite; }
          /* Panel bottom: 50px FAB + 14px gap above FAB's own bottom */
          .ai-chat-panel { bottom: 218px; }
          @media (min-width: 640px) { .ai-chat-panel { bottom: 156px; } }
        `,
      }} />
    </>
  );
}
