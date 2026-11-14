import type { Content } from '@google/genai';

export type HistoryItem = { role: 'user' | 'assistant'; text: string };
export type Domain = 'ops' | 'billing_crm' | 'purchase' | 'logics';
export interface AgentOutput { domain: Domain; data: string }

// Gemini 3.x can return null parts (thinking tokens); SDK's .text getter throws on them.
export function responseText(r: any): string {
  try {
    return (r.text ?? '').trim();
  } catch {
    return (r.candidates?.[0]?.content?.parts ?? [])
      .filter((p: any) => p != null && typeof p.text === 'string' && !p.thought)
      .map((p: any) => p.text as string)
      .join('').trim();
  }
}

export function historyToContent(history: HistoryItem[]): Content[] {
  const contents = history.map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }],
  }));
  // Gemini rejects history that starts with a model turn.
  while (contents.length > 0 && contents[0].role !== 'user') contents.shift();
  return contents;
}

export function withTimeout<T>(p: Promise<T>, ms = 30_000): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, rej) => {
    timer = setTimeout(() => rej(new Error('gemini_timeout')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function capArrays(obj: Record<string, unknown>, max: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = Array.isArray(v) && v.length > max ? v.slice(0, max) : v;
  }
  return out;
}

/** A change the assistant has prepared. It does nothing until the admin presses Confirm on its card. */
export interface ChatProposal {
  id: string;
  title: string;
  /** Plain-language lines describing exactly what will change. */
  lines: string[];
  startsOn: string;
  reason: string;
  /** For formula changes: the sample bill worked out today and with the change. */
  sample?: { text: string; today: Record<string, string>; withChange: Record<string, string> };
  expiresAt: string;
}

/** Per-request context handed to the specialists. `proposals` collects the cards to show under the reply. */
export interface ChatCtx {
  adminId?: string;
  proposals: ChatProposal[];
  /** True only when the question came from the floating assistant, the one screen that can show a Confirm card. */
  canPropose?: boolean;
}
