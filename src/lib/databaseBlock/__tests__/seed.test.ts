/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEED_ELEMENT_ID, __resetSeedCache, seedFor } from '../seed';

const A = '11111111-1111-4111-8111-111111111111';

function inject(payload: unknown) {
  const el = document.createElement('script');
  el.id = SEED_ELEMENT_ID;
  el.type = 'application/json';
  el.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload);
  document.head.appendChild(el);
}

const rowFor = (id: string) => ({
  entity_type: 'venue',
  entity_id: id,
  slug: 'berghain',
  title: 'Berghain',
  facets: {},
});

beforeEach(() => __resetSeedCache());
afterEach(() => {
  document.getElementById(SEED_ELEMENT_ID)?.remove();
  __resetSeedCache();
});

describe('seedFor', () => {
  it('returns normalized cards for a matching slug and block', () => {
    inject({ v: 1, slug: 'blog', blocks: { b1: [rowFor(A)] } });
    const cards = seedFor('b1', 'blog');
    expect(cards).toHaveLength(1);
    expect(cards?.[0]).toMatchObject({ title: 'Berghain', href: '/venues/berghain' });
  });

  it('ignores a payload built for a different page', () => {
    // The injected script survives a back/forward-cache restore; serving one
    // page's entities on another would be wrong.
    inject({ v: 1, slug: 'blog', blocks: { b1: [rowFor(A)] } });
    expect(seedFor('b1', 'about')).toBeUndefined();
  });

  it('returns undefined for a block with no seeded rows', () => {
    inject({ v: 1, slug: 'blog', blocks: { b1: [rowFor(A)] } });
    expect(seedFor('other', 'blog')).toBeUndefined();
  });

  it('returns undefined when no payload is present', () => {
    expect(seedFor('b1', 'blog')).toBeUndefined();
  });

  it('ignores a payload from a future schema version', () => {
    inject({ v: 99, slug: 'blog', blocks: { b1: [rowFor(A)] } });
    expect(seedFor('b1', 'blog')).toBeUndefined();
  });

  it('survives malformed JSON rather than breaking the page', () => {
    inject('{ this is not json');
    expect(() => seedFor('b1', 'blog')).not.toThrow();
    expect(seedFor('b1', 'blog')).toBeUndefined();
  });

  it('survives a structurally wrong payload', () => {
    inject({ v: 1, slug: 'blog', blocks: 'not-an-object' });
    expect(seedFor('b1', 'blog')).toBeUndefined();
  });

  it('drops unusable rows instead of rendering blanks', () => {
    inject({
      v: 1,
      slug: 'blog',
      blocks: { b1: [rowFor(A), { entity_type: 'venue' }, { entity_type: 'nope', entity_id: A, title: 'x' }] },
    });
    expect(seedFor('b1', 'blog')).toHaveLength(1);
  });
});
