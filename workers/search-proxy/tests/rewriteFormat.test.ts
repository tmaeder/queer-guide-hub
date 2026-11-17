import { afterEach, describe, expect, it, vi } from 'vitest';
import { rewriteQuery } from '../src/rewrite';
import type { Env } from '../src/index';

const value = { q_en: 'gay bars zurich', synonyms: ['pub'], city: 'Zurich', type_hint: 'venue' };
function harness(result: unknown) {
  const run = vi.fn().mockResolvedValue(result);
  const put = vi.fn().mockResolvedValue(undefined);
  const env = {
    AI: { run },
    EMBED_CACHE: { get: vi.fn().mockResolvedValue(null), put },
  } as unknown as Env;
  return { env, run, put };
}
afterEach(() => vi.useRealTimers());

describe('rewrite model response formats', () => {
  it.each([
    { choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] },
    { response: JSON.stringify(value) },
  ])('parses complete chat and legacy responses', async (result) => {
    const h = harness(result);
    expect(await rewriteQuery(h.env, 'schwule bars in Zürich', 'de')).toEqual({
      ...value,
      city: 'zurich',
    });
    expect(h.put).toHaveBeenCalledOnce();
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
    { choices: [{ message: { content: value }, finish_reason: 'stop' }] },
    { choices: [{ message: { content: 'not json' }, finish_reason: 'stop' }] },
    { choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'length' }] },
    { choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'tool_calls' }] },
  ])('fails soft without caching malformed or incomplete output', async (result) => {
    const h = harness(result);
    expect(await rewriteQuery(h.env, 'schwul', 'de')).toBeNull();
    expect(h.put).not.toHaveBeenCalled();
  });
  it('keeps the five-second search deadline', async () => {
    vi.useFakeTimers();
    const h = harness(null);
    h.run.mockImplementation(() => new Promise(() => {}));
    const pending = rewriteQuery(h.env, 'schwul', 'de');
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBeNull();
  });
});
