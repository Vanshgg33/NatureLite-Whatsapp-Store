import type { Logger } from '@nestjs/common';
import type { Part } from '@google/genai';
import type { AdminChatbotToolsService } from '../admin-chatbot-tools.service';
import { capArrays, responseText, withTimeout } from '../agent-utils';

export interface ToolLoopOptions {
  chat: { sendMessage(params: { message: any }): Promise<any> };
  query: string;
  tools: Pick<AdminChatbotToolsService, 'execute'>;
  logger: Logger;
  /** Agent name used in log lines. */
  label: string;
  maxIterations: number;
  /** Returned when the model never produces any text. */
  emptyReply: string;
}

/**
 * Drive a Gemini chat until it answers in text: run each requested function call through
 * the tools service, feed the results back, and repeat up to `maxIterations` times.
 */
export async function runToolLoop(opts: ToolLoopOptions): Promise<string> {
  const { chat, query, tools, logger, label, maxIterations, emptyReply } = opts;

  let response = await withTimeout(chat.sendMessage({ message: query }));

  for (let i = 0; i < maxIterations; i++) {
    const parts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
    const fnParts = parts.filter((p) => p?.functionCall != null);
    if (fnParts.length === 0) return responseText(response) || emptyReply;

    const toolResponseParts: Part[] = [];
    for (const part of fnParts) {
      const { name, args } = part.functionCall as { name: string; args?: Record<string, unknown> };
      logger.log(`[${label}] ${name}(${JSON.stringify(args ?? {})})`);
      try {
        const result = await tools.execute(name, args ?? {});
        toolResponseParts.push({ functionResponse: { name, response: capArrays(result, 25) } } as any);
      } catch (err) {
        toolResponseParts.push({ functionResponse: { name, response: { error: (err as Error).message } } } as any);
      }
    }

    response = await withTimeout(chat.sendMessage({ message: toolResponseParts }));
  }

  // If the model still wants to call tools after exhausting the limit, force a text summary.
  const finalParts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
  if (finalParts.some((p) => p?.functionCall != null)) {
    response = await withTimeout(chat.sendMessage({ message: 'Summarize what you found so far.' }));
  }

  return responseText(response) || emptyReply;
}
