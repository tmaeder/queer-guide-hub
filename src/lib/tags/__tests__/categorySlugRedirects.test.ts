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

/**
 * The legacy `?cat=` / `?category=` params carry a v2 display NAME, not a slug,
 * because that is what /tags emitted when those links were minted. v2 names left
 * `tag_categories` with the retirement (20261006150000), so the live-tree lookup
 * in `resolveCategorySlug` can no longer resolve them and the param would be
 * held forever — the reader lands on an unfiltered glossary.
 *
 * This pins the slugify rule that bridges name → map key. It is asserted here
 * rather than only in e2e because the e2e for it runs against prod.
 */
describe('legacy ?cat= name resolution', () => {
  const slugify = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  it('slugifies every retired v2 display name onto a real map key', () => {
    // The ampersand has to collapse INTO the separator run rather than survive
    // as a token, or "Health & Wellness" yields "health--wellness".
    const names: Record<string, string> = {
      'Identity & Expression': 'identity-expression',
      'Sexuality & Kink': 'sexuality-kink',
      'Relationships & Connection': 'relationships-connection',
      'Health & Wellness': 'health-wellness',
      'Safety & Practices': 'safety-practices',
      'Community & Culture': 'community-culture',
      'History & Heritage': 'history-heritage',
      'Rights & Activism': 'rights-activism',
      'Places & Travel': 'places-travel',
      'Support & News': 'support-news',
      'Body Types & Archetypes': 'body-types-archetypes',
      'Care & Access': 'care-access',
      'Current Affairs': 'current-affairs',
      'Professions & Allies': 'professions-allies',
      'Sexual Roles': 'sexual-roles',
    };
    for (const [name, slug] of Object.entries(names)) {
      expect(slugify(name), name).toBe(slug);
      expect(redirectedCategorySlug(slug), `${name} must resolve to a v3 line`).toBeTruthy();
    }
  });

  it('covers every retired slug the map knows, with no name left unresolvable', () => {
    // Guards the inverse: a slug added to the map later with a name shape the
    // slugify rule cannot produce would silently keep dead-ending.
    for (const from of Object.keys(CATEGORY_SLUG_REDIRECTS)) {
      expect(slugify(from), `${from} is not slugify-stable`).toBe(from);
    }
  });

  it('resolves a live v3 line to itself rather than through the map', () => {
    // A surviving line must never enter the redirect path — that would be a
    // self-redirect the first test already forbids, reached by a different door.
    for (const line of Object.values(CATEGORY_LINES)) {
      expect(redirectedCategorySlug(line.slug), `${line.slug} is live, not retired`).toBeNull();
    }
  });
});
