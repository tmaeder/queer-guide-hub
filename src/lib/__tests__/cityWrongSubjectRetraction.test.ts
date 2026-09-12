import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `city-agentic-enrich` grounded its prose in whatever Wikipedia article owned a
 * city's bare name, and `cities.description` auto-publishes at confidence >= 0.8.
 * /city/daphne served the Apollo myth to crawlers. 14 of the 79 agentic-enriched
 * cities with no `wikidata_qid` were wrong.
 *
 * Asserted against COMMENT-STRIPPED source. Both files' headers quote every string
 * these tests look for, so an unstripped check passes on the prose with the code
 * deleted — the trap CLAUDE.md records four times.
 */

const stripSql = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const stripTs = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

const sql = stripSql(
  readFileSync(
    join(
      process.cwd(),
      'supabase',
      'migrations',
      '20800101100000_retract_wrong_subject_city_descriptions.sql',
    ),
    'utf8',
  ),
);
const body = sql.slice(0, sql.indexOf('$verify$'));
const verify = sql.slice(sql.indexOf('$verify$'));

const guard = stripTs(
  readFileSync(
    join(process.cwd(), 'supabase', 'functions', '_shared', 'city-wiki-guard.ts'),
    'utf8',
  ),
);
const fn = stripTs(
  readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'city-agentic-enrich', 'index.ts'),
    'utf8',
  ),
);

describe('the retraction', () => {
  it('has a body and a verify block to test against', () => {
    expect(body).toContain('UPDATE public.cities');
    expect(verify).toContain('RAISE EXCEPTION');
  });

  it('keys the rows by ID, never by slug or name', () => {
    // `brisbane` by slug is Brisbane, AUSTRALIA, whose identical description is
    // CORRECT for that row. A slug-keyed repair would have retracted it.
    expect(body).toMatch(/c\.id = w\.city_id/);
    expect(body).not.toMatch(/c\.slug\s+IN|WHERE\s+c\.slug/i);
  });

  it('is content-guarded per row, so a human rewrite is never clobbered', () => {
    expect(body).toMatch(/c\.description ILIKE w\.signature/);
    expect(body).toMatch(/c\.description IS NOT NULL/);
  });

  it('preserves the retracted text rather than destroying it', () => {
    const set = body.slice(body.indexOf('SET description'), body.indexOf('FROM wrong'));
    expect(set).toMatch(/'value', c\.description/);
    expect(set).toMatch(/'retracted'/);
  });

  it('does NOT use the two-level jsonb_set that silently writes nothing', () => {
    // jsonb_set's create_missing only creates the LAST path element, so on a row
    // whose field_provenance has no `description` key — every row in this set — it
    // returns the document unchanged and the snapshot is lost. Measured on prod.
    expect(body).not.toMatch(/jsonb_set\s*\([^)]*\{description,retracted\}/);
    expect(body).toMatch(/jsonb_build_object\('description'/);
  });

  it('never rewrites, only removes', () => {
    const set = body.slice(body.indexOf('SET description'), body.indexOf('FROM wrong'));
    expect(set).toMatch(/description = NULL/);
  });

  it('raises needs_attention so the rows are visible as work', () => {
    expect(body).toMatch(/needs_attention = true/);
  });
});

describe('postconditions', () => {
  it('fails if any wrong-subject signature survived', () => {
    expect(verify).toMatch(/wrong-subject city descriptions survived[\s\S]{0,80}v_left/);
    expect(verify).toMatch(/IF v_left > 0 THEN[\s\S]{0,120}RAISE EXCEPTION/);
  });

  it('fails if the snapshot was not written', () => {
    // The guard that the first draft needed and did not have.
    const start = verify.indexOf('v_snapshots <> 14');
    expect(start, 'the snapshot count assertion moved or was removed').toBeGreaterThan(-1);
    const branch = verify.slice(start, verify.indexOf('END IF;', start));
    expect(branch).toMatch(/RAISE EXCEPTION/);
  });

  it('fails if the Australian Brisbane was caught by mistake', () => {
    const start = verify.indexOf('v_brisbane');
    expect(start).toBeGreaterThan(-1);
    const branch = verify.slice(verify.indexOf('IF v_brisbane', start));
    expect(branch.slice(0, 260)).toMatch(/RAISE EXCEPTION/);
    expect(verify).toMatch(/Australian state of Queensland/);
  });

  it('fails on over-retraction of the rows that are correct', () => {
    expect(verify).toMatch(/v_untouched < 250[\s\S]{0,160}RAISE EXCEPTION/);
  });
});

describe('the producer seal', () => {
  it('refuses a disambiguation page', () => {
    expect(guard).toMatch(/refer to\\s\*:/);
    expect(guard).toMatch(/reason: 'disambiguation'/);
  });

  it('requires the lead to describe a place', () => {
    expect(guard).toMatch(/PLACE_LEAD/);
    expect(guard).toMatch(/reason: 'not-place'/);
  });

  it('requires the lead to corroborate our own region or country', () => {
    // The place gate alone cannot see Parma, Italy standing in for Parma, Ohio.
    expect(guard).toMatch(/reason: 'uncorroborated'/);
    expect(guard).toMatch(/corroborated/);
  });

  it('reads the LEAD only, never the whole article', () => {
    // Searching the whole body corroborated Brisbane, California against the
    // Brisbane, Australia article, which mentions the United States further down.
    expect(guard).toMatch(/extract\.slice\(0, LEAD_CHARS\)/);
    expect(guard).toMatch(/export const LEAD_CHARS = \d+/);
  });

  it('does not rest on title agreement, which is the bug signature', () => {
    expect(guard).not.toMatch(/titleAgrees/);
  });
});

describe('the edge function uses the seal', () => {
  it('imports the guard rather than restating the rules', () => {
    expect(fn).toMatch(
      /import \{[^}]*cityWikiVerdict[^}]*\} from '\.\.\/_shared\/city-wiki-guard\.ts'/,
    );
  });

  it('retries the region-qualified title before giving up', () => {
    expect(fn).toMatch(/regionQualifiedTitle\(identity\)/);
    expect(fn).toMatch(/const retryVerdict = cityWikiVerdict\(retry, identity\)/);
  });

  it('only retries AFTER a refusal, so correct resolutions are untouched', () => {
    const start = fn.indexOf('if (!wpVerdict.adopt && wpExtract)');
    expect(start, 'the retry is no longer gated on a refusal').toBeGreaterThan(-1);
    const block = fn.slice(start, fn.indexOf('const wikiRefused', start));
    expect(block).toMatch(/regionQualifiedTitle/);
  });

  it('drops the wiki source when it is refused', () => {
    expect(fn).toMatch(/if \(wikiRefused\) \{[\s\S]{0,320}wpExtract = null/);
  });

  it('does not launder a refused source through the existing description', () => {
    // The old description was written from the same bad article; re-feeding it
    // carries the wrong subject into a fresh run. Prose may not vouch for its source.
    expect(fn).toMatch(/if \(c\.description && !wpExtract && !wikiRefused\)/);
  });
});
