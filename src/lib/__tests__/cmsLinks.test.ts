/**
 * Guards the one module that knows how to cross between a public page and its
 * CMS record.
 *
 * The property under test is NOT "these 16 types have these 16 paths" — that
 * list goes stale the day a type is added. It is that every registry key
 * produces a usable CMS path, and that a type with no public page says so with
 * `null` instead of fabricating a URL. A fabricated URL is a 404 the caller
 * cannot tell from a real page, which is the failure `searchRoutes.detailHref`
 * already exists to avoid.
 */

import { describe, it, expect } from 'vitest';
import {
  cmsEditPath,
  cmsListPath,
  livePath,
  hasPublicPage,
  typesWithPublicPath,
} from '../cmsLinks';
import { contentTypeRegistry, getContentTypeIds } from '@/config/contentTypes';

/**
 * Types that deliberately have no public page. A vocabulary term has no page
 * of its own (see vocabulary.ts), a redirect IS a route rather than having
 * one, and feedback is internal.
 */
const PAGELESS = [
  'venue_services',
  'event_types',
  'event_amenities',
  'event_services',
  'accessibility_attributes',
  'target_groups',
  'professions',
  'redirects',
  'feedback',
];

describe('cmsEditPath', () => {
  it('builds a deep link for every registry type', () => {
    const ids = getContentTypeIds();
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) {
      const path = cmsEditPath(id, 'abc-123');
      expect(path, `no CMS path for ${id}`).toBe(`/admin/content/${id}?edit=abc-123`);
    }
  });

  it('returns null for an unknown type rather than a path to the All-content list', () => {
    // An unknown `/admin/content/<key>` renders the "All content" list instead
    // of 404ing, so a stale type string would silently link somewhere wrong.
    expect(cmsEditPath('venuez', 'abc-123')).toBeNull();
    expect(cmsListPath('venuez')).toBeNull();
  });

  it('returns null without an id', () => {
    expect(cmsEditPath('venues', '')).toBeNull();
  });

  it('encodes the id', () => {
    expect(cmsEditPath('venues', 'a b/c')).toBe('/admin/content/venues?edit=a%20b%2Fc');
  });
});

describe('livePath', () => {
  it('returns null — never a guess — for every type with no public page', () => {
    for (const id of PAGELESS) {
      expect(contentTypeRegistry[id], `${id} is not a registry key`).toBeDefined();
      expect(hasPublicPage(id), `${id} should declare no publicPath`).toBe(false);
      expect(livePath(id, { id: 'x', slug: 'y', name: 'z' }), `${id} fabricated a URL`).toBeNull();
    }
  });

  it('covers every other registry type', () => {
    const missing = getContentTypeIds().filter(
      (id) => !PAGELESS.includes(id) && !hasPublicPage(id),
    );
    expect(
      missing,
      `these types have neither a publicPath nor a PAGELESS entry: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('returns null for a row that is not publishable yet', () => {
    expect(livePath('venues', { id: 'v1' })).toBeNull();
    expect(livePath('venues', null)).toBeNull();
    // status gates: an unapproved brand and a non-active tag have no page.
    expect(livePath('marketplace_brands', { slug: 'acme', status: 'pending' })).toBeNull();
    expect(livePath('unified_tags', { slug: 'bear-bar', status: 'deprecated' })).toBeNull();
  });

  it('builds the real public path for the keyed shapes', () => {
    expect(livePath('venues', { slug: 'some-bar' })).toBe('/venues/some-bar');
    expect(livePath('cities', { slug: 'berlin' })).toBe('/city/berlin');
    expect(livePath('organizations', { slug: 'acme-org' })).toBe('/organizations/acme-org');
    // Tags are slug-keyed despite the route param being named `tagName`, and
    // the lookup lowercases; groups are id-keyed, not slug-keyed.
    expect(livePath('unified_tags', { slug: 'Bear-Bar', status: 'active' })).toBe('/tags/bear-bar');
    expect(livePath('community_groups', { id: 'g-1', slug: 'ignored' })).toBe('/groups/g-1');
  });

  it('typesWithPublicPath and PAGELESS partition the registry', () => {
    const all = getContentTypeIds().sort();
    const partitioned = [...typesWithPublicPath(), ...PAGELESS].sort();
    expect(partitioned).toEqual(all);
  });
});
