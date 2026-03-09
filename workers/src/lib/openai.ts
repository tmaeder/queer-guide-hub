/**
 * OpenAI-compatible chat completion stub.
 * Delegates to Cloudflare Workers AI (env.AI) so no external API key is needed.
 * Drop-in replacement used by enrichment, imports, and media routes.
 */
import type { Env } from '../types';
import { aiComplete, type ChatMessage } from './ai';

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
}

/**
 * Run an OpenAI-style chat completion via Cloudflare Workers AI.
 * Accepts the same shape the calling code already uses and proxies through aiComplete.
 */
export async function chatCompletion(
  opts: ChatCompletionOptions,
  env: Env,
): Promise<string> {
  return aiComplete(env.AI, {
    messages: opts.messages,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature,
    json: opts.response_format?.type === 'json_object',
  });
}
