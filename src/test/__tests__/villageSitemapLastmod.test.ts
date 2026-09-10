import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * sitemap-villages.xml published a 95-day-old lastmod for every village.
 *
 * Measured 2026-09-10: `max(queer_villages.updated_at)` was 2026-06-08 across
 * all 176 rows, because nothing writes that column any more. The village engine
 * is healthy — village_relink, village_trust_recompute,
 * village_completeness_recompute and village_agentic_enrich all ran that day
 * with consecutive_failures = 0 — but it maintains `last_verified_at` and the
 * geo_places spine row instead. Google treats lastmod as a recrawl hint, so a
 * June date told it not to bother with pages whose venue list village_relink
 * may have changed that morning.
 *
 * Before / after on the same 131 URLs:
 *   prod   2 distinct values, both June  (88 × 2026-06-07, 43 × 2026-06-08)
 *   fixed  12 distinct values, most recent 2026-09-10, at most 14 on any day
 *
 * The "at most 14 on any day" part is the half that is easy to lose. A lastmod
 * reading today for every URL on every fetch is lastmod spam and Google
 * discounts it; `last_verified_at` is safe to use precisely BECAUSE it is a
 * per-row rolling signal (trailing days carried 14, 12, 14, 5, 17, 10) rather
 * than a daily blanket stamp.
 */

const SRC = readFileSync(join(process.cwd(), 'functions/sitemap-villages.xml.ts'), 'utf8');

// Comment-stripped: the explanatory block names `updated_at` repeatedly, so a
// naive scan would match the explanation instead of the code.
const CODE = SRC.split('\n')
  .filter((l) => {
    const t = l.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/'));
  })
  .join('\n');

describe('village sitemap lastmod', () => {
  it('the comment stripper leaves code and removes prose', () => {
    expect(CODE).toContain('fetchRows');
    expect(SRC).toContain('lastmod spam');
    expect(CODE).not.toContain('lastmod spam');
  });

  it('selects last_verified_at, not updated_at alone', () => {
    expect(CODE).toContain('last_verified_at');
    expect(CODE).toMatch(/'slug,updated_at,last_verified_at'/);
  });

  it('derives lastmod from BOTH columns', () => {
    // The regression to guard is someone simplifying this back to
    // `lastmod: day(r.updated_at)`, which republishes the June date.
    expect(CODE).toMatch(/verified\s*>\s*updated/);
    expect(CODE).toContain('r.last_verified_at');
    expect(CODE).not.toMatch(/lastmod:\s*day\(r\.updated_at\)\s*,/);
  });

  it('keeps the publishability gates the other sitemaps use', () => {
    expect(CODE).toContain('seo_indexable=eq.true');
    expect(CODE).toContain('duplicate_of_id=is.null');
    expect(CODE).toContain('shell_status=not.in.(ghost,merged)');
  });
});

describe('the lastmod pick itself', () => {
  // Mirrors the inline expression. ISO dates compare correctly as strings.
  const pick = (updated?: string, verified?: string) =>
    updated && verified ? (verified > updated ? verified : updated) : (verified ?? updated);

  it('takes the later of the two', () => {
    expect(pick('2026-06-08', '2026-09-10')).toBe('2026-09-10');
    expect(pick('2026-09-10', '2026-06-08')).toBe('2026-09-10');
    expect(pick('2026-06-08', '2026-06-08')).toBe('2026-06-08');
  });

  it('falls back to whichever exists, and to undefined when neither does', () => {
    expect(pick('2026-06-08', undefined)).toBe('2026-06-08');
    expect(pick(undefined, '2026-09-10')).toBe('2026-09-10');
    expect(pick(undefined, undefined)).toBeUndefined();
  });
});
