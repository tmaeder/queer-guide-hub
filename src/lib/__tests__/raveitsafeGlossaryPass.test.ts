import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the raveitsafe.ch glossary comparison pass.
 *
 * Two migrations, two different safety properties, and they are not the same
 * property — which is the reason this file exists rather than one assertion.
 *
 *   20360101101300  creates three absent terms and revives `impaired-driving`.
 *                   Everything it touches must land UNPUBLISHED. The revived
 *                   row is the dangerous one: it was seo_indexable=true while
 *                   deprecated, so reviving it without clearing that flag
 *                   publishes a machine-written body to crawlers.
 *
 *   20360101101400  fills nine empty `long_description` bodies on rows that are
 *                   ALREADY live and human_reviewed. It must never overwrite,
 *                   and it must not touch the review flags — because
 *                   `deprecate_unused_tags` selects exactly
 *                   `status='active' AND human_reviewed=false AND usage=0`, and
 *                   seven of the nine have zero usage. Stamping the otherwise
 *                   truthful human_reviewed=false there would hand the sweep
 *                   the very pages the migration exists to improve.
 *
 * Text checks against the migration files, so this runs in CI without
 * credentials — same pattern as `citySafetyBackfill.test.ts`.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const NEW_TERMS = '20360101101300_raveitsafe_missing_substance_terms.sql';
const BODIES = '20360101101400_raveitsafe_empty_substance_bodies.sql';

const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8');

describe('raveitsafe pass — new and revived terms', () => {
  const sql = read(NEW_TERMS);

  it('creates every new row unpublished', () => {
    // The INSERT's literal column values, in order: status, seo_indexable,
    // human_reviewed, verification_status.
    expect(sql).toMatch(/'active',\s*false,\s*false,\s*'unverified'/);
  });

  it('revives impaired-driving without publishing it', () => {
    const revive = sql.slice(sql.indexOf('update public.unified_tags set'));
    expect(revive).toMatch(/seo_indexable\s*=\s*false/);
    expect(revive).toMatch(/human_reviewed\s*=\s*false/);
    expect(revive).toMatch(/verification_status\s*=\s*'unverified'/);
  });

  it('clears the whole tombstone, not just the status', () => {
    // status='active' with deprecated_at still populated is the state that
    // once stranded 297 tags: the page rendered and search refused to index it.
    const revive = sql.slice(sql.indexOf('update public.unified_tags set'));
    expect(revive).toMatch(/status\s*=\s*'active'/);
    expect(revive).toMatch(/deprecated_at\s*=\s*null/);
    expect(revive).toMatch(/deprecation_reason\s*=\s*null/);
  });

  it('asserts no row it touched is publishable, covering the revived one', () => {
    expect(sql).toMatch(/union all select 'impaired-driving'[\s\S]{0,400}t\.seo_indexable/);
  });

  it('refuses to overwrite a slug that already exists in any status', () => {
    expect(sql).toMatch(/slug\(s\) already exist — resolve by hand/);
  });

  it('drops the Wikidata-derived body rather than appending to it', () => {
    expect(sql).toMatch(/according to wikidata/i);
    expect(sql).toMatch(/still carries the Wikidata-derived body/);
  });

  it('records provenance for every row it authored', () => {
    expect(sql).toMatch(/editorial:general-knowledge/);
    expect(sql).toMatch(/have no provenance record/);
  });
});

describe('raveitsafe pass — filling empty bodies', () => {
  const sql = read(BODIES);

  it('only ever fills a body that is empty', () => {
    // Both halves matter: the guard aborts if one has appeared since authoring,
    // and the UPDATE itself re-checks, so a concurrent write cannot be clobbered
    // between the two.
    expect(sql).toMatch(/already have a body — re-check before overwriting/);
    expect(sql).toMatch(
      /update public\.unified_tags t[\s\S]*coalesce\(t\.long_description, ''\) = ''/,
    );
  });

  it('assigns exactly one column, and it is long_description', () => {
    // Scope to the SET clause only. An earlier version of this test sliced from
    // `update` to `get diagnostics` and failed on `t.status = 'active'` in the
    // WHERE — a read, not a write. Asserting the assignment list directly is
    // both narrower and stronger: it catches a second column being added at all,
    // not only the three that were guessed at here.
    const body = sql.slice(sql.indexOf('update public.unified_tags t'));
    const setClause = body.slice(body.indexOf('set '), body.indexOf('from _body'));
    const assigned = [...setClause.matchAll(/(\w+)\s*=/g)].map((m) => m[1]);
    expect(assigned).toEqual(['long_description']);
  });

  it('leaves the review flags untouched and asserts it afterwards', () => {
    // If a later edit starts moving these, the migration must fail rather than
    // quietly feed zero-usage rows to deprecate_unused_tags.
    expect(sql).toMatch(/had their review flags altered/);
    expect(sql).toMatch(/coalesce\(t\.human_reviewed, false\) is not true/);
    expect(sql).toMatch(/t\.prose_reviewed_at is not null/);
  });

  it('declares an actor, without which the write is rejected', () => {
    // log_unified_tag_change() RAISEs when an undeclared `system:%` actor
    // modifies a human_reviewed row, and all nine targets are human_reviewed.
    expect(sql).toMatch(/set_config\('app\.actor', 'migration:raveitsafe-glossary-pass', true\)/);
  });

  it('asserts the exact row count it expects to fill', () => {
    expect(sql).toMatch(/if v_hit <> 9 then/);
  });
});

describe('raveitsafe pass — paragraph encoding', () => {
  // In a plain single-quoted PostgreSQL literal, `\n` is a literal backslash
  // followed by n, NOT a newline — so a body written that way renders the
  // escape sequence to the reader. The corpus stores real newlines (measured:
  // zero active bodies contain a literal backslash-n), and the convention is a
  // multi-line string literal, as in 20261007120000.
  for (const f of [NEW_TERMS, BODIES]) {
    it(`${f} contains no literal backslash-n escape`, () => {
      expect(read(f)).not.toMatch(/\\n/);
    });

    it(`${f} writes real paragraph breaks`, () => {
      // A body with no blank line inside a quoted string would mean the
      // paragraphs were lost rather than encoded.
      expect(read(f)).toMatch(/[a-z.,;:)"]\n\n[A-Z]/);
    });
  }
});
