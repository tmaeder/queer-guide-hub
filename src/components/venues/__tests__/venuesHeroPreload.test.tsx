import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import type { VenueHeroCandidate } from '../venuesHeroPool';
import {
  featuredVenuesUrl,
  rendersVenuesHero,
  resetVenuesHeroPoolForTests,
  venuesHeroHead,
  venuesHeroHeadFor,
} from '../../../../functions/_lib/venuesHeroPreload';

/**
 * The edge preloads the /venues hero and tells the page which venue it chose
 * (functions/_lib/venuesHeroPreload.ts). That only helps if VenuesHero then
 * opens on that venue AND requests the same srcset/sizes the preload named.
 * These tests render the real component and compare against it, so a change
 * to either side alone fails here instead of downloading every hero twice.
 */

const featured = vi.hoisted(() => ({ venues: [] as unknown[] }));
vi.mock('@/hooks/useVenuesV2Data', () => ({
  useFeaturedVenues: () => ({ venues: featured.venues, loading: false }),
}));

import { VenuesHero } from '../VenuesHero';

const IMG_A = 'https://img.queer.guide/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jpg';
const IMG_B = 'https://img.queer.guide/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.jpg';
const IMG_C = 'https://img.queer.guide/cccccccc-3333-4333-8333-cccccccccccc.jpg';

function venue(id: string, image: string | null, extra: Partial<VenueHeroCandidate> = {}) {
  return {
    id,
    slug: id,
    name: `Venue ${id}`,
    name_i18n: null,
    description: 'A bar.',
    description_i18n: null,
    category: 'bar',
    city: 'Berlin',
    country: 'DE',
    images: image ? [image] : null,
    safety_gated: false,
    closure_status: null,
    closed_at: null,
    ...extra,
  };
}

function parse(tag: string) {
  const doc = new DOMParser().parseFromString(`<head>${tag}</head>`, 'text/html');
  const el = doc.head.firstElementChild;
  if (!el) throw new Error(`nothing parsed from ${tag}`);
  return el;
}

function setEdgeMeta(id: string | null) {
  document.head.querySelectorAll('meta[name="qg-venues-hero"]').forEach((m) => m.remove());
  if (!id) return;
  const meta = document.createElement('meta');
  meta.name = 'qg-venues-hero';
  meta.content = id;
  document.head.appendChild(meta);
}

afterEach(() => {
  setEdgeMeta(null);
  featured.venues = [];
});

describe('VenuesHero honours the edge pick', () => {
  const pool = [venue('a', IMG_A), venue('b', IMG_B), venue('c', IMG_C)];

  it.each(['a', 'b', 'c'])('opens on the venue the edge preloaded (%s)', (id) => {
    featured.venues = pool;
    const head = venuesHeroHeadFor(pool, () => ['a', 'b', 'c'].indexOf(id) / 3);
    expect(head).not.toBeNull();
    const chosen = parse(head!.meta).getAttribute('content');
    expect(chosen).toBe(id);
    setEdgeMeta(chosen);

    const { container } = renderWithProviders(<VenuesHero />);
    const link = container.querySelector('a[href*="/venues/"]');
    expect(link?.getAttribute('href')).toMatch(new RegExp(`/venues/${id}$`));

    const img = container.querySelector('img');
    if (!img) throw new Error('VenuesHero rendered no <img>');
    const preload = parse(head!.preload);
    // Positive control: the component really emits a srcset to compare against.
    expect(img.getAttribute('srcset')).toBeTruthy();
    expect(preload.getAttribute('imagesrcset')).toBe(img.getAttribute('srcset'));
    expect(preload.getAttribute('imagesizes')).toBe(img.getAttribute('sizes'));
    expect(preload.getAttribute('fetchpriority')).toBe('high');
  });

  it('falls back to its own slide when the edge pick is not in its pool', () => {
    featured.venues = pool;
    setEdgeMeta('not-in-pool');
    const { container } = renderWithProviders(<VenuesHero />);
    expect(container.querySelector('a[href*="/venues/"]')?.getAttribute('href')).toMatch(
      /\/venues\/[abc]$/,
    );
  });
});

describe('venuesHeroHeadFor', () => {
  it('only picks venues whose photo can be resized', () => {
    const pool = [venue('ext', 'https://maps.gstatic.com/x.jpg'), venue('ok', IMG_A)];
    for (const r of [0, 0.5, 0.99]) {
      expect(parse(venuesHeroHeadFor(pool, () => r)!.meta).getAttribute('content')).toBe('ok');
    }
  });

  it('emits nothing when no venue can be preloaded', () => {
    expect(venuesHeroHeadFor([])).toBeNull();
    expect(venuesHeroHeadFor([venue('ext', 'https://maps.gstatic.com/x.jpg')])).toBeNull();
  });

  it('escapes the venue id in the meta tag', () => {
    const head = venuesHeroHeadFor([venue('a"><script>', IMG_A)]);
    expect(head!.meta).not.toContain('<script>');
    expect(parse(head!.meta).getAttribute('content')).toBe('a"><script>');
  });
});

describe('rendersVenuesHero', () => {
  it('preloads only the plain /venues hub', () => {
    expect(rendersVenuesHero('/venues', new URLSearchParams())).toBe(true);
    expect(rendersVenuesHero('/venues', new URLSearchParams('utm_source=x'))).toBe(true);
    expect(rendersVenuesHero('/venues', new URLSearchParams('category=bar'))).toBe(false);
    expect(rendersVenuesHero('/venues', new URLSearchParams('view=map'))).toBe(false);
    expect(rendersVenuesHero('/venues/le-mistral', new URLSearchParams())).toBe(false);
    expect(rendersVenuesHero('/events', new URLSearchParams())).toBe(false);
  });
});

describe('venuesHeroHead', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co/', SUPABASE_ANON_KEY: 'anon' };
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetVenuesHeroPoolForTests();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the same featured query useFeaturedVenues runs, with the anon key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([venue('a', IMG_A)])));
    const head = await venuesHeroHead(env);
    expect(head).not.toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(featuredVenuesUrl('https://example.supabase.co'));
    const q = new URL(url as string).searchParams;
    expect(q.get('is_featured')).toBe('eq.true');
    expect(q.get('data_source')).toBe('neq.refuge-restrooms');
    expect(q.get('review_status')).toBe('neq.archived');
    expect(q.get('duplicate_of_id')).toBe('is.null');
    expect(q.get('order')).toBe('updated_at.desc');
    expect(q.get('limit')).toBe('12');
    expect((init as RequestInit).headers).toMatchObject({ apikey: 'anon' });
  });

  it('drops gated and closed venues, as VenuesHero does', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          venue('gated', IMG_A, { safety_gated: true }),
          venue('closed', IMG_B, { closure_status: 'permanently_closed' }),
          venue('open', IMG_C),
        ]),
      ),
    );
    const head = await venuesHeroHead(env);
    expect(parse(head!.meta).getAttribute('content')).toBe('open');
  });

  it('memoizes the pool and fails open', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([venue('a', IMG_A)])));
    await venuesHeroHead(env);
    await venuesHeroHead(env);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetVenuesHeroPoolForTests();
    fetchMock.mockRejectedValueOnce(new Error('down'));
    expect(await venuesHeroHead(env)).toBeNull();
    expect(await venuesHeroHead({ SUPABASE_URL: env.SUPABASE_URL })).toBeNull();
  });
});
