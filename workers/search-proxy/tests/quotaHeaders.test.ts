import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { type Env } from '../src/index';

afterEach(() => vi.useRealTimers());

function harness(counter: number) {
  const env = { SESSION_CACHE: { get: vi.fn().mockResolvedValue(String(counter)), put: vi.fn().mockResolvedValue(undefined) }, ALLOWED_ORIGINS: 'https://queer.guide' } as unknown as Env;
  return { env, ctx: { waitUntil: vi.fn() } as unknown as ExecutionContext };
}

describe('existing search quotas are machine-readable', () => {
  it('advertises actual remaining quota and seconds until the fixed minute resets', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T20:00:15Z'));
    const { env, ctx } = harness(12);
    // GET search is a bounded method error, so no database/AI request is needed.
    const r = await worker.fetch(new Request('https://search.queer.guide/search'), env, ctx);
    expect(r.status).toBe(405);
    expect(r.headers.get('RateLimit-Policy')).toBe('"search";q=60;w=60');
    expect(r.headers.get('RateLimit')).toBe('"search";r=47;t=45');
    expect(r.headers.get('RateLimit-Remaining')).toBe('47');
    expect(r.headers.get('Access-Control-Expose-Headers')).toContain('RateLimit-Policy');
    expect(env.SESSION_CACHE.put).toHaveBeenCalledWith(expect.stringContaining('rl:/search:'), '13', { expirationTtl: 120 });
  });
  it('retains the existing 429 body and Retry-After and does not increment an exhausted quota', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T20:00:15Z'));
    const { env, ctx } = harness(120);
    const r = await worker.fetch(new Request('https://search.queer.guide/autocomplete'), env, ctx);
    expect(r.status).toBe(429);
    expect(r.headers.get('RateLimit')).toBe('"search";r=0;t=45');
    expect(r.headers.get('RateLimit-Limit')).toBe('120');
    expect(r.headers.get('Retry-After')).toBe('45');
    expect((await r.json()).code).toBe('rate_limited');
    expect(env.SESSION_CACHE.put).not.toHaveBeenCalled();
  });
  it('preserves origin-locked writes and does not invent quotas on bypassed health/preflight', async () => {
    const { env, ctx } = harness(30);
    const denied = await worker.fetch(new Request('https://search.queer.guide/feedback', { headers: { Origin: 'https://untrusted.test' } }), env, ctx);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBe('');
    for (const req of [new Request('https://search.queer.guide/health'), new Request('https://search.queer.guide/search', { method: 'OPTIONS' })]) {
      const r = await worker.fetch(req, env, ctx);
      expect(r.headers.has('RateLimit')).toBe(false);
    }
  });
});
