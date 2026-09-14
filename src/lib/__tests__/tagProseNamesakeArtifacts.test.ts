import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards `51700101143000`, which repairs 50 glossary pages whose prose is about
 * a categorically different KIND of thing than the tag — a French commune, a
 * constellation, a Java web server, a rail operation, a surname.
 *
 * The assertions that matter are not "did it write my wording". They are the
 * four places a 50-row batch could do harm:
 *
 *   1. `description` must never be written. It is the evidence that justified
 *      every one of these repairs; writing it would destroy what made the
 *      change defensible.
 *   2. `schoolgirl` must lose its body. It is is_adult and seo_indexable, its
 *      own description says "All participants are consenting adults", and the
 *      published body read "A schoolgirl is a child who is studying in a
 *      school" — the same shape `young` was repaired for.
 *   3. Nulling a body must not unpublish a page. `tag_has_prose` reads
 *      description first, so the migration has to assert that rather than
 *      reason about it.
 *   4. The five rows where only ONE field is wrong must keep the half that is
 *      already right (collar/humbler summaries, bottom/babyboy/dyke bodies).
 */

const FILE = join(
  process.cwd(),
  'supabase/migrations/51700101143000_tag_prose_namesake_artifacts.sql',
);

const sql = readFileSync(FILE, 'utf8');

/** Statements only — a claim made in a comment is not a guard. */
function statements(): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

/** The UPDATE statements, split so an assertion can be scoped to one. */
function updates(): string[] {
  return statements()
    .split(/update\s+unified_tags/i)
    .slice(1)
    .map((u) => u.slice(0, u.indexOf(';')));
}

describe('namesake artifacts migration', () => {
  const code = statements();

  it('declares an actor, which the audit trigger requires', () => {
    // 48 of the 50 rows are human_reviewed, and log_unified_tag_change()
    // RAISEs when a `system:%` actor modifies one. Verified live.
    expect(code).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:51700101143000'/);
  });

  it('never writes description', () => {
    const us = updates();
    expect(us.length).toBeGreaterThanOrEqual(50);
    for (const u of us) {
      const setClause = u.slice(0, u.search(/\bwhere\b/i));
      // `short_description` / `long_description` must not satisfy this.
      expect(setClause).not.toMatch(/(^|[\s,])description\s*=/);
      expect(setClause).toMatch(/(short_description|long_description)\s*=/);
    }
  });

  it('guards every repair on the defect’s own text', () => {
    // So a human who fixes one first keeps their work and this file no-ops.
    for (const u of updates()) {
      const where = u.slice(u.search(/\bwhere\b/i));
      expect(where).toMatch(/and\s+(short_description|long_description)\s*(=|like)/);
    }
  });

  it('strips schoolgirl’s body and hard-fails while it survives', () => {
    const i = code.indexOf("slug = 'schoolgirl'");
    expect(i).toBeGreaterThan(-1);
    const stmt = code.slice(code.lastIndexOf('update unified_tags', i), i);
    expect(stmt).toMatch(/long_description\s*=\s*null/);

    const guard = code.slice(
      code.indexOf(
        "slug = 'schoolgirl' and status = 'active'\n                and long_description is not null",
      ),
    );
    expect(guard.slice(0, 260)).toMatch(/raise exception/);
  });

  it('asserts every touched row stays above the thin-page gate', () => {
    // Without this, "nulling the body is safe" is only a convention.
    expect(code).toMatch(/not tag_has_prose\(description,\s*short_description\)/);
    expect(code).toMatch(/fell below the thin-page gate/);
    expect(code).toMatch(/raise exception '% row\(s\) fell below the thin-page gate'/);
  });

  it('asserts the description it reasoned from is still present', () => {
    expect(code).toMatch(/and description is null/);
    expect(code).toMatch(/lost the description this file reasoned from/);
  });

  it('keeps the correct half on the five single-field rows', () => {
    // collar + humbler: summary only, body is already correct kink prose.
    for (const slug of ['collar', 'humbler']) {
      const u = updates().find((x) => x.includes(`slug = '${slug}'`));
      expect(u, slug).toBeDefined();
      expect(u).toMatch(/short_description\s*=/);
      expect(u).not.toMatch(/long_description\s*=/);
    }
    // bottom + babyboy + dyke: body only, summary is already correct.
    for (const slug of ['bottom', 'babyboy', 'dyke']) {
      const u = updates().find((x) => x.includes(`slug = '${slug}'`));
      expect(u, slug).toBeDefined();
      expect(u).toMatch(/long_description\s*=\s*null/);
      expect(u).not.toMatch(/short_description\s*=/);
    }
  });

  it('tests for the WRONG text, not for its own wording', () => {
    // A postcondition pinned to this file's prose aborts db push on main if a
    // human writes something better first, which blocks every queued migration.
    expect(code).toMatch(/'Student enrolled in a school'/);
    expect(code).toMatch(/'Java web application server'/);
    expect(code).toMatch(/'Private foundation providing grants'/);
    // ...and not for the replacements it happens to write.
    expect(code).not.toMatch(/short_description\s*=\s*'A female dominant\.'\s*\)/);
  });

  it('still names the classes it deliberately left', () => {
    // A pass that silently stopped reporting them would make the next pass
    // unable to tell "deferred" from "fixed".
    expect(code).toMatch(/'goat','frog','bunny'/);
    expect(code).toMatch(/zoology-on-a-role/);
    expect(code).toMatch(/dark-room and darkroom are both active/);
    expect(code).toMatch(/titica left unchanged/);
    expect(code).toMatch(/raise notice/);
  });

  it('does not touch the rows the concurrent round-four pass took', () => {
    // 51500101160000 (#3714) merged while this was being read. Two migrations
    // repairing one row is how db push ends up asserting a state neither
    // reached; the split must stay clean.
    for (const slug of ['casual', 'drag-show', 'rooftop']) {
      for (const u of updates()) expect(u).not.toContain(`'${slug}'`);
    }
  });

  it('repairs the inversion on stone-top without touching its correct body', () => {
    const u = updates().find((x) => x.includes("slug = 'stone-top'"));
    expect(u).toBeDefined();
    // Its body ("prefers to be the insertive partner") is right; only the
    // summary said the opposite of the row's own description.
    expect(u).not.toMatch(/long_description\s*=/);
    expect(u).toMatch(/A person who receives anal sex/);
  });
});
