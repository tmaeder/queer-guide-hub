import {
  buildUserMessage,
  parseLLMResponse,
  SYSTEM_PROMPT,
  type ParsedBooking,
  type ParseInput,
} from './prompt';

// Minimal binding shape — avoids depending on @cloudflare/ai types.
export interface AiBinding {
  run(
    model: string,
    input: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      temperature?: number;
      max_tokens?: number;
    },
  ): Promise<{ response?: string } | { result?: { response?: string } }>;
}

export async function callWorkersAi(
  ai: AiBinding,
  model: string,
  input: ParseInput,
): Promise<ParsedBooking> {
  const out = await ai.run(model, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(input) },
    ],
    temperature: 0,
    max_tokens: 600,
  });

  // Workers AI returns `{ response }` directly when using the binding's
  // shorthand, or `{ result: { response } }` for the raw REST shape. Accept both.
  const text =
    ('response' in out && out.response) ||
    ('result' in out && out.result?.response) ||
    '';
  return parseLLMResponse(text as string);
}
