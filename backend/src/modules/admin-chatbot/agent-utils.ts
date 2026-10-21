import type { Content } from '@google/genai';

export type HistoryItem = { role: 'user' | 'assistant'; text: string };
export type Domain = 'ops' | 'billing_crm' | 'purchase';
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
