import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from '../sitemap-landings.xml';

// A failed pride fetch comes back from fetchRows as [], which used to be
// cached for an hour: the live sitemap lost every /pride/ URL until it expired.
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };

function run(status: number, body: unknown) {
  vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
  return (onRequest as unknown as (ctx: unknown) => Promise<Response>)({
    request: new Request('https://queer.guide/sitemap-landings.xml'),
    env,
    waitUntil: () => {},
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('sitemap-landings cache lifetime', () => {
  it('caches briefly when the pride fetch fails', async () => {
    const res = await run(500, { message: 'boom' });
    expect(res.headers.get('Cache-Control')).toContain('max-age=60,');
  });

  it('caches for an hour when pride rows come back', async () => {
    const year = new Date().getFullYear();
    const res = await run(200, [
      {
        start_date: `${year}-06-01`,
        country: 'DE',
        id: 'a',
        cities: { slug: 'berlin', seo_indexable: true },
      },
    ]);
    expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
  });
});
