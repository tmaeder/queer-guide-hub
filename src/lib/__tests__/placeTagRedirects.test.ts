import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLACE_TAG_REDIRECTS, placeTagRedirect } from '@/lib/placeTagRedirects';
import { placeTagEdgeLocation } from '../../../functions/_lib/placeTagRedirect';

/**
 * Place-name tag redirects span three surfaces: `public/_redirects` for the first 100 edge rules,
 * Pages middleware for every cold request beyond that platform boundary, and
 * `PLACE_TAG_REDIRECTS` for locale-prefixed and in-app navigation. A pair missing from one surface
 * leaves a duplicate place page there — which is the defect this change exists to remove.
 *
 * Mirrors src/lib/__tests__/mergedVillageRedirects.test.ts, which guards the same split for the
 * 14 hard-merged villages.
 */

const redirects = readFileSync(join(process.cwd(), 'public', '_redirects'), 'utf8');
const middleware = readFileSync(join(process.cwd(), 'functions', '_middleware.ts'), 'utf8');

/**
 * Only single-segment `/tags/<slug>` rules. `_redirects` also carries `/tags/topic/*` and the
 * `/tags/c/<category>` renames, which are tag->tag rules and none of this file's business;
 * matching them would make the "no rule the map does not know about" test fail on correct code.
 */
const rules = redirects
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/))
  .filter((r) => /^\/tags\/[a-z0-9-]+$/.test(r[0]));

describe('place tag redirects', () => {
  it('has one 301 in public/_redirects per mapped tag', () => {
    for (const [tagSlug, target] of Object.entries(PLACE_TAG_REDIRECTS)) {
      const rule = rules.find((r) => r[0] === `/tags/${tagSlug}`);
      expect(rule, `no _redirects rule for /tags/${tagSlug}`).toBeDefined();
      expect(rule?.[1], `/tags/${tagSlug} points somewhere else at the edge`).toBe(target);
      expect(rule?.[2]).toBe('301');
    }
  });

  it('has no single-segment /tags/ rule the map does not know about', () => {
    for (const rule of rules) {
      const tagSlug = rule[0].replace('/tags/', '');
      expect(
        placeTagRedirect(tagSlug),
        `_redirects sends /tags/${tagSlug} somewhere the map does not`,
      ).not.toBeNull();
    }
  });

  it('uses the shared map from Pages middleware when _redirects reaches its rule limit', () => {
    expect(middleware).toContain("from './_lib/placeTagRedirect'");
    expect(middleware).toMatch(
      /placeTagEdgeLocation\(basePath, locale, DEFAULT_LOCALE, url\.search\)/,
    );
  });

  it('edge-redirects late rules and preserves locale plus query string', () => {
    expect(placeTagEdgeLocation('/tags/philadelphia', 'en', 'en')).toBe('/city/philadelphia');
    expect(placeTagEdgeLocation('/tags/san-francisco', 'de', 'en', '?ref=legacy')).toBe(
      '/de/city/san-francisco?ref=legacy',
    );
  });

  it('does not edge-redirect real glossary terms or category routes', () => {
    expect(placeTagEdgeLocation('/tags/california', 'en', 'en')).toBeNull();
    expect(placeTagEdgeLocation('/tags/c/places-scene', 'en', 'en')).toBeNull();
  });

  it('sends every target to a real place route, never back into /tags', () => {
    for (const [tagSlug, target] of Object.entries(PLACE_TAG_REDIRECTS)) {
      expect(target, `${tagSlug} does not target a place route`).toMatch(
        /^\/(city|country|villages)\/[a-z0-9-]+$/,
      );
      // A tag->tag redirect is what tag_slug_redirects is for; if one appears here it means a
      // merge was mistaken for a place duplicate.
      expect(target.startsWith('/tags/')).toBe(false);
    }
  });

  it('covers the reported pages, each pointing at the right KIND of entity', () => {
    // A district is a village, a city is a city, a country is a country. Getting the kind wrong
    // is the failure mode that survives a "does it redirect" check.
    expect(placeTagRedirect('kreuzberg')).toBe('/villages/kreuzberg');
    expect(placeTagRedirect('prenzlauer')).toBe('/villages/prenzlauer-berg');
    expect(placeTagRedirect('berlin')).toBe('/city/berlin');
    expect(placeTagRedirect('australia')).toBe('/country/australia');
  });

  it('resolves the same-name cities by content mass, not by slug', () => {
    // /city/zurich is Zurich, US (content mass 9). Zürich CH (mass 3,754) is /city/zuerich.
    // Resolving this tag by slug equality picks the wrong city — the documented trap in
    // docs/audits/2026-09-04-tag-glossary-triage.md §2.3.
    expect(placeTagRedirect('zurich')).toBe('/city/zuerich');
    expect(placeTagRedirect('san-juan')).toBe('/city/san-juan-1');
  });

  it('does not redirect the tags that were deliberately left alone', () => {
    // Bucket E: regions with no geo entity to duplicate. The audit reasoned these are NOT
    // duplicates — "a region tag grouping content across LA/SF/San Diego is the one thing a
    // Destination tag does that no geo page does".
    for (const slug of ['california', 'manhattan', 'usa', 'pennsylvania', 'wales', 'queensland']) {
      expect(placeTagRedirect(slug), `bucket E tag ${slug} must not redirect`).toBeNull();
    }
    // Bucket F: genuine travel concepts, and the rows the description backfill is aimed at.
    for (const slug of ['travel', 'europe', 'coastal', 'rural', 'island', 'tour']) {
      expect(placeTagRedirect(slug), `bucket F tag ${slug} must not redirect`).toBeNull();
    }
    // Same-name tags the content-mass rule could not decide. Deindexed, but no redirect target.
    for (const slug of ['durango', 'georgetown', 'san-jose', 'santa-cruz', 'toledo']) {
      expect(placeTagRedirect(slug), `blocked tag ${slug} must not redirect`).toBeNull();
    }
    // cuauhtemoc is the Aztec ruler, routed to the wrong-sense flow, not a place duplicate.
    expect(placeTagRedirect('cuauhtemoc')).toBeNull();
  });

  it('returns null for an ordinary glossary tag', () => {
    expect(placeTagRedirect('darkroom')).toBeNull();
    expect(placeTagRedirect(undefined)).toBeNull();
    expect(placeTagRedirect('')).toBeNull();
  });

  it('is case-insensitive, matching the slug canonicalisation in TagDetail', () => {
    expect(placeTagRedirect('Kreuzberg')).toBe('/villages/kreuzberg');
  });
});
