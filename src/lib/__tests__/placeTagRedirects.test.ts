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

  it('declares each tag slug exactly once in _redirects', () => {
    // `_redirects` is first-match-wins, so a duplicated rule is inert rather than broken — which
    // is precisely why nothing catches it. This block is generated, and regenerating over a file
    // that already contained it once produced 313 rules for 157 slugs. The suite above passed
    // throughout, because `.find()` returns the first match and never looks further.
    const seen = new Map<string, number>();
    for (const [src] of rules) seen.set(src, (seen.get(src) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([s, n]) => `${s} x${n}`);
    expect(dupes, `duplicate _redirects rules: ${dupes.join(', ')}`).toEqual([]);
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
      // `/venues/` joined the set for friedrichstadt-palast: a Berlin revue theatre that already
      // had a venue page. The route is PLURAL — src/routes.tsx has `venues/:slug`, and there is
      // no `/venue/:slug`, so the singular form would 301 straight into the SPA 404.
      expect(target, `${tagSlug} does not target a place route`).toMatch(
        /^\/(city|country|villages|venues)\/[a-z0-9-]+$/,
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
    expect(placeTagRedirect('friedrichstadt-palast')).toBe('/venues/friedrichstadt-palast');
  });

  it('does not redirect the four tags that were wrong-entity, not duplicates', () => {
    // Chasing friedrichstadt-palast by Wikidata class found four MORE tags on a building QID, and
    // none is a duplicate: `munch` is the BDSM meet-up linked to the Munch Museum, `hotel-bar` the
    // generic venue feature linked to Hotel Barcelona Princess, `power-exchange` the BDSM concept
    // linked to a defunct SF cinema, `city-center` linked to a Helsinki redevelopment plan. Those
    // are fixed by NULLING the identifier, never by redirecting the reader to a building.
    for (const slug of ['munch', 'hotel-bar', 'power-exchange', 'city-center']) {
      expect(placeTagRedirect(slug), `${slug} is wrong-entity, not a duplicate`).toBeNull();
    }
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
