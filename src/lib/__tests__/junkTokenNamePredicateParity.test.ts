/**
 * The junk-token name rule exists TWICE and must mean the same thing in both.
 *
 *   - TypeScript, `supabase/functions/_shared/tag-name-quality.ts`, gating the
 *     MINT path in `pipeline-validate` so the cohort cannot be re-created.
 *   - SQL, inside `tag_hygiene_stats().junk_token_name_active`, watching for a
 *     row that slipped past the gate.
 *
 * Two implementations in two languages cannot share code, so they share this
 * test — the `venueCategories.ts` / `deathPenaltyRiskSqlParity` pattern.
 *
 * It asserts the RULES agree, not byte equality: the gate reads a staged name
 * before normalization (so a lower-case `gb` must reject) while the counter
 * reads the stored, title-cased name. Those are deliberately different inputs
 * to the same decision.
 *
 * The SQL side is located by scanning `supabase/migrations/` for the LATEST
 * file that defines the arm, rather than pinning a filename — pinning is what
 * makes a drift test silently stop covering a function that was patched again.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  isJunkTokenTagName,
  JUNK_TOKEN_STOPWORDS,
} from '../../../supabase/functions/_shared/tag-name-quality';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

/** The newest migration that defines the counter arm, comments stripped. */
function latestCounterArm(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const f of files) {
    const raw = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (!raw.includes("'junk_token_name_active', (")) continue;
    const sql = raw
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    const start = sql.indexOf("'junk_token_name_active', (");
    expect(start, `${f} names the counter only in prose`).toBeGreaterThan(0);
    return sql.slice(start, start + 600);
  }
  throw new Error('no migration defines junk_token_name_active');
}

const arm = latestCounterArm();

/**
 * The whole counter migration, comments stripped, for the patch-hygiene checks
 * below. Stripping is not optional here: that file's header explains the
 * raw-vs-stripped split in prose and quotes `regexp_replace`, `src` and `bare`
 * verbatim, so an unstripped scan is satisfied by the explanation while the
 * executable line is gone.
 */
function counterMigrationStatements(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const f of files) {
    const raw = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (!raw.includes("'junk_token_name_active', (")) continue;
    const sql = raw
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    // Statements only: the file's own `do $verify$` block legitimately greps
    // for the same symbols, so asserting over the whole file would pass with
    // the patch block rewritten.
    const end = sql.indexOf('do $verify$');
    expect(end, `${f} has no verify block to bound the statements at`).toBeGreaterThan(0);
    return sql.slice(0, end);
  }
  throw new Error('no migration defines junk_token_name_active');
}

const patch = counterMigrationStatements();

describe('counter patch — raw body for execute, stripped copy for the asserts', () => {
  // scripts/check-functiondef-asserts.mjs failed this PR for asserting on an
  // unstripped pg_get_functiondef(). The fix is NOT "strip everything": the
  // patch re-EXECUTEs the body it read, so a stripped `src` would delete every
  // comment from the live function. Both halves are asserted, because either
  // one alone is a different defect.

  it('fetches the stripped copy inline, which is what the CI gate recognises', () => {
    // The gate looks for `regexp_replace(pg_get_functiondef` adjacent in a
    // window around the call; a later `bare := regexp_replace(src, ...)` is
    // correct SQL and does NOT satisfy it, so the shape matters.
    expect(patch).toMatch(/regexp_replace\(\s*pg_get_functiondef\(p\.oid\)/);
    expect(patch).toContain("'--[^' || chr(10) || ']*'");
    expect(patch).toContain('into src, bare');
  });

  it('derives the executed body from the RAW copy, never the stripped one', () => {
    // This is the half that keeps 99991789930597's and 99991790719601's
    // reasoning in the live function body.
    expect(patch).toContain('newsrc := replace(src, anchor, frag || anchor)');
    expect(patch).toContain('execute newsrc');
    expect(patch).not.toMatch(/replace\(\s*bare\b/);
    expect(patch).not.toMatch(/execute\s+bare\b/);
  });

  it('reads `bare` for every structural position() assert', () => {
    // A comment can otherwise satisfy a missing-code check — and this file
    // INSERTS a comment, so the body acquires prose in exactly that region.
    expect(patch).toContain("position('junk_token_name_active' in bare)");
    expect(patch).toContain("position(E'  active as (\\n    select * from ut' in bare)");
    const srcPositions = patch.match(/position\([^)]*\bin src\)/g) ?? [];
    expect(srcPositions, 'a structural assert still reads the raw body').toEqual([]);
  });

  it('counts the anchor on `src`, because that is the string replace() rewrites', () => {
    // The one place the split inverts. A count over `bare` would describe a
    // different string than the one being modified.
    expect(patch).toContain(
      "n := (length(src) - length(replace(src, anchor, ''))) / length(anchor)",
    );
    expect(patch).not.toMatch(/length\(\s*bare\s*\)\s*-\s*length\(replace\(\s*bare/);
  });

  // DELIBERATELY NOT ASSERTED: that the patch aborts when raw == stripped.
  // A first draft of this suite demanded it and failed against correct code,
  // which is the assertion being live rather than the file being wrong. The
  // check is also disproportionate: a body with no comments makes the stripped
  // copy merely unhelpful, not unsafe — every `in bare` assert then reads
  // exactly what `in src` would — so aborting the patch over it would block the
  // counter for a cosmetic reason. Whether the patch WORKED is covered by that
  // file's own P1-P7, which run against the live function after the execute.
});

describe('the mint gate has a written explanation', () => {
  // check-explanation-keys.mjs fails the PR that introduces a code, because
  // the inspector's humanize() renders an unexplained key as prettified prose
  // that READS AS CONTENT — indistinguishable from one that was explained.
  const seed = (() => {
    for (const f of readdirSync(MIGRATIONS)
      .filter((x) => x.endsWith('.sql'))
      .sort()
      .reverse()) {
      const raw = readFileSync(join(MIGRATIONS, f), 'utf8');
      if (raw.includes("('pipeline-validate:E_JUNK_TOKEN_NAME',")) return raw;
    }
    throw new Error('no migration seeds pipeline-validate:E_JUNK_TOKEN_NAME');
  })();

  it('seeds the key the validator emits, spelled identically', () => {
    expect(seed).toContain("('pipeline-validate:E_JUNK_TOKEN_NAME',");
    expect(seed).toContain('insert into public.pipeline_explanations');
  });

  it('is blocking, which an E_ prefix requires corpus-wide', () => {
    // 99991790358904's verify block asserts this over the WHOLE
    // pipeline-validate namespace, so a mismatch aborts db push for the repo
    // rather than for this file.
    expect(seed).toMatch(/'blocking'\s*\)\s*\n\s*on conflict \(key\) do nothing/);
  });

  it('does not clobber a human rewrite on a re-run', () => {
    expect(seed).toContain('on conflict (key) do nothing');
    expect(seed).not.toMatch(/on conflict \(key\) do update/);
  });
});

describe('junk token predicate — the three rules exist on both sides', () => {
  it('SQL: a single letter', () => {
    expect(arm).toContain("name ~ '^[A-Za-z]$'");
  });

  it('SQL: two letters that are NOT an all-caps acronym', () => {
    expect(arm).toContain("name ~ '^[A-Za-z]{2}$'");
    // Without the case test, TV (662 uses) and DJ (52) would be counted.
    expect(arm).toContain('name <> upper(name)');
  });

  it('SQL: the stopword list matches the TypeScript one exactly', () => {
    // Start AFTER the ` in (` that opens the list: `btrim(name)` contributes a
    // `)` of its own, so slicing to the first `)` from the match start cuts
    // before the list and silently compares an EMPTY set — which passes against
    // an empty TS list too, so this would have been a vacuous assertion.
    const open = arm.indexOf('lower(btrim(name)) in (') + 'lower(btrim(name)) in ('.length;
    const inList = arm.slice(open, arm.indexOf(')', open));
    const quoted = (inList.match(/'[a-z]+'/g) ?? []).map((s) => s.replace(/'/g, ''));
    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.sort()).toEqual([...JUNK_TOKEN_STOPWORDS].sort());
  });

  it('SQL: excludes entity_kind=attribute, or the size facets are counted', () => {
    // `L`, `M` and `S` ARE single letters, at ~20,000 uses each.
    expect(arm).toContain("entity_kind::text is distinct from 'attribute'");
  });

  it('SQL: does not count a bare number', () => {
    // 369 and 469 carry real definitions; 2C-B and 24-Hour are real terms.
    expect(arm).not.toMatch(/\[0-9\]|\\d/);
  });

  it('SQL: does not condition on missing prose', () => {
    // A, R and B all carry prose — about the alphabet — so a no-prose
    // condition would make the counter read zero while all three were live.
    expect(arm).not.toMatch(/tag_has_prose|description/);
  });
});

describe('junk token predicate — TypeScript behaviour', () => {
  it.each(['a', 'A', 'r', 'R', 'b', 'B'])('rejects the bare letter %s', (n) => {
    expect(isJunkTokenTagName(n)).toBe(true);
  });

  it.each([
    'gb',
    'Gb',
    'gB',
    'us',
    'Us',
    'no',
    'No',
    'nz',
    'es',
    'it',
    'de',
    'cz',
    'tw',
    'lu',
    'ng',
    'mk',
    'mu',
    'pe',
    'uk',
  ])('rejects the locale code %s, in whatever case it was staged', (n) => {
    expect(isJunkTokenTagName(n)).toBe(true);
  });

  it.each(['all', 'All', 'ALL', 'other', 'Other', 'none', 'various', 'misc'])(
    'rejects the filter label %s',
    (n) => {
      expect(isJunkTokenTagName(n)).toBe(true);
    },
  );

  // THE POSITIVE CONTROLS. These are the whole reason the rule is "two letters
  // and not all-caps" rather than "two letters": a gate that rejects them costs
  // real vocabulary, which is the expensive direction of this error.
  it.each(['TV', 'DJ', 'HIV', 'BDSM', 'U=U'])('accepts the real acronym %s', (n) => {
    expect(isJunkTokenTagName(n)).toBe(false);
  });

  it.each(['369', '469', '69', '2C-B', '3-MMC', '24-Hour', '80s-Themed', 'Over 30'])(
    'accepts %s — a bare number is not a junk signal',
    (n) => {
      expect(isJunkTokenTagName(n)).toBe(false);
    },
  );

  it.each(['Queer', 'Gay', 'Drag', 'Coming Out', 'LGBTIQ+', 'Activist'])(
    'accepts the ordinary term %s',
    (n) => {
      expect(isJunkTokenTagName(n)).toBe(false);
    },
  );

  it('leaves an empty name to E_MISSING_NAME rather than claiming it', () => {
    // Two codes for one defect is the W_DESCRIPTION_THIN duplication this
    // validator already carries a comment about.
    expect(isJunkTokenTagName('')).toBe(false);
    expect(isJunkTokenTagName('   ')).toBe(false);
  });

  it('judges the trimmed name, so whitespace cannot smuggle a token through', () => {
    expect(isJunkTokenTagName('  gb  ')).toBe(true);
    expect(isJunkTokenTagName(' All ')).toBe(true);
  });
});

describe('junk token predicate — the mint gate is wired to it', () => {
  const validator = readFileSync(
    join(process.cwd(), 'supabase/functions/pipeline-validate/index.ts'),
    'utf8',
  );

  it('pipeline-validate imports the shared predicate rather than restating it', () => {
    expect(validator).toContain("from '../_shared/tag-name-quality.ts'");
    expect(validator).toContain('isJunkTokenTagName');
  });

  it('gates on target_table, so only glossary rows are judged by it', () => {
    expect(validator).toContain("item.target_table === 'unified_tags' && isJunkTokenTagName(name)");
  });

  it('pushes an ERROR, which is what makes the row rejected rather than approved', () => {
    // A warning would leave it approved at confidence 0.95 and still commit.
    expect(validator).toContain("errors.push('E_JUNK_TOKEN_NAME')");
  });
});
