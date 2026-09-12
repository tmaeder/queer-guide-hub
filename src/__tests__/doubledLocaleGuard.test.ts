import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isIndexable,
  splitLocale,
  startsWithLocale,
} from '../../functions/_lib/routeMeta';

/**
 * Guards the doubled-locale hard 404.
 *
 * The bug this locks down was NOT the original double-prefix producer (a
 * breadcrumb helper that prefixed twice, fixed in 0b3a2545b on 2026-08-16).
 * It is the SECOND-order one that kept the URLs alive long after that fix:
 *
 *   `splitLocale('/fr/fr/places')` -> locale 'fr', basePath '/fr/places'
 *
 * `/fr/places` is not a detail path, so the middleware's hard-404 branch
 * skipped it and the SPA shell was served at HTTP 200. `isIndexable('/fr/
 * places')` is true, so the edge then emitted an hreflang alternate for all
 * 11 locales — each one carrying the stray segment. One junk URL advertised
 * ten more, and crawlers recycled them indefinitely. Measured on prod: every
 * SAME-locale fingerprint pre-dated the 2026-08-16 fix, while CROSS-locale
 * ones (`/it/fr/history`, `/ar/es/history`) kept appearing after it — those
 * are this fan-out, not the old producer.
 *
 * The assertions below are deliberately about the PROPERTY (a doubled prefix
 * is detected, for every locale pair, and the basePath it would otherwise be
 * served under is indexable) rather than about a hardcoded URL list, which
 * would go stale the moment a locale is added.
 */
describe('doubled locale prefix', () => {
  it('detects a doubled prefix for every ordered locale pair', () => {
    for (const outer of SUPPORTED_LOCALES) {
      for (const inner of SUPPORTED_LOCALES) {
        const { basePath } = splitLocale(`/${outer}/${inner}/places`);
        expect(startsWithLocale(basePath), `/${outer}/${inner}/places`).toBe(true);
      }
    }
  });

  it('detects the bare two-segment form (/pt/pt, /ko/ko)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { basePath } = splitLocale(`/${locale}/${locale}`);
      expect(startsWithLocale(basePath), `/${locale}/${locale}`).toBe(true);
    }
  });

  it('does NOT fire on a single, legitimate locale prefix', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { locale: parsed, basePath } = splitLocale(`/${locale}/places`);
      expect(parsed).toBe(locale);
      expect(basePath).toBe('/places');
      expect(startsWithLocale(basePath)).toBe(false);
    }
  });

  it('does NOT fire on unprefixed paths, including short ones', () => {
    for (const p of ['/', '/places', '/events', '/map', '/news', '/tags/it', '/tags/en']) {
      expect(startsWithLocale(p), p).toBe(false);
    }
  });

  /**
   * The positive control for the whole fix. If this ever goes false the bug
   * becomes unreachable for an unrelated reason (the path stopped being
   * indexable), and the tests above would still pass while proving nothing.
   */
  it('positive control: the stripped basePath WOULD have been indexable', () => {
    const { basePath } = splitLocale('/fr/fr/places');
    expect(basePath).toBe('/fr/places');
    expect(isIndexable(basePath)).toBe(true);
  });

  it('DEFAULT_LOCALE is itself guarded (/en/en/x)', () => {
    const { basePath } = splitLocale(`/${DEFAULT_LOCALE}/${DEFAULT_LOCALE}/places`);
    expect(startsWithLocale(basePath)).toBe(true);
  });

  /**
   * Ordering is load-bearing: resolveLandingRoute runs off the STRIPPED
   * basePath, so if the guard ran after it, `/fr/fr/pride/2026` would resolve
   * a real landing page and publish it under the doubled URL.
   */
  it('middleware 404s the doubled prefix before resolving a landing route', () => {
    const src = readFileSync(join(process.cwd(), 'functions/_middleware.ts'), 'utf8');

    // Anchored to the WHOLE condition, not a substring of it. A bare
    // `indexOf('startsWithLocale(basePath)')` is satisfied by
    // `if (false && startsWithLocale(basePath))` — mutation-tested, and the
    // loose form did not catch exactly that.
    const guard = /\n\s*if \(startsWithLocale\(basePath\)\) \{/.exec(src);
    expect(
      guard,
      'guard must be an unconditional `if (startsWithLocale(basePath)) {`',
    ).not.toBeNull();

    const guardAt = guard!.index;
    const landingAt = src.indexOf('resolveLandingRoute(env, basePath)');
    expect(landingAt).toBeGreaterThan(-1);
    // Ordering is the property: resolveLandingRoute runs off the STRIPPED
    // basePath, so a guard after it publishes a real landing page under the
    // doubled URL.
    expect(guardAt).toBeLessThan(landingAt);

    // …and the branch must actually refuse, not merely be entered.
    const body = src.slice(guardAt, landingAt);
    expect(body).toMatch(/status:\s*404/);
  });
});
