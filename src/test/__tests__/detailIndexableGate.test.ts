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
  { fn: 'venueDetail', table: 'venues' },
  { fn: 'personalityDetail', table: 'personalities' },
  { fn: 'tagDetail', table: 'unified_tags' },
  { fn: 'villageDetail', table: 'queer_villages' },
  { fn: 'milestoneDetail', table: 'milestones' },
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
  for (const { fn, table } of GATED) {
    it(`${fn} selects seo_indexable and returns indexable`, () => {
      const body = bodyOf(fn);
      expect(body, `${fn} not found in detail.ts`).not.toBe('');

      // It must ASK for the column. Returning `row.seo_indexable !== false`
      // without selecting it yields undefined -> always indexable, which is the
      // same bug wearing the fix's clothes.
      expect(
        body.includes('seo_indexable'),
        `${fn} never selects seo_indexable from ${table}; its page will be indexable regardless of the column`,
      ).toBe(true);

      // And it must USE it in the returned shape.
      expect(
        /\bindexable:\s*row\.seo_indexable\s*(!==\s*false|===\s*true)/.test(body),
        `${fn} does not return \`indexable\` derived from row.seo_indexable`,
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
