/**
 * RAG utilities for the admin chatbot.
 *
 * Covers: Zod validation, query normalisation, semantic cache-key fingerprinting,
 * context re-ranking (keyword + recency scoring), and context compression.
 */

import { z } from 'zod';
import * as crypto from 'crypto';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

export const ChatbotIntentSchema = z.object({
  topic: z.enum([
    'orders', 'revenue', 'customers', 'inventory', 'feedback',
    'coupons', 'payments', 'subscriptions', 'store_sales',
    'wallet', 'reminders', 'whatsapp', 'overview',
    'email', 'login', 'abandoned_carts', 'top_products',
  ]),
  timePreset: z.enum([
    'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_30_days',
  ]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  filters: z.object({
    status: z.string().optional(),
    paymentMethod: z.enum(['cod', 'prepaid']).optional(),
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    productName: z.string().optional(),
    minRating: z.number().min(1).max(5).optional(),
    maxRating: z.number().min(1).max(5).optional(),
    feedbackType: z.enum(['review', 'complaint', 'suggestion']).optional(),
    couponStatus: z.enum(['active', 'expired', 'upcoming', 'inactive']).optional(),
    minSpent: z.number().optional(),
    outOfStock: z.boolean().optional(),
    inStock: z.boolean().optional(),
  }).optional(),
  action: z.enum(['list', 'count', 'summary', 'trend', 'compare', 'search']).optional(),
  emailTo: z.string().optional(),
  emailReportType: z.string().optional(),
  emailConfirm: z.boolean().optional(),
});

export type ValidatedIntent = z.infer<typeof ChatbotIntentSchema>;

export const ChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(2000),
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(500).trim(),
  history: z.array(ChatHistoryItemSchema).max(12).default([]),
});

// ─── Query normalisation ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'please', 'tell', 'show', 'give', 'get', 'find', 'list', 'what', 'which',
  'how', 'many', 'much', 'me', 'my', 'our', 'us', 'i', 'you', 'your',
  'it', 'its', 'this', 'that', 'these', 'those', 'all', 'any', 'some',
  'in', 'on', 'at', 'by', 'for', 'with', 'about', 'of', 'to', 'from',
  'up', 'into', 'through', 'during', 'including', 'until', 'against',
  'between', 'without', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
]);

/**
 * Normalize a raw user query to a canonical form.
 * Lowercases, strips punctuation, removes stop-words, deduplicates tokens.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s₹]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .sort()
    .join(' ')
    .trim();
}

/**
 * Build a short semantic fingerprint for Redis cache keying.
 * Similar queries that share the same normalised tokens produce the same key.
 */
export function queryFingerprint(normalized: string): string {
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Build the semantic cache key for a chatbot tool result.
 * Two queries with the same topic, time preset, and filters hit the same key.
 */
export function intentCacheKey(intent: ValidatedIntent): string {
  const parts = [
    intent.topic,
    intent.timePreset ?? 'none',
    intent.action ?? 'none',
    intent.filters?.status ?? '',
    intent.filters?.paymentMethod ?? '',
    intent.filters?.customerName ?? '',
    intent.filters?.productName ?? '',
    intent.filters?.couponStatus ?? '',
    intent.filters?.feedbackType ?? '',
    String(intent.filters?.outOfStock ?? ''),
    String(intent.filters?.inStock ?? ''),
    intent.from ?? '',
    intent.to ?? '',
  ];
  const canonical = parts.join('|').toLowerCase();
  return `chatbot:intent:${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;
}

// ─── Context re-ranking ───────────────────────────────────────────────────────

/**
 * Score a single RAG context block against the normalised query using simple
 * keyword overlap (BM25-lite).  Returns 0-1 where 1 = perfect match.
 *
 * This keeps the expensive Gemini reranker call avoidable for most queries;
 * reserve the cross-encoder for ambiguous multi-block results if needed.
 */
export function scoreContextBlock(block: string, normalizedQuery: string): number {
  if (!block || !normalizedQuery) return 0;
  const queryTokens = new Set(normalizedQuery.split(' ').filter(Boolean));
  if (queryTokens.size === 0) return 0;

  const blockLower = block.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (blockLower.includes(token)) hits++;
  }

  // Boost blocks that are small (focused results are more relevant than dumps)
  const lengthPenalty = Math.min(1, 800 / Math.max(block.length, 100));
  return (hits / queryTokens.size) * 0.7 + lengthPenalty * 0.3;
}

/**
 * Re-rank retrieved context blocks by relevance to the normalised query.
 * Blocks that are clearly more relevant rise to the top so they consume the
 * first portion of the MAX_CONTEXT_CHARS budget.
 */
export function rerankContextBlocks(
  blocks: string[],
  normalizedQuery: string,
): string[] {
  if (blocks.length <= 1) return blocks;
  return [...blocks]
    .map((b) => ({ block: b, score: scoreContextBlock(b, normalizedQuery) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.block);
}

// ─── Context compression ──────────────────────────────────────────────────────

/**
 * Compress a single context block to at most `maxChars`.
 * Strategy: keep header line + first N lines that contain numbers / key metrics.
 */
export function compressBlock(block: string, maxChars: number): string {
  if (block.length <= maxChars) return block;

  const lines = block.split('\n');
  const header = lines[0]; // e.g. "[RAG: get_orders_by_status]"
  const rest = lines.slice(1);

  // Prioritise lines that contain numeric data (₹, digits, percentages)
  const METRIC_RE = /[₹\d%]/;
  const metricLines = rest.filter((l) => METRIC_RE.test(l));
  const otherLines = rest.filter((l) => !METRIC_RE.test(l));

  const ordered = [...metricLines, ...otherLines];
  const budget = maxChars - header.length - 4; // 4 for '\n...'
  let body = '';
  for (const line of ordered) {
    if (body.length + line.length + 1 > budget) break;
    body += line + '\n';
  }

  const truncated = block.length - (header.length + body.length) > 0;
  return `${header}\n${body}${truncated ? '...' : ''}`.trimEnd();
}

/**
 * Compress all context blocks so their combined length fits within `totalBudget`.
 * Allocates budget proportionally to each block's relevance score.
 */
export function compressContext(
  blocks: string[],
  normalizedQuery: string,
  totalBudget: number,
): string[] {
  if (!blocks.length) return blocks;

  const scores = blocks.map((b) => Math.max(0.1, scoreContextBlock(b, normalizedQuery)));
  const totalScore = scores.reduce((s, x) => s + x, 0);
  const budgets = scores.map((s) => Math.floor((s / totalScore) * totalBudget));

  return blocks.map((b, i) => compressBlock(b, Math.max(200, budgets[i])));
}

// ─── Few-shot examples for synthesis ─────────────────────────────────────────

export const SYNTHESIS_FEW_SHOTS = `
Example 1:
User: "how many orders do I have"
Data: [RAG: get_orders_by_status]\nAll-time Total: **47**\n- placed: 3\n- delivered: 40\n- cancelled: 4
Answer: You have **47 total orders** all-time: 40 delivered, 3 in progress, 4 cancelled.

Example 2:
User: "revenue this week"
Data: [RAG: get_revenue_trend]\nTotal: ₹12,450 | 18 orders\n- 2025-06-06 | ₹1800 | 3 orders\n- 2025-06-07 | ₹2200 | 4 orders
Answer: **₹12,450** revenue this week across **18 orders**.

Example 3:
User: "low stock items"
Data: [RAG: search_low_stock_products]\n- **Desi Ghee 500g** (SKU: GH-001) | Stock: 2 | Threshold: 10\n- **Mustard Oil 1L** (SKU: OIL-003) | Stock: 5 | Threshold: 10
Answer: **2 items** are low on stock:\n• Desi Ghee 500g — only **2** left\n• Mustard Oil 1L — only **5** left\n\nRestock these soon.

Example 4 (today=0, but history has orders):
User: "show orders"
Data: [RAG: get_dashboard_summary]\nToday's Orders: 0 (0 means no orders placed yet today, not all-time total)\nThis Month's Orders: 23\n[RAG: get_orders_by_status]\nAll-time Total: **89**\n- delivered: 60\n- placed: 3
Answer: No orders yet today. **23 this month**, **89 all-time** (60 delivered, 3 new).
`.trim();
