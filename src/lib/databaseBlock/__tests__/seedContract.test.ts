import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { SEED_ELEMENT_ID, SEED_VERSION, seedFor, __resetSeedCache } from '../seed';

/**
 * Contract between the edge pre-hydrator (functions/_lib/dbBlockSeed.ts) and
 * the client seed reader.
 *
 * The two live in different bundles and are typechecked by different configs,
 * so nothing structurally forces them to agree about the payload shape. This
 * test is that force.
 *
 * The specific trap: the payload carries RAW v_entity_cards rows and the CLIENT
 * normalizes them. An edge that emitted already-normalized EntityCard objects
 * would feed camelCase objects into a normalizer reading snake_case columns,
 * and every card would be silently dropped — a seeded page would render empty
 * and then quietly repopulate on refetch.
 */

/** Exactly what public.v_entity_cards returns. */
function rawRow(over: Record<string, unknown> = {}) {
  return {
    doc_id: 'venue:11111111-1111-4111-8111-111111111111',
    entity_type: 'venue',
    entity_id: '11111111-1111-4111-8111-111111111111',
    slug: 'berghain',
    title: 'Berghain',
    description: 'Club',
    image_url: null,
    city: 'Berlin',
    country: 'Germany',
    start_date: null,
    end_date: null,
    is_free: false,
    price_min: null,
    price_max: null,
    is_featured: false,
    quality_score: 80,
    liveness_status: 'live',
    facets: { category: 'club' },
    is_gated: false,
    updated_at: '2026-07-01T10:00:00Z',
    ...over,
  };
}

function inject(payload: unknown) {
  const el = document.createElement('script');
  el.type = 'application/json';
  el.id = SEED_ELEMENT_ID;
  el.textContent = JSON.stringify(payload);
  document.head.appendChild(el);
  __resetSeedCache();
}

beforeEach(() => __resetSeedCache());
afterEach(() => {
  document.getElementById(SEED_ELEMENT_ID)?.remove();
  __resetSeedCache();
});

describe('edge seed payload contract', () => {
  it('accepts the shape the edge emits: raw rows keyed by blockId', () => {
    inject({ v: SEED_VERSION, slug: 'blog', blocks: { b1: [rawRow()] } });

    const cards = seedFor('b1', 'blog');
    expect(cards).toHaveLength(1);
    expect(cards?.[0]).toMatchObject({
      entityType: 'venue',
      title: 'Berghain',
      href: '/venues/berghain',
      city: 'Berlin',
    });
  });

  it('yields nothing if the edge ever emits pre-normalized cards', () => {
    // Guards the exact regression: camelCase objects through a snake_case
    // normalizer drop silently rather than failing loudly.
    const preNormalized = {
      docId: 'venue:11111111-1111-4111-8111-111111111111',
      entityType: 'venue',
      entityId: '11111111-1111-4111-8111-111111111111',
      title: 'Berghain',
    };
    inject({ v: SEED_VERSION, slug: 'blog', blocks: { b1: [preNormalized] } });

    expect(seedFor('b1', 'blog')).toEqual([]);
  });

  it('refuses a payload built for a different page', () => {
    // The script survives a bfcache restore; serving one page's entities on
    // another would be wrong, and misleading near gated content.
    inject({ v: SEED_VERSION, slug: 'blog', blocks: { b1: [rawRow()] } });
    expect(seedFor('b1', 'terms')).toBeUndefined();
  });

  it('refuses a payload from a future schema version', () => {
    inject({ v: SEED_VERSION + 1, slug: 'blog', blocks: { b1: [rawRow()] } });
    expect(seedFor('b1', 'blog')).toBeUndefined();
  });

  it('returns undefined for a block the payload does not cover', () => {
    // The edge caps blocks per page; uncovered blocks must fetch normally.
    inject({ v: SEED_VERSION, slug: 'blog', blocks: { b1: [rawRow()] } });
    expect(seedFor('b7', 'blog')).toBeUndefined();
  });

  it('survives a malformed payload rather than breaking the page', () => {
    const el = document.createElement('script');
    el.id = SEED_ELEMENT_ID;
    el.textContent = '{not json';
    document.head.appendChild(el);
    __resetSeedCache();

    expect(() => seedFor('b1', 'blog')).not.toThrow();
    expect(seedFor('b1', 'blog')).toBeUndefined();
  });

  it('returns undefined when no payload was injected at all', () => {
    expect(seedFor('b1', 'blog')).toBeUndefined();
  });

  it('drops a gated row defensively even if one ever reached the payload', () => {
    // The view already excludes these for anon; belt and braces.
    inject({
      v: SEED_VERSION,
      slug: 'blog',
      blocks: { b1: [rawRow(), rawRow({ entity_id: 'x', title: '' })] },
    });
    expect(seedFor('b1', 'blog')).toHaveLength(1);
  });
});
