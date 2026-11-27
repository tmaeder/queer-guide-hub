/**
 * For these @types the edge JSON-LD block is canonical: the SPA skips its own
 * copy when one is present (EDGE_CANONICAL_TYPES in src/hooks/useMeta.ts). So
 * each edge block must carry every field the SPA block it replaces had.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveDetailRoute } from './detail';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' } as never;
type Row = Record<string, unknown>;

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

async function edgeBlock(path: string, type: string, tables: Record<string, Row[]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.includes('/rpc/')) return new Response('null', { status: 200 });
      const table = u.pathname.split('/').pop() ?? '';
      return new Response(JSON.stringify(tables[table] ?? []), { status: 200 });
    }),
  );
  const detail = await resolveDetailRoute(ENV, path);
  const blocks = jsonLdBodies(detail?.jsonLd ?? '')
    .map((b) => JSON.parse(b) as Row)
    .filter((b) => b['@type'] === type);
  expect(blocks).toHaveLength(1);
  return blocks[0];
}

describe('edge JSON-LD carries what the SPA block had', () => {
  it('Event (events): sameAs from social_links', async () => {
    const ld = await edgeBlock('/events/drag-night', 'Event', {
      events: [
        {
          id: 'e1',
          title: 'Drag Night',
          slug: 'drag-night',
          description: 'A night of drag.',
          start_date: '2026-12-01T20:00:00Z',
          end_date: '2026-12-02T02:00:00Z',
          city: 'Berlin',
          venue_name: 'SO36',
          images: ['https://img.example/e.jpg'],
          social_links: { instagram: 'https://www.instagram.com/dragnight' },
          safety_gated: false,
        },
      ],
    });
    expect(ld).toMatchObject({
      name: 'Drag Night',
      startDate: '2026-12-01T20:00:00Z',
      endDate: '2026-12-02T02:00:00Z',
      eventStatus: 'https://schema.org/EventScheduled',
      description: 'A night of drag.',
      image: 'https://img.example/e.jpg',
      location: { '@type': 'Place', name: 'SO36' },
    });
    expect(ld.sameAs).toEqual([expect.stringContaining('instagram.com/dragnight')]);
  });

  it('Event (milestones): reduced-precision endDate and a structured address', async () => {
    const ld = await edgeBlock('/history/stonewall', 'Event', {
      milestones: [
        {
          title: 'Stonewall',
          slug: 'stonewall',
          description: 'The riots.',
          date: '1969-06-28',
          date_precision: 'day',
          date_end: '1969-07-03',
          date_end_precision: 'month',
          city_name: 'New York',
          country_name: 'United States',
          sources: [{ url: 'https://example.org/src', label: 'Source' }],
          safety_gated: false,
        },
      ],
    });
    expect(ld).toMatchObject({
      name: 'Stonewall',
      startDate: '1969-06-28',
      endDate: '1969-07',
      description: 'The riots.',
      location: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'New York',
          addressCountry: 'United States',
        },
      },
      sameAs: ['https://example.org/src'],
    });
  });

  it('NewsArticle: author cleaned the way the SPA cleans it', async () => {
    const ld = await edgeBlock('/news/a', 'NewsArticle', {
      news_articles: [
        {
          title: 'Headline',
          slug: 'a',
          author: '["Jane Doe"]',
          image_url: 'https://img.example/n.jpg',
          published_at: '2026-11-01T00:00:00Z',
        },
      ],
    });
    expect(ld).toMatchObject({
      headline: 'Headline',
      image: ['https://img.example/n.jpg'],
      datePublished: '2026-11-01T00:00:00Z',
      author: { '@type': 'Person', name: 'Jane Doe' },
      publisher: { '@type': 'Organization', name: 'Queer Guide', logo: { '@type': 'ImageObject' } },
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://queer.guide/news/a' },
    });
  });

  it('NewsArticle: an unusable author is dropped, not emitted as an empty Person', async () => {
    const ld = await edgeBlock('/news/a', 'NewsArticle', {
      news_articles: [{ title: 'Headline', slug: 'a', author: 'null' }],
    });
    expect(ld.author).toBeUndefined();
  });

  it('Article (guides)', async () => {
    const ld = await edgeBlock('/guides/berlin', 'Article', {
      guides: [
        {
          title: 'Berlin',
          slug: 'berlin',
          dek: 'A guide.',
          published_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
          safety_gated: false,
        },
      ],
    });
    expect(ld).toMatchObject({
      headline: 'Berlin',
      description: 'A guide.',
      datePublished: '2026-01-01T00:00:00Z',
      dateModified: '2026-02-01T00:00:00Z',
      author: { '@type': 'Organization', name: 'Queer Guide' },
    });
  });

  it('PodcastSeries', async () => {
    const ld = await edgeBlock('/podcasts/show', 'PodcastSeries', {
      news_sources: [
        {
          id: 's1',
          name: 'Show',
          slug: 'show',
          description: 'A show.',
          url: 'https://feeds.example/show.xml',
          website_url: 'https://show.example',
          artwork_url: 'https://img.example/s.jpg',
          episode_count: 3,
        },
      ],
    });
    expect(ld).toMatchObject({
      name: 'Show',
      description: 'A show.',
      url: 'https://queer.guide/podcasts/show',
      image: 'https://img.example/s.jpg',
      webFeed: 'https://feeds.example/show.xml',
      sameAs: 'https://show.example',
    });
  });

  it('DefinedTerm: inDefinedTermSet and citation', async () => {
    const ld = await edgeBlock('/tags/prep', 'DefinedTerm', {
      unified_tags: [
        {
          id: 't1',
          name: 'PrEP',
          slug: 'prep',
          description: 'HIV prevention.',
          wikipedia_url: 'https://en.wikipedia.org/wiki/PrEP',
          is_sensitive: false,
        },
      ],
      tag_sources: [
        {
          source_type: 'clinical_guideline',
          official_title: 'WHO PrEP guidance',
          source_url: 'https://who.example/prep',
        },
      ],
    });
    expect(ld).toMatchObject({
      name: 'PrEP',
      description: 'HIV prevention.',
      url: 'https://queer.guide/tags/prep',
      inDefinedTermSet: {
        '@type': 'DefinedTermSet',
        name: 'Queer Guide Glossary',
        url: 'https://queer.guide/tags',
      },
      sameAs: ['https://en.wikipedia.org/wiki/PrEP', 'https://who.example/prep'],
      citation: [{ '@type': 'CreativeWork', name: 'WHO PrEP guidance' }],
    });
  });
});
