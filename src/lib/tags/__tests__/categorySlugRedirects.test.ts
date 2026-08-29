import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORY_SLUG_REDIRECTS, redirectedCategorySlug } from '../categorySlugRedirects';
import { CATEGORY_LINES } from '../categoryIdentity';

/**
 * The edge (public/_redirects) and the client (categorySlugRedirects.ts) must
 * agree. They are separate files because Cloudflare never sees an in-app
 * navigation and the SPA never sees a cold request — but a slug that redirects
 * in one and not the other is a dead link on exactly one of those paths, which
 * is the kind of split nobody notices until a shared URL 404s.
 */
function edgeRules(): Record<string, string> {
  const raw = readFileSync(resolve(__dirname, '../../../../public/_redirects'), 'utf8');
  const map: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^\/tags\/c\/([a-z0-9-]+)\s+\/tags\/c\/([a-z0-9-]+)\s+301$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

describe('category slug redirects', () => {
  it('matches public/_redirects exactly', () => {
    expect(edgeRules()).toEqual(CATEGORY_SLUG_REDIRECTS);
  });

  it('never redirects to a slug that is itself redirected', () => {
    // A two-hop chain costs a round trip and Cloudflare does not follow it —
    // the reader lands on a URL that redirects again client-side.
    for (const target of Object.values(CATEGORY_SLUG_REDIRECTS)) {
      expect(CATEGORY_SLUG_REDIRECTS[target], `${target} is both a target and a source`).toBe(
        undefined,
      );
    }
  });

  it('never self-redirects', () => {
    for (const [from, to] of Object.entries(CATEGORY_SLUG_REDIRECTS)) {
      expect(from).not.toBe(to);
    }
  });

  it('retires every v2 line slug, and no v3 line slug', () => {
    // Every v2 root must have a home; no live v3 line may be redirected away.
    const v2Lines = [
      'identity-expression',
      'sexuality-kink',
      'relationships-connection',
      'health-wellness',
      'safety-practices',
      'community-culture',
      'history-heritage',
      'rights-activism',
      'places-travel',
      'support-news',
    ];
    for (const slug of v2Lines) {
      expect(redirectedCategorySlug(slug), `${slug} has no redirect`).toBeTruthy();
    }
    for (const line of Object.values(CATEGORY_LINES)) {
      expect(redirectedCategorySlug(line.slug), `${line.slug} is live`).toBeNull();
    }
  });

  it('misses safely', () => {
    expect(redirectedCategorySlug(null)).toBeNull();
    expect(redirectedCategorySlug('')).toBeNull();
    expect(redirectedCategorySlug('sexual-health')).toBeNull(); // survived in place
  });
});
