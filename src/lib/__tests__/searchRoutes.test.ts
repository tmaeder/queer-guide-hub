import { describe, it, expect } from 'vitest';
import { detailHref, hrefForEntity } from '../searchRoutes';

const UUID = '11111111-2222-4333-8444-555555555555';

// These sections ("More like this" / trending / recommended / search /
// autocomplete) must only link to EXISTING content. `detailHref` is the single
// gate: it returns a canonical detail route or null. A null means the caller
// drops the item (rails) or falls back to a search (search surfaces) — never a
// fabricated /type/<uuid> link that 404s.
describe('searchRoutes.detailHref', () => {
  it('builds a canonical detail route from a real slug', () => {
    expect(detailHref({ type: 'venue', slug: 'berlin-schwuz' })).toBe('/venues/berlin-schwuz');
    expect(detailHref({ type: 'venues', slug: 'berlin-schwuz' })).toBe('/venues/berlin-schwuz'); // alias
    expect(detailHref({ type: 'event', slug: 'csd-2026' })).toBe('/events/csd-2026');
    expect(detailHref({ type: 'city', slug: 'paris' })).toBe('/city/paris');
    expect(detailHref({ type: 'queer_village', slug: 'castro' })).toBe('/villages/castro');
    expect(detailHref({ type: 'hotel', slug: 'axel-berlin' })).toBe('/hotels/axel-berlin');
  });

  it('returns null when a slug-keyed hit has only a UUID (never links by id)', () => {
    expect(detailHref({ type: 'venue', slug: UUID, id: UUID })).toBeNull();
    expect(detailHref({ type: 'venue', slug: null, id: UUID })).toBeNull();
    expect(detailHref({ type: 'queer_village', id: UUID })).toBeNull();
    expect(detailHref({ type: 'personality', slug: '', id: UUID })).toBeNull();
  });

  it('links id-keyed types (group/user) by id', () => {
    expect(detailHref({ type: 'group', id: 'g-123' })).toBe('/groups/g-123');
    expect(detailHref({ type: 'group', slug: 'g-123' })).toBe('/groups/g-123'); // id carried in slug
    // `user` is a legacy taxonomy alias of `personality`; it must still reach /user/:id.
    expect(detailHref({ type: 'user', id: 'u-9' })).toBe('/user/u-9');
    expect(detailHref({ type: 'group', id: '' })).toBeNull();
  });

  it('routes tags to the name-keyed glossary', () => {
    expect(detailHref({ type: 'tag', title: 'Trans Rights' })).toBe('/tags/trans%20rights');
    expect(detailHref({ type: 'tag', slug: 'nightlife' })).toBe('/tags/nightlife');
    expect(detailHref({ type: 'tag' })).toBeNull();
  });

  it('resolves the city-is-country override', () => {
    expect(detailHref({ type: 'city', slug: 'france', isCountry: true })).toBe('/country/france');
  });

  it('returns null for unknown / routeless types', () => {
    expect(detailHref({ type: 'mystery', slug: 'x' })).toBeNull();
    expect(detailHref({ type: 'festival', slug: 'x' })).toBeNull();
  });
});

describe('searchRoutes.hrefForEntity', () => {
  it('wraps detailHref and returns the canonical route when available', () => {
    expect(hrefForEntity({ type: 'venue', slug: 'berlin-schwuz' })).toBe('/venues/berlin-schwuz');
  });

  it('falls back to a fresh search (existing content) instead of a /type/<uuid> link', () => {
    expect(hrefForEntity({ type: 'venue', slug: UUID, id: UUID, title: 'SchwuZ' })).toBe(
      '/search?q=SchwuZ',
    );
    expect(hrefForEntity({ type: 'venue', title: 'SchwuZ' })).toBe('/search?q=SchwuZ');
    expect(hrefForEntity({ type: 'hotel', slug: 'axel-berlin' })).toBe('/hotels/axel-berlin');
  });
});
