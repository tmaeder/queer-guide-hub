import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MERGED_VILLAGE_CITY_SLUGS, mergedVillageCitySlug } from '@/lib/mergedVillageRedirects';

/**
 * The 14 hard-merged villages are described in two places that cannot see each
 * other: `public/_redirects` (edge 301 for a cold inbound link) and
 * `MERGED_VILLAGE_CITY_SLUGS` (the /:lang/ paths and in-app navigation, which
 * _redirects never sees). A pair that exists in only one of them is a 404 on
 * exactly the surface the other one does not cover.
 */

const redirects = readFileSync(join(process.cwd(), 'public', '_redirects'), 'utf8');

const rules = redirects
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('/villages/'))
  .map((l) => l.split(/\s+/));

describe('merged village redirects', () => {
  it('has one 301 in public/_redirects per merged village', () => {
    for (const [villageSlug, citySlug] of Object.entries(MERGED_VILLAGE_CITY_SLUGS)) {
      const rule = rules.find((r) => r[0] === `/villages/${villageSlug}`);
      expect(rule, `no _redirects rule for /villages/${villageSlug}`).toBeDefined();
      expect(rule?.[1]).toBe(`/city/${citySlug}`);
      expect(rule?.[2]).toBe('301');
    }
  });

  it('has no /villages/ rule that the map does not know about', () => {
    for (const rule of rules) {
      const villageSlug = rule[0].replace('/villages/', '');
      expect(
        mergedVillageCitySlug(villageSlug),
        `_redirects sends /villages/${villageSlug} somewhere the map does not`,
      ).not.toBeNull();
    }
  });

  it('returns null for a village that still exists', () => {
    expect(mergedVillageCitySlug('castro-district')).toBeNull();
    expect(mergedVillageCitySlug(undefined)).toBeNull();
  });
});
