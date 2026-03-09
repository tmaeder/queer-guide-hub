/**
 * Cloudflare Workers AI helper.
 * All AI inference goes through the Workers AI binding (env.AI).
 * No external AI API keys needed.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionOptions {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  /** If true, instructs the model to return JSON */
  json?: boolean;
}

/**
 * Run a text generation completion via Cloudflare Workers AI.
 * Uses @cf/meta/llama-3.1-70b-instruct by default.
 */
export async function aiComplete(
  ai: Ai,
  opts: AiCompletionOptions,
): Promise<string> {
  const messages = [...opts.messages];

  // If JSON output is requested, add instruction to system prompt
  if (opts.json) {
    const sysIdx = messages.findIndex((m) => m.role === 'system');
    const jsonInstruction = '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation.';
    if (sysIdx >= 0) {
      messages[sysIdx] = { ...messages[sysIdx], content: messages[sysIdx].content + jsonInstruction };
    } else {
      messages.unshift({ role: 'system', content: 'You are a helpful assistant.' + jsonInstruction });
    }
  }

  const result = await ai.run('@cf/meta/llama-3.1-70b-instruct', {
    messages,
    max_tokens: opts.max_tokens ?? 2000,
    temperature: opts.temperature ?? 0.3,
  }) as { response?: string };

  return result.response || '';
}

/**
 * Run text embedding via Cloudflare Workers AI.
 * Uses @cf/baai/bge-base-en-v1.5.
 */
export async function aiEmbed(
  ai: Ai,
  texts: string[],
): Promise<number[][]> {
  const result = await ai.run('@cf/baai/bge-base-en-v1.5', {
    text: texts,
  }) as { data?: number[][] };

  return result.data || [];
}

/**
 * Analyze an image via Cloudflare Workers AI vision model.
 * Uses @cf/llava-hf/llava-1.5-7b-hf for image understanding.
 */
export async function aiVision(
  ai: Ai,
  imageBytes: Uint8Array,
  prompt: string,
): Promise<string> {
  const result = await ai.run('@cf/llava-hf/llava-1.5-7b-hf', {
    image: Array.from(imageBytes),
    prompt,
    max_tokens: 1024,
  }) as { description?: string };

  return result.description || '';
}

/**
 * Summarize text via Workers AI.
 */
export async function aiSummarize(
  ai: Ai,
  text: string,
  maxLength = 200,
): Promise<string> {
  return aiComplete(ai, {
    messages: [
      { role: 'system', content: `Summarize the following text in at most ${maxLength} words. Be concise.` },
      { role: 'user', content: text },
    ],
    max_tokens: maxLength * 2,
  });
}
