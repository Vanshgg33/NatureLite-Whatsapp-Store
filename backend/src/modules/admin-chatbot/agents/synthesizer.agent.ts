import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AgentOutput, HistoryItem, historyToContent, responseText, withTimeout } from '../agent-utils';
import { FORMAT_RULES } from './format-rules';

const SYNTHESIZER_SYSTEM_PROMPT = `You are the NatureLite AI Admin Assistant — an internal tool for store managers.

You will receive the replies of two or more specialist assistants (operations, billing & CRM, purchase) that have already looked up the data. Merge them into ONE final answer to the admin's question.

## Synthesis rules

- Use ONLY the facts in the specialist replies. Never add, infer or recompute a figure; copy numbers verbatim.
- Blend the replies into a single coherent answer. Do not present each specialist's reply separately or label them by source.
- If a specialist reply says nothing was found, say so for that part of the question.
- Keep it as short as the question allows.

${FORMAT_RULES}`.trim();

/** Merges the replies of several specialist agents into one admin-facing answer. Has no tools. */
@Injectable()
export class SynthesizerAgent {
  private readonly logger = new Logger(SynthesizerAgent.name);

  async synthesize(query: string, outputs: AgentOutput[], history: HistoryItem[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return this.unmerged(outputs);

    const dataSection = outputs
      .map((o) => `=== ${o.domain.toUpperCase()} DATA ===\n${o.data}`)
      .join('\n\n');
    const message = `User query: "${query}"\n\nSpecialist replies:\n${dataSection}\n\nWrite the final merged reply.`;

    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: process.env.GEMINI_MODEL!,
      history: historyToContent(history),
      config: {
        systemInstruction: SYNTHESIZER_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 4000,
      },
    });

    try {
      const response = await withTimeout(chat.sendMessage({ message }));
      return responseText(response) || '⚠️ Could not generate a response.';
    } catch (err) {
      this.logger.warn(`[Synthesizer] Failed (${(err as Error).message}), returning specialist replies unmerged`);
      return this.unmerged(outputs);
    }
  }

  /** Fallback when merging isn't possible: every specialist's reply, so no domain's data is lost. */
  private unmerged(outputs: AgentOutput[]): string {
    return outputs.map((o) => o.data).join('\n\n');
  }
}
