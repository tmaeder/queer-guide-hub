import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards 99991790878434: "bear" is removed from infer_event_type's fetish arm,
 * and the scraper mirror is removed in lockstep.
 *
 * Both files carry long headers that QUOTE the removed token and the defect they
 * describe, so every assertion runs over COMMENT-STRIPPED text. Against the raw
 * file a not.toContain check fails on correct code (the header explains the
 * removal) and -- worse -- the mirror form passes while the token is back in the
 * statement.
 */
const MIGRATION = '99991790878434';
const raw = readFileSync(
  'supabase/migrations/' + MIGRATION + '_event_type_bear_is_not_a_fetish.sql',
  'utf8',
);
const scraperRaw = readFileSync('scraper/src/sources/gaycities/lib.ts', 'utf8');

/**
 * Drop whole-line SQL comments only. A mid-line double dash is left alone: it
 * occurs inside regex literals here, and cutting there truncates a statement.
 */
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** Drop line and block comments from the scraper mirror. */
const scraper = scraperRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

const verifyBlock = sql.slice(sql.indexOf('do $verify$'));
/**
 * The FUNCTION BODY is the only place the token must be absent. The repair's
 * cohort selector legitimately matches bear titles -- that is what it selects --
 * so a file-wide not.toContain fails on correct code.
 */
const fnBody = sql.slice(
  sql.indexOf('create or replace function public.infer_event_type'),
  sql.indexOf('comment on function'),
);
const unwrapStmt = sql.slice(
  sql.indexOf('description = btrim(regexp_replace('),
  sql.indexOf('do $verify$'),
);

const BEAR_TOKEN = 'bears?';
const FETISH_ARM = "'\\mleather\\M|fetish|\\mkink\\M|\\mrubber\\M|pup(py)? play|cruising'";
const SPORTS_ARM = "'sports|\\mrun\\M|\\mrace\\M|rodeo|tournament|\\mski\\M|marathon|\\mgames\\M'";
const SCRAPER_ARM = '[/\\bleather\\b|fetish|\\bkink\\b|\\brubber\\b|pup(py)? play|cruising/i';

describe('bear is an audience signal, not a fetish format', () => {
  it('positive control: the stripped SQL still holds the executable statements', () => {
    // Without this the whole suite is satisfiable by an empty string.
    expect(sql).toContain('create or replace function public.infer_event_type');
    expect(sql).toContain('update public.events e set');
    expect(sql).toContain('do $verify$');
    expect(sql.length).toBeGreaterThan(2000);
    // And the header really does quote the token, which is why stripping matters.
    expect(raw).toContain(BEAR_TOKEN);
  });

  it('removes the bear token from the fetish arm and from nothing else', () => {
    expect(fnBody.length).toBeGreaterThan(1000);
    expect(fnBody).toContain("THEN 'pride'");
    expect(fnBody).not.toContain(BEAR_TOKEN);
    // ...and the cohort selector still DOES match bear titles. That is the
    // other half: a file-wide absence check would be satisfied by a migration
    // that no longer selects anything to repair.
    expect(sql).toContain("and e.title ~* '\\mbears?\\M'");
    // The arm survives, narrowed rather than deleted: every surviving token
    // names a FORMAT, which is the claim this arm makes.
    expect(sql).toContain(FETISH_ARM + " THEN 'fetish'");
    // Sibling arms are untouched. The games token in the sports arm in
    // particular is a KNOWN separate defect this migration deliberately does
    // not fix; a later pass that narrows it owns this assertion.
    expect(sql).toContain(SPORTS_ARM + " THEN 'sports'");
    expect(sql).toContain("'\\mpride\\M|christopher street day|\\mcsd\\M'");
  });

  it('keeps the scraper mirror in lockstep', () => {
    expect(scraper).not.toContain('\\bbears?\\b');
    expect(scraper).toContain(SCRAPER_ARM + ", 'fetish']");
    // The scraper header must still explain the removal, or the next reader
    // re-adds the token from the comment left there justifying it.
    expect(scraperRaw).toContain(MIGRATION);
  });

  it('repairs by predicate and excludes genuine crossovers, never an id list', () => {
    expect(sql).toContain("and e.event_type = 'fetish'");
    expect(sql).toContain("and e.title ~* '\\mbears?\\M'");
    // The crossover exclusion is what keeps the 61 real fetish events labelled.
    expect(sql).toContain('~* ' + FETISH_ARM + ')');
    // No frozen uuid list anywhere in the statements.
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    // Neither the repair nor the verify block may be short-circuited. A `false`
    // conjunct in the cohort selector widens the repair to every bear-titled
    // fetish event -- including the 61 genuine crossovers -- while every string
    // assertion above stays green. Found by mutation, not by reading.
    expect(sql).not.toMatch(/\bfalse\b/);
  });

  it('records the value it overwrote, built with the merge operator not jsonb_set', () => {
    const update = sql.slice(sql.indexOf('with cohort as'), sql.indexOf('do $verify$'));
    expect(update).toContain("'by', 'migration:" + MIGRATION + "'");
    expect(update).toContain("'corrected_from', jsonb_build_object(");
    expect(update).toContain("'value', c.old_type");
    // jsonb_set(create_missing) creates only the LAST path element, so a row
    // with no event_type provenance key would have been written with the
    // record silently absent.
    expect(update).not.toContain('jsonb_set');
    expect(update).toContain("coalesce(e.field_provenance -> 'event_type', '{}'::jsonb) ||");
  });

  it('unwraps only well-formed p-only markup and preserves the truncation cohort', () => {
    // Anchored on the statement, not on a key inside its SET clause: the
    // paragraph replacement sits ABOVE 'html_unwrapped', so slicing from that
    // key left every assertion below testing a span that excluded the code.
    const unwrap = unwrapStmt;
    expect(unwrap.length).toBeGreaterThan(400);
    // A well-formed tag is required. The looser form selected a row whose tag
    // was cut mid-markup, which the replacement could not repair -- found by
    // the first prod dry run, not by reading.
    expect(unwrap).toContain("and e.description ~ '</?p[^>]*>'");
    expect(unwrap).not.toContain("~* '</?p\\M'");
    // Entities and any non-p tag are refused: an anchor would lose its target.
    expect(unwrap).toContain("and e.description !~ '&[a-zA-Z#][a-zA-Z0-9]*;'");
    expect(unwrap).toContain("where lower(m[1]) <> 'p')");
    // Real newlines, not a literal backslash-n.
    expect(unwrap).toContain("E'\\n\\n'");
  });

  it('asserts the reached state positively and mirrors both over-reach directions', () => {
    // Behavioural, not source text: a source-text check cannot tell a live rule
    // from a dead one.
    expect(verifyBlock).toContain("public.infer_event_type('Bear Week Provincetown'");
    expect(verifyBlock).toContain("public.infer_event_type('Berlin Leather Week'");
    // P4 drives the defect to zero; P5 proves the crossovers were not swept.
    expect(verifyBlock).toMatch(/if v_bad <> 0 then\s+raise exception 'P4 failed/);
    expect(verifyBlock).toMatch(/if v_keep < 50 then\s+raise exception 'P5 failed/);
    // P9 proves the truncated rows this pass deliberately preserves still exist.
    expect(verifyBlock).toContain("raise exception 'P9 failed");
    expect(verifyBlock).toContain("e.description ~ '<\\s*/?\\s*[a-zA-Z][^>]*$'");
    // A postcondition must not be short-circuited or pre-seeded: a false
    // conjunct leaves every string assertion green while the check has stopped
    // counting, and an initialiser in DECLARE does the same.
    expect(verifyBlock).not.toMatch(/\bfalse\b/);
    expect(verifyBlock).not.toMatch(/v_(bad|keep|stamp)\s+bigint\s*:=/);
    expect((verifyBlock.match(/raise exception 'P\d/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });
});
