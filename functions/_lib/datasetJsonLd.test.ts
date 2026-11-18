import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetDatasetCache, datasetJsonLd, summariseSources } from './datasetJsonLd';
import type { Env } from './sitemap';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  ASSETS: { fetch },
} as unknown as Env;

function parse(html: string): Record<string, unknown> {
  const m = html.match(/<script type="application\/ld\+json">(.*)<\/script>/s);
  if (!m) throw new Error('no ld+json script');
  return JSON.parse(m[1]);
}

const ROWS = [
  {
    source: 'tripsit',
    source_url: 'https://combo.tripsit.me/',
    fetched_at: '2026-11-17T04:40:03Z',
  },
  {
    source: 'tripsit',
    source_url: 'https://combo.tripsit.me/',
    fetched_at: '2026-11-10T04:40:03Z',
  },
  {
    source: 'FDA label',
    source_url: 'https://dailymed.example/a',
    fetched_at: '2026-08-28T21:35:18Z',
  },
  {
    source: 'FDA label',
    source_url: 'https://dailymed.example/b',
    fetched_at: '2026-08-28T21:35:18Z',
  },
  { source: 'rave it safe', source_url: null, fetched_at: '2026-09-08T17:28:01Z' },
];

beforeEach(() => _resetDatasetCache());
afterEach(() => vi.unstubAllGlobals());

describe('datasetJsonLd', () => {
  it('returns nothing for pages that publish no dataset', async () => {
    expect(await datasetJsonLd(env, '/venues')).toBe('');
    expect(await datasetJsonLd(env, '/')).toBe('');
  });

  it.each(['/tags/rights-by-country', '/tags/rights-by-country/', '/tags/rights-by-country/trans'])(
    '%s is a Dataset built on ILGA, with a valid description and no invented licence',
    async (path) => {
      const ld = parse(await datasetJsonLd(env, path));
      expect(ld['@type']).toBe('Dataset');
      expect(ld.url).toBe(`https://queer.guide${path.replace(/\/$/, '')}`);
      const desc = ld.description as string;
      // Google Dataset Search requires 50–5000 characters.
      expect(desc.length).toBeGreaterThanOrEqual(50);
      expect(desc.length).toBeLessThanOrEqual(5000);
      expect(JSON.stringify(ld.isBasedOn)).toContain('ILGA World Database');
      expect(ld).not.toHaveProperty('license');
    },
  );

  it('credits the trans page to TGEU as well as ILGA', async () => {
    const ld = parse(await datasetJsonLd(env, '/tags/rights-by-country/trans'));
    const names = (ld.isBasedOn as { name: string }[]).map((s) => s.name);
    expect(names).toEqual([
      'ILGA World Database',
      'TGEU Trans Rights Map',
      'TGEU Trans Murder Monitoring',
    ]);
  });

  it('credits the interaction chart to exactly the sources in the table, one entry per name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(ROWS))),
    );
    const ld = parse(await datasetJsonLd(env, '/tags/interactions'));
    const based = ld.isBasedOn as { name: string; url?: string }[];
    expect(based.map((s) => s.name)).toEqual(['FDA label', 'rave it safe', 'tripsit']);
    expect(based.find((s) => s.name === 'rave it safe')).not.toHaveProperty('url');
    expect(ld.dateModified).toBe('2026-11-17T04:40:03Z');
  });

  it('emits nothing for the chart when the sources cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    expect(await datasetJsonLd(env, '/tags/interactions')).toBe('');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]')),
    );
    expect(await datasetJsonLd(env, '/tags/interactions')).toBe('');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timeout');
      }),
    );
    expect(await datasetJsonLd(env, '/tags/interactions')).toBe('');
  });

  it('caches a successful read, not a failed one', async () => {
    const fail = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fail);
    await datasetJsonLd(env, '/tags/interactions');
    const ok = vi.fn(async () => new Response(JSON.stringify(ROWS)));
    vi.stubGlobal('fetch', ok);
    expect(await datasetJsonLd(env, '/tags/interactions')).not.toBe('');
    await datasetJsonLd(env, '/tags/interactions');
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('summariseSources', () => {
  it('ignores blank source names', () => {
    expect(summariseSources([{ source: '  ', source_url: 'x', fetched_at: null }]).sources).toEqual(
      [],
    );
  });
});
