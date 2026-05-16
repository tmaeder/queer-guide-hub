import {
  buildUserMessage,
  parseLLMResponse,
  SYSTEM_PROMPT,
  type ParsedBooking,
  type ParseInput,
} from './prompt';

export async function callAnthropic(
  apiKey: string,
  model: string,
  input: ParseInput,
): Promise<ParsedBooking> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(input) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  return parseLLMResponse(text);
}
