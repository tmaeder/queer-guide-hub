/**
 * The edge Product block is the canonical one for a listing page (the SPA
 * skips its own when this is present, src/hooks/useMeta.ts), so it must carry
 * sku = listing id.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveDetailRoute } from './detail';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' } as never;
const LISTING = {
  id: '2b367810-0000-4000-8000-000000000000',
  title: 'Boxer Briefs',
  slug: 'boxer-briefs',
  images: ['https://img.example/a.jpg'],
  price: 20,
  currency: 'usd',
  content_rating: 'sfw',
};

afterEach(() => vi.unstubAllGlobals());

/** Bodies of the JSON-LD <script> blocks the edge builds (our own output, not HTML sanitising). */
function jsonLdBodies(html: string): string[] {
  const bodies: string[] = [];
  const lower = html.toLowerCase();
  let at = 0;
  for (;;) {
    const open = lower.indexOf('<script', at);
    if (open < 0) return bodies;
    const start = lower.indexOf('>', open) + 1;
    const end = lower.indexOf('</script', start);
    if (start <= 0 || end < 0) return bodies;
    bodies.push(html.slice(start, end));
    at = end + 1;
  }
}

describe('marketplace listing Product JSON-LD', () => {
  it('carries sku = listing id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname.includes('/rpc/')) return new Response('null', { status: 200 });
        const rows = u.pathname.endsWith('/marketplace_listings') ? [LISTING] : [];
        return new Response(JSON.stringify(rows), { status: 200 });
      }),
    );
    const detail = await resolveDetailRoute(ENV, '/marketplace/boxer-briefs');
    const blocks = jsonLdBodies(detail?.jsonLd ?? '').map(
      (body) => JSON.parse(body) as Record<string, unknown>,
    );
    const products = blocks.filter((b) => b['@type'] === 'Product');
    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe(LISTING.id);
  });
});
