import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prideYears, isOwnedLandingShape } from '../../../functions/_lib/landing';

/**
 * /pride/:year/:city was advertised for years that hold no Pride events, and
 * NOT advertised for the year the site is actually in.
 *
 * `sitemap-landings.xml.ts` fanned major cities out over `PRIDE_YEARS.slice(-3)`
 * — the last three years of a hardcoded 2024..2030 range, i.e. 2028/2029/2030,
 * NOT the next three. Measured on prod 2026-09-10:
 *
 *   pride events   2024: 96   2025: 62   2026: 197   2027: 128
 *                  2028: 0    2029: 0    2030: 0
 *
 * …so 618 of the sitemap's 647 entries were speculative city pages for years
 * with zero events (~1,600 chars of template, no content links — thin/doorway
 * content at scale), while 2026's 143 Pride cities and 2027's 124 got none.
 *
 * Two regressions are guarded:
 *  1. The ceiling must stay DERIVED. A literal rots in both directions: it
 *     publishes years that do not exist yet, and it silently stops publishing
 *     the current year once the calendar passes it.
 *  2. The two-segment /pride/:year/:city form must keep returning a real 404
 *     when declined. The SPA has routes for `pride` and `pride/:year` but NOT
 *     for that form, so falling through renders its catch-all not-found at
 *     HTTP 200 — and Google keeps a soft 404 while it drops a real one. Those
 *     618 URLs were advertised for months, so they WILL be recrawled.
 */

const SITEMAP_SRC = readFileSync(join(process.cwd(), 'functions/sitemap-landings.xml.ts'), 'utf8');

describe('pride landing years', () => {
  it('ends at the current year + 1, not a hardcoded ceiling', () => {
    const years = prideYears();
    const now = new Date().getUTCFullYear();
    expect(years[years.length - 1]).toBe(now + 1);
    expect(years).toContain(now);
    // The literal that caused this: four years of speculative URLs.
    expect(years).not.toContain(2030);
  });

  it('still starts at 2024, where the corpus has real events', () => {
    expect(prideYears()[0]).toBe(2024);
  });

  it('is contiguous', () => {
    const years = prideYears();
    for (let i = 1; i < years.length; i += 1) expect(years[i]).toBe(years[i - 1] + 1);
  });

  it('the sitemap no longer fans cities out over a slice of the year list', () => {
    // Comment lines are stripped: the fix's own comment names slice(-3) to
    // explain it, and a naive scan would match that instead of the code.
    const code = SITEMAP_SRC.split('\n')
      .filter((l) => {
        const t = l.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
      })
      .join('\n');
    expect(code).not.toContain('slice(-3)');
    // …and it derives the pairs from events that exist.
    expect(code).toContain("'events'");
    expect(code).toContain('event_type=eq.pride');
  });
});

describe('owned landing shapes get a real 404, not a soft one', () => {
  it('matches the two-segment forms the SPA cannot render', () => {
    expect(isOwnedLandingShape('/pride/2030/moscow')).toBe(true);
    expect(isOwnedLandingShape('/pride/2028/mombasa')).toBe(true);
    expect(isOwnedLandingShape('/pride/2030/region/europe')).toBe(true);
    expect(isOwnedLandingShape('/pride/2026/austin/')).toBe(true);
  });

  it('never matches the forms that ARE SPA routes', () => {
    // 404ing either of these would delete two working pages.
    expect(isOwnedLandingShape('/pride')).toBe(false);
    expect(isOwnedLandingShape('/pride/2026')).toBe(false);
    expect(isOwnedLandingShape('/pride/2026/')).toBe(false);
  });

  it('does not reach beyond /pride', () => {
    expect(isOwnedLandingShape('/venues/bar-1-5')).toBe(false);
    expect(isOwnedLandingShape('/spaces/trans')).toBe(false);
    expect(isOwnedLandingShape('/city/berlin')).toBe(false);
    expect(isOwnedLandingShape('/pride/notayear/moscow')).toBe(false);
  });
});
