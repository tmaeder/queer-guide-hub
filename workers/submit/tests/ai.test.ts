import { afterEach, describe, expect, it, vi } from 'vitest';
import { enrich } from '../src/ai';
import type { Env } from '../src/index';

const summary = 'A weekly queer bar night in Zürich featuring DJs and dancing.';
const input = { url: 'https://example.com/heldenbar', title: 'Heldenbar' };
function harness(result: unknown) {
  const run = vi.fn().mockResolvedValue(result);
  return { run, env: { AI: { run } } as unknown as Env };
}
afterEach(() => vi.useRealTimers());
describe('summary model response formats', () => {
  it.each([
    { choices: [{ message: { content: summary }, finish_reason: 'stop' }] },
    { response: summary },
    { response: { text: summary } },
    summary,
  ])('returns the same public shape for complete chat and legacy responses', async (result) => {
    const h = harness(result);
    expect(await enrich(h.env, input)).toEqual({ summary, suggested_tags: [] });
    expect(h.run).toHaveBeenCalledWith(
      '@cf/google/gemma-4-26b-a4b-it',
      expect.objectContaining({
        chat_template_kwargs: { enable_thinking: false },
      }),
      undefined,
    );
  });
  it.each([
    null,
    {},
    { choices: [] },
    { choices: [{ message: { content: null }, finish_reason: 'stop' }] },
    { choices: [{ message: { content: summary }, finish_reason: 'length' }] },
    { choices: [{ message: { content: summary }, finish_reason: 'tool_calls' }] },
  ])('rejects malformed and incomplete summaries', async (result) => {
    await expect(enrich(harness(result).env, input)).rejects.toThrow('no complete text response');
  });
  it('keeps the 240 character output limit', async () => {
    const result = await enrich(
      harness({ choices: [{ message: { content: 'x'.repeat(300) }, finish_reason: 'stop' }] }).env,
      input,
    );
    expect(result.summary).toHaveLength(240);
  });
  it('rejects a stalled model after five seconds', async () => {
    vi.useFakeTimers();
    const h = harness(null);
    h.run.mockImplementation(() => new Promise(() => {}));
    const pending = expect(enrich(h.env, input)).rejects.toThrow('summary timeout after 5000ms');
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
  });
});
