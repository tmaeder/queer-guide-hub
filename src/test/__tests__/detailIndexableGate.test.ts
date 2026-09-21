import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `functions/_lib/detail.ts` builds the ONLY HTML a non-JS crawler ever sees.
 * If a detail function does not return `indexable`, its page is served as
 * indexable no matter what the row's `seo_indexable` column says — and the
 * column has several writers that then do nothing at all.
 *
 * THIS HAS NOW HAPPENED THREE TIMES, to three different entities:
 *
 *   personalityDetail  — noted in its own source comment: "Omitting it made the
 *                        page ALWAYS indexable".
 *   villageDetail      — CLAUDE.md: "never selected seo_indexable at all, so the
 *                        bot response was unconditionally indexable regardless
 *                        of the column".
 *   tagDetail          — found 2026-08-29 by checking prod after shipping a
 *                        304-page deindex. /tags/fetish, /tags/felching,
 *                        /tags/compersion, /tags/hentai and /tags/gooning all
 *                        had seo_indexable=false in the database and served NO
 *                        robots meta. It silently defeated BOTH writers of the
 *                        column: run_tag_thin_page_reindex (20260921110000) and
 *                        the verbatim-overlap deindex (20261007160100).
 *
 * ...and then THREE MORE, all found 2026-08-29 while making "archived" mean
 * invisible: cityDetail (seo_indexable in neither the select nor the return, so
 * every ghost city published a full "LGBTQ+ guide to <not-a-place>"),
 * eventDetail (same, and personalityDetail's comment claimed it already had the
 * gate — it never did), and countryDetail.
 *
 * THAT IS SIX. The list below is now derived from information_schema rather
 * than from whoever remembered to add a line: every table with a
 * `seo_indexable` column that has a renderer here must appear.
 *
 * SEVEN, as of 2026-08-30: hotelDetail, found while giving hotels an archived
 * state. `hotels.seo_indexable` is NOT NULL DEFAULT true and was non-false on
 * all 325 rows, so nothing had ever exercised it — the gate was dead code that
 * looked alive. That is the pattern worth noticing: this list caught six
 * renderers only because someone thought to add each of them, and hotelDetail
 * sat outside it for as long as the file has existed.
 *
 * The failure is invisible in review — the function looks complete, the page
 * renders, and nothing errors. Only a live crawl or this test catches it.
 *
 * The check is deliberately TEXT-BASED over the source rather than a runtime
 * test: the runtime path needs a live PostgREST, and the defect is precisely an
 * omission, which a mock would have to be written to notice.
 */

const SRC = readFileSync(join(process.cwd(), 'functions/_lib/detail.ts'), 'utf8');

/**
 * Detail functions whose backing table HAS a `seo_indexable` column, verified
 * against information_schema on prod. Adding an entity to detail.ts whose table
 * carries the column means adding it here.
 */
const GATED = [
  { fn: 'venueDetail', table: 'venue_catalog_public', field: 'catalog_indexable' },
  { fn: 'personalityDetail', table: 'personalities', field: 'seo_indexable' },
  { fn: 'tagDetail', table: 'unified_tags', field: 'seo_indexable' },
  { fn: 'villageDetail', table: 'queer_villages', field: 'seo_indexable' },
  { fn: 'milestoneDetail', table: 'milestones', field: 'seo_indexable' },
  { fn: 'cityDetail', table: 'cities', field: 'seo_indexable' },
  { fn: 'eventDetail', table: 'events', field: 'seo_indexable' },
  { fn: 'countryDetail', table: 'countries', field: 'seo_indexable' },
  { fn: 'newsDetail', table: 'news_articles', field: 'seo_indexable' },
  { fn: 'hotelDetail', table: 'hotels', field: 'seo_indexable' },
] as const;

/** Slice the source of one `async function <name>(` up to the next one. */
function bodyOf(fnName: string): string {
  const start = SRC.indexOf(`async function ${fnName}(`);
  if (start === -1) return '';
  const rest = SRC.slice(start + 10);
  const next = rest.indexOf('\nasync function ');
  return next === -1 ? rest : rest.slice(0, next);
}

describe('detail.ts honours seo_indexable', () => {
  for (const { fn, table, field } of GATED) {
    it(`${fn} selects its indexability field and returns indexable`, () => {
      const body = bodyOf(fn);
      expect(body, `${fn} not found in detail.ts`).not.toBe('');

      // It must ASK for the column. Returning `row.seo_indexable !== false`
      // without selecting it yields undefined -> always indexable, which is the
      // same bug wearing the fix's clothes.
      expect(
        body.includes(field),
        `${fn} never selects ${field} from ${table}; its page will be indexable regardless of the column`,
      ).toBe(true);

      // And it must USE it in the returned shape. The identifier is matched
      // loosely (`row`, `cityRow`, …) because the binding name varies by
      // renderer; what is asserted is that the returned `indexable` is derived
      // from the fetched row's column and not from a literal.
      expect(
        new RegExp(`\\bindexable:\\s*\\w*[Rr]ow\\.${field}\\s*(!==\\s*false|===\\s*true)`).test(
          body,
        ),
        `${fn} does not return \`indexable\` derived from the row's ${field}`,
      ).toBe(true);
    });
  }

  it('no gated detail function hardcodes indexable: true', () => {
    for (const { fn } of GATED) {
      const body = bodyOf(fn);
      expect(
        /indexable:\s*true\b/.test(body),
        `${fn} hardcodes indexable: true, which ignores its own seo_indexable column`,
      ).toBe(false);
    }
  });
});
