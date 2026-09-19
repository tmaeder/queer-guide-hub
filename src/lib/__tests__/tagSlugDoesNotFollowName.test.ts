/**
 * A display-name edit must not move a tag's canonical URL.
 *
 * `normalize_tag_input()` re-derived the slug from the name on every update
 * that changed the name, so renaming a tag silently moved its page and minted
 * a redirect. Measured on prod, setting `hiv-aids` to "HIV and AIDS" moved the
 * slug to `hiv-and-aids` on an indexable row carrying 289 assignments.
 *
 * TWO writers had to change. `trg_normalize_tag_input` fires first and carries
 * the name-triggered branch; `trg_unified_tags_normalize_slug` fires later.
 *
 * THE SECOND ONE IS SHARED WITH THE SEAL, AND THE SEAL WINS THE FIRST BRANCH.
 * `20261211120000_tag_slug_seal.sql` makes the NAME win for a non-ASCII name,
 * because source-tags-extract upserts a non-transliterated slug as the ON
 * CONFLICT key. On that re-upsert NEW.slug equals OLD.slug -- so an
 * unwritten-slug early return placed above the seal swallows exactly the case
 * the seal exists for, and `b-hne` never heals. A first draft of this file did
 * that, and tagSlugSeal.test.ts caught it.
 *
 * So the ordering is asserted in the direction that composes: the seal first,
 * this migration's rule as the ELSIF underneath. The cost is stated rather than
 * hidden -- a non-ASCII display-name edit still moves the slug (88 rows, 11
 * active), because the seal owns that case.
 *
 * THE HEADER OF THE MIGRATION QUOTES THE REMOVED DISJUNCT VERBATIM, so every
 * assertion here runs against comment-stripped SQL. A bare `toContain` over the
 * raw file is satisfied by the prose and stays green with the statement gone;
 * a bare `not.toContain` fails on correct code. `stripComments` is itself
 * covered by a positive control below.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99960101100200_tag_slug_does_not_follow_name.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Drop whole-line `--` comments. Explanatory prose must never satisfy an assertion. */
const stripComments = (s: string): string =>
  s
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

const sql = stripComments(raw);

/**
 * The CREATE OR REPLACE statements only -- everything above `do $verify$`.
 *
 * Scoping matters here and a first draft got it wrong: the verify block
 * legitimately contains the removed disjunct inside its own source check
 * (`position('OLD.name IS DISTINCT FROM NEW.name' in v_src)`), which is a
 * statement and survives comment stripping. Asserting over the whole file made
 * the `not.toContain` fail on correct code; asserting `toContain` over the
 * whole file for the early return would have passed with the function body
 * gutted, because the verify block quotes that string too.
 */
const fnSql = (() => {
  const end = sql.indexOf('do $verify$');
  expect(end).toBeGreaterThan(-1);
  return sql.slice(0, end);
})();

/** The body of the migration's `do $verify$ ... $verify$` block. */
const verifyBlock = (() => {
  const start = sql.indexOf('do $verify$');
  const end = sql.indexOf('$verify$;', start + 'do $verify$'.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
})();

describe('the comment stripper actually strips', () => {
  const isComment = (l: string) => l.trim().startsWith('--');

  it('removes every whole-line comment', () => {
    // Structural rather than anchored on a phrase: anchoring the control on
    // specific prose makes rewording a comment fail the suite, which is both
    // brittle and indistinguishable from a real regression.
    expect(raw.split('\n').some(isComment)).toBe(true);
    expect(sql.split('\n').some(isComment)).toBe(false);
  });

  it('keeps the removed disjunct out of the function bodies but not the file', () => {
    // The header quotes the disjunct verbatim and the verify block greps for
    // it. Both are correct; only the function body must be free of it.
    expect(raw).toContain('OLD.name IS DISTINCT FROM NEW.name');
    expect(fnSql).not.toContain('OLD.name IS DISTINCT FROM NEW.name');
  });
});

describe('normalize_tag_input no longer re-derives the slug from the name', () => {
  it('replaces the function', () => {
    expect(fnSql).toContain('CREATE OR REPLACE FUNCTION public.normalize_tag_input()');
  });

  it('drops the name-triggered disjunct from the executable body', () => {
    expect(fnSql).not.toContain('OLD.name IS DISTINCT FROM NEW.name');
  });

  it('derives a slug only when the statement leaves it absent or empty', () => {
    expect(fnSql).toContain("IF NEW.slug IS NULL OR NEW.slug = '' THEN");
    expect(fnSql).toContain('NEW.slug := public.normalize_tag_slug(NEW.name);');
  });

  it('keeps the existing slug otherwise', () => {
    expect(fnSql).toContain('NEW.slug := lower(NEW.slug);');
  });

  it('preserves the translate() literal byte for byte', () => {
    // `CREATE OR REPLACE` forces the whole body to be restated, so this line is
    // re-typed and is the transcription risk of the whole change. It maps
    // en-dash to a SPACE and em-dash to a HYPHEN -- a single wrong character
    // silently changes how every tag name is normalized.
    expect(fnSql).toContain(
      "NEW.name := translate(NEW.name, U&'\\2018\\2019\\201C\\201D\\2013\\2014', '''''\"\" - -');",
    );
  });

  it('preserves the control-character strip', () => {
    expect(fnSql).toContain(
      "NEW.name := btrim(regexp_replace(NEW.name, '[[:cntrl:]<>]', '', 'g'));",
    );
  });
});

describe('unified_tags_normalize_slug leaves an unwritten slug alone', () => {
  it('replaces the function', () => {
    expect(fnSql).toContain('CREATE OR REPLACE FUNCTION public.unified_tags_normalize_slug()');
  });

  it('early-returns on an UPDATE that does not write the slug', () => {
    // All three conjuncts matter: without the TG_OP guard an INSERT would skip
    // derivation; without the NOT NULL/non-empty tail a row could early-return
    // holding an empty slug and never reach the sha1 fallback.
    // ELSIF, not IF: the seal owns the branch above it. `toContain("IF TG_OP")`
    // passes on either spelling, so the ELSIF is pinned explicitly.
    expect(fnSql).toContain("ELSIF TG_OP = 'UPDATE'");
    expect(fnSql).toContain('AND NEW.slug IS NOT DISTINCT FROM OLD.slug');
    expect(fnSql).toContain("AND NEW.slug IS NOT NULL AND NEW.slug <> ''");
  });

  it('keeps the non-ASCII seal as the FIRST branch, above this rule', () => {
    const guard = fnSql.indexOf('NEW.slug IS NOT DISTINCT FROM OLD.slug');
    const nonAscii = fnSql.indexOf("NEW.name ~ '[^\\x00-\\x7F]'");
    const fallback = fnSql.indexOf(
      "encode(digest(coalesce(NEW.name, NEW.id::text), 'sha1'), 'hex')",
    );
    expect(guard).toBeGreaterThan(-1);
    expect(nonAscii).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(-1);
    // Both branches exist in either order, so presence proves nothing and only
    // the offsets do. Swapping them is a silent regression of the seal: the
    // re-upsert path has NEW.slug = OLD.slug, so this rule would swallow it.
    expect(nonAscii).toBeLessThan(guard);
    expect(guard).toBeLessThan(fallback);
  });

  it('keeps the non-ASCII arm for statements that DO write a slug', () => {
    expect(fnSql).toContain('NEW.slug := normalize_tag_slug(NEW.name);');
    expect(fnSql).toContain('NEW.slug := normalize_tag_slug(coalesce(NEW.slug, NEW.name));');
  });

  it('keeps the empty-slug sha1 fallback', () => {
    expect(fnSql).toContain(
      "NEW.slug := encode(digest(coalesce(NEW.name, NEW.id::text), 'sha1'), 'hex');",
    );
  });
});

describe('the migration proves its own behaviour before it is trusted', () => {
  it('asserts an INSERT still derives the slug from the name', () => {
    expect(verifyBlock).toContain("'%P1=zzz-slug-probe-alpha|%'");
  });

  it('asserts a name-only edit does NOT move the slug', () => {
    // The name changed and the slug did not: both halves are in the one probe,
    // so an assertion that only checked the slug would pass on a no-op update.
    expect(verifyBlock).toContain("'%P2=Zzz Slug Probe Beta/zzz-slug-probe-alpha|%'");
  });

  it('asserts an explicit slug write still moves it AND still mints a redirect', () => {
    expect(verifyBlock).toContain("'%P3=zzz-slug-probe-beta/1|%'");
  });

  it('asserts the seal still owns a non-ASCII name, in both directions', () => {
    // P4a: the INSERT derive. P4b: a name-ONLY edit (NEW.slug = OLD.slug) still
    // re-derives -- the exact shape a pre-empting early return swallows, so
    // reading `gamma` here would mean source-tags-extract rows never heal.
    // P7: the seal still beats a caller-supplied slug, the weekly upsert path.
    expect(verifyBlock).toContain("'%P4a=zzz-probe-gamma|%'");
    expect(verifyBlock).toContain("'%P4b=zzz-probe-delta|%'");
    expect(verifyBlock).toContain("'%P7=zzz-probe-delta|%'");
  });

  it("asserts slug = '' remains the explicit re-derive escape hatch", () => {
    expect(verifyBlock).toContain("'%P5=zzz-slug-probe-epsilon|%'");
  });

  it('asserts name normalization did not drift while the body was restated', () => {
    // End of the pipeline, not translate()'s output: unified_tags_normalize_name
    // fires last and title-cases the result. A first draft asserted the
    // lowercase pre-title-case form and failed against correct code.
    expect(verifyBlock).toContain("'%P6=Zzz A''b''c\"D\"E F-G%'");
  });

  it('checks the source, not only the behaviour', () => {
    // Behaviour alone would pass if the disjunct were restored behind a
    // condition the six probes happen not to exercise.
    expect(verifyBlock).toContain("position('OLD.name IS DISTINCT FROM NEW.name' in v_src) > 0");
    expect(verifyBlock).toContain(
      "position('NEW.slug IS NOT DISTINCT FROM OLD.slug' in v_src) = 0",
    );
    // The migration must also assert the seal is still evaluated first, by
    // OFFSET -- presence of both branches is satisfied by either order.
    expect(verifyBlock).toContain('the non-ASCII seal is no longer the first branch');
  });

  it('refuses a silent no-op if the probes produce nothing', () => {
    // The probes run in a subtransaction and are recovered from sqlerrm. If
    // that plumbing broke, every `not like` below would pass against an empty
    // string and the block would report success having checked nothing.
    expect(verifyBlock).toContain("if v_probe is null or v_probe = '' then");
    expect(verifyBlock).toContain('probes produced no observations');
  });

  it('re-raises anything that is not its own probe signal', () => {
    expect(verifyBlock).toContain("if sqlerrm not like 'TAGSLUGPROBE %' then");
    expect(verifyBlock).toContain('raise;');
  });

  it('cannot be neutered by short-circuiting a postcondition', () => {
    // `where false and ...` / `if false then` leaves every string-anchored
    // assertion above intact while the check stops checking.
    expect(verifyBlock).not.toMatch(/\bfalse\b/);
    const conditions = verifyBlock.match(/if v_probe not like /g) ?? [];
    expect(conditions).toHaveLength(8);
  });

  it('writes no data of its own', () => {
    // Every probe write lives inside the rolled-back subtransaction. A stray
    // top-level write would persist on apply.
    const afterVerify = sql.slice(sql.indexOf('$verify$;'));
    expect(afterVerify).not.toMatch(/\b(insert|update|delete)\s+/i);
  });
});
