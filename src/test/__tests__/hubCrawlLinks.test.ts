import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The hub pages served Googlebot ZERO links to any detail page.
 *
 * Measured on production 2026-09-10: of ~65 `href`s on /venues, 57 were
 * `/assets/*` bundles and 5 were site nav. None pointed at a venue — and the
 * same held for /cities, /tags, /personalities and /events. All 61,718 sitemap
 * URLs were therefore sitemap-only, with no internal link equity and no crawl
 * path. functions/_lib/hubLinks.ts closes that.
 *
 * Two things are guarded here, and the SECOND is the one that matters:
 *
 *  1. The block renders, and only for hub paths.
 *  2. THE SAFETY GATE. fetchRows PREFERS the service-role key and so BYPASSES
 *     RLS. If `safety_gated=eq.false` is ever dropped from a venue, event or
 *     hotel filter, this module publishes rows in criminalizing countries to
 *     anonymous crawlers. That is an outing risk, not a ranking regression, and
 *     it is exactly the defect that previously hit villageDetail and
 *     personalityDetail. `cities`/`countries` have no such column by design.
 */

const hubLinksSrc = readFileSync(join(process.cwd(), 'functions/_lib/hubLinks.ts'), 'utf8');

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Extract every PostgREST filter string literal from a source file. */
function filterLiterals(src: string): string[] {
  return [...src.matchAll(/'([^']*(?:slug=not\.is\.null|seo_indexable=)[^']*)'/g)].map((m) => m[1]);
}

describe('hub crawl links — safety gate', () => {
  // Tables whose rows can be safety-gated. Stated explicitly rather than
  // derived, so ADDING a gated table to hubLinks without adding it here is a
  // review question rather than a silent omission.
  const GATED = ['venues', 'events', 'hotels'];

  for (const table of GATED) {
    it(`${table} filter excludes safety_gated rows`, () => {
      // The spec block for this table, up to the next table's block.
      const at = hubLinksSrc.indexOf(`table: '${table}'`);
      expect(at, `no hub spec for ${table}`).toBeGreaterThan(-1);
      const block = hubLinksSrc.slice(at, at + 700);
      const filter = /filter:\s*\n?\s*'([^']+)'/.exec(block);
      expect(filter, `no filter found for ${table}`).not.toBeNull();
      expect(filter![1]).toContain('safety_gated=eq.false');
    });
  }

  it('every hub filter gates on seo_indexable', () => {
    const filters = filterLiterals(hubLinksSrc);
    expect(filters.length).toBeGreaterThanOrEqual(7);
    for (const f of filters) expect(f).toContain('seo_indexable=eq.true');
  });

  it('the gates still agree with the sitemap generators', () => {
    // Rule 2 of hubLinks.ts is that these are copied verbatim from the
    // already-reviewed sitemap gates. Without this the two silently diverge and
    // the crawler body starts advertising rows the sitemap refuses to list.
    const pairs: [string, string][] = [
      ['venues', 'functions/sitemap-venues.xml.ts'],
      ['personalities', 'functions/sitemap-personalities.xml.ts'],
      ['hotels', 'functions/sitemap-hotels.xml.ts'],
    ];
    for (const [table, file] of pairs) {
      const at = hubLinksSrc.indexOf(`table: '${table}'`);
      const block = hubLinksSrc.slice(at, at + 700);
      const hubFilter = /filter:\s*\n?\s*'([^']+)'/.exec(block)![1];
      const sitemapFilters = filterLiterals(read(file));
      expect(
        sitemapFilters,
        `${table}: hub filter "${hubFilter}" matches no filter in ${file}`,
      ).toContain(hubFilter);
    }
  });
});

describe('hub crawl links — rendering', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../functions/_lib/sitemap');
  });

  async function load(rowsByTable: Record<string, Record<string, unknown>[]>) {
    const calls: { table: string; filter: string; order: string; limit: number }[] = [];
    vi.doMock('../../../functions/_lib/sitemap', () => ({
      fetchRows: async (
        _env: unknown,
        table: string,
        _select: string,
        filter: string,
        limit: number,
        order: string,
      ) => {
        calls.push({ table, filter, order, limit });
        return rowsByTable[table] ?? [];
      },
    }));
    const mod = await import('../../../functions/_lib/hubLinks');
    return { mod, calls };
  }

  it('renders detail links for a hub path', async () => {
    const { mod } = await load({
      venues: [
        { slug: 'bar-1-5', name: 'Bar 1' },
        { slug: 'sauna-x', name: 'Sauna X' },
      ],
    });
    const html = await mod.buildHubLinksHtml({} as never, '/venues');
    expect(html).toContain('href="/venues/bar-1-5"');
    expect(html).toContain('href="/venues/sauna-x"');
    expect(html).toContain('Bar 1');
    expect(html).toContain('data-prerendered="hub-links"');
  });

  it('returns nothing for a non-hub path', async () => {
    const { mod, calls } = await load({});
    expect(await mod.buildHubLinksHtml({} as never, '/about')).toBe('');
    // and issues no query at all
    expect(calls).toHaveLength(0);
  });

  it('emits no empty heading when the table returns nothing', async () => {
    const { mod } = await load({ venues: [] });
    expect(await mod.buildHubLinksHtml({} as never, '/venues')).toBe('');
  });

  it('escapes labels and skips rows missing a slug or name', async () => {
    const { mod } = await load({
      venues: [{ slug: 'a', name: 'Rosie & "Jim"' }, { slug: 'b' }, { name: 'no slug' }],
    });
    const html = await mod.buildHubLinksHtml({} as never, '/venues');
    expect(html).toContain('Rosie &amp; &quot;Jim&quot;');
    expect(html).not.toContain('Rosie & "Jim"');
    expect((html.match(/<li>/g) ?? []).length).toBe(1);
  });

  it('interpolates today into the events filter rather than leaving the token', async () => {
    const { mod, calls } = await load({ events: [{ slug: 'e', title: 'E' }] });
    await mod.buildHubLinksHtml({} as never, '/events');
    const eventsCall = calls.find((c) => c.table === 'events')!;
    expect(eventsCall.filter).not.toContain('__TODAY__');
    expect(eventsCall.filter).toMatch(/start_date=gte\.\d{4}-\d{2}-\d{2}/);
  });

  it('a failing query degrades to no block, never to a thrown page', async () => {
    vi.doMock('../../../functions/_lib/sitemap', () => ({
      fetchRows: async () => {
        throw new Error('supabase down');
      },
    }));
    const mod = await import('../../../functions/_lib/hubLinks');
    await expect(mod.buildHubLinksHtml({} as never, '/venues')).resolves.toBe('');
  });

  it('/places links both cities and countries', async () => {
    const { mod } = await load({
      cities: [{ slug: 'berlin', name: 'Berlin' }],
      countries: [{ slug: 'germany', name: 'Germany' }],
    });
    const html = await mod.buildHubLinksHtml({} as never, '/places');
    expect(html).toContain('href="/city/berlin"');
    expect(html).toContain('href="/country/germany"');
  });
});
