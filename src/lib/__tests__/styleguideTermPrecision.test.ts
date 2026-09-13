import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Six styleguide terms were corrected by RUNNING the standard against the
 * corpus for the first time. Each is a measured count, not an opinion:
 *
 *   gay friendly   stored space-only; 64 hyphen / 0 space in live copy
 *   a transgender  all 9 hits are the correct ADJECTIVE ("a transgender woman")
 *   ethnic         26 hits, all "ethnic group/minority/majority"
 *   lifestyle      34 hits, overwhelmingly the kink community's own word
 *   minorities     10 hits, "sexual minorities" / "racial and ethnic minorities"
 *   urban area     158 hits, all the geographic unit; 22% of the drift baseline
 *
 * Asserted against COMMENT-STRIPPED SQL: the migration header names every one
 * of these phrases, so an unstripped check would pass on the prose with the
 * UPDATEs deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const precision = stripComments(
  readFileSync(join(MIGRATIONS, '20470922084600_styleguide_term_precision.sql'), 'utf8'),
);

/**
 * Only the `avoid = ARRAY[...]` assignments — the vocabulary the standard
 * actually publishes. The postconditions at the end of the migration have to
 * NAME the bare strings in order to assert they are gone, so scanning the whole
 * file for their absence would fail on the very check that guarantees it.
 */
const avoidArrays = [...precision.matchAll(/avoid\s*=\s*ARRAY\[([\s\S]*?)\]/gi)]
  .map((m) => m[1])
  .join('\n');

const drift = stripComments(
  readFileSync(join(MIGRATIONS, '20470922084700_styleguide_content_drift.sql'), 'utf8'),
);

describe('styleguide term precision', () => {
  it('covers both spellings of gay-/queer-friendly', () => {
    // Against the published vocabulary, not the file: the postcondition also
    // names 'gay-friendly' (it asserts the prompt contains it), so an unscoped
    // check stays green when the entry is dropped from the ARRAY.
    expect(avoidArrays).toContain("'gay friendly'");
    expect(avoidArrays).toContain("'gay-friendly'");
    expect(avoidArrays).toContain("'queer friendly'");
    expect(avoidArrays).toContain("'queer-friendly'");
  });

  it('targets the transgender noun, not the adjective', () => {
    expect(avoidArrays).toContain("'a transgender (as a noun)'");
    // The bare form must be gone: it matches "a transgender woman", which is
    // the spelling this same term recommends.
    expect(avoidArrays).not.toMatch(/'a transgender'/);
  });

  it('narrows the bare words to the senses that are actually wrong', () => {
    expect(avoidArrays.length).toBeGreaterThan(0);
    for (const bare of ["'ethnic'", "'lifestyle'", "'minorities'", "'urban area'"]) {
      expect(avoidArrays).not.toContain(bare);
    }
    expect(avoidArrays).toContain("'ethnic food'");
    expect(avoidArrays).toContain("'alternative lifestyle'");
    expect(avoidArrays).toContain("'urban crowd'");
  });

  it('keeps every sense the narrowing was not meant to drop', () => {
    for (const kept of [
      "'gay lifestyle'",
      "'chosen lifestyle'",
      "'non-white'",
      "'exotic'",
      "'oriental'",
      "'sketchy neighbourhood'",
    ]) {
      expect(precision).toContain(kept);
    }
  });

  it('republishes, because an unpublished edit changes nothing for any consumer', () => {
    expect(precision).toMatch(/_styleguide_publish_core\(\s*\n?\s*'minor'/);
    expect(precision).toMatch(/unpublished_drift/);
  });

  it('asserts the new spelling actually reached the compiled prompt', () => {
    expect(precision).toMatch(/position\('gay-friendly' in v_prompt\)\s*=\s*0/);
    expect(precision).toMatch(/position\('queer-friendly' in v_prompt\)\s*=\s*0/);
  });

  it('re-checks the fence and the non-negotiables after republishing', () => {
    expect(precision).toMatch(/fence_begin_count/);
    expect(precision).toMatch(/has_non_negotiables/);
    expect(precision).toMatch(/empty_wrapper_artifacts/);
  });
});

describe('styleguide content drift sentinel', () => {
  it('reports what it scanned separately from what it found', () => {
    // An empty corpus, an unreadable vocabulary and a clean corpus otherwise
    // all return the same reassuring zero.
    //
    // Scoped to the FINAL return: these keys also appear in the early-out branch
    // and in the postcondition, so an unscoped check stays green when the real
    // payload stops carrying them.
    const returns = [...drift.matchAll(/RETURN jsonb_build_object\(([\s\S]*?)\);/gi)].map(
      (m) => m[1],
    );
    expect(returns.length).toBeGreaterThanOrEqual(2);
    const final = returns[returns.length - 1];
    for (const key of ["'phrases_active'", "'rows_scanned'", "'total_flagged'", "'by_surface'"]) {
      expect(final).toContain(key);
    }
  });

  it('fails when the probe scanned nothing', () => {
    expect(drift).toMatch(/scanned 0 rows/i);
    expect(drift).toMatch(/RAISE EXCEPTION/);
  });

  it('cannot be used to retire a term behind the exclusion list', () => {
    // The scanner skips 'it', 'clean' and 'accessible' because they are useless
    // to a matcher. The migration asserts all three still exist as guidance, so
    // the exclusion list cannot become a back door for deleting a term.
    expect(drift).toMatch(/lower\(a\) IN \('it','clean','accessible'\)/);
    expect(drift).toMatch(/v_n <> 3/);
    expect(drift).toMatch(/removed behind the exclusion list/i);
  });

  it('carries a positive control against a corpus known to be non-clean', () => {
    expect(drift).toMatch(/total_flagged'\)::int,0\) = 0/);
    expect(drift).toMatch(/matcher is broken/i);
  });

  it('is service_role only — it reads every own-voice row', () => {
    expect(drift).toMatch(
      /REVOKE ALL ON FUNCTION public\.styleguide_content_drift\(\) FROM PUBLIC, anon, authenticated/,
    );
    expect(drift).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.styleguide_content_drift\(\) TO service_role/,
    );
  });

  it('excludes editorial annotations from the literal scan', () => {
    // "barebacking (in our own voice)" is guidance, not a string to match.
    expect(drift).toMatch(/a NOT LIKE '%\(%'/);
  });
});

describe('the health script consumes the sentinel', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');

  it('calls the drift RPC', () => {
    expect(script).toContain('rpc/styleguide_content_drift');
  });

  it('hard-fails on a broken probe but only reports the backlog', () => {
    expect(script).toMatch(/scanned === 0 \|\| phrases === 0/);
    expect(script).toMatch(/content-drift probe is broken/);
    // The counts themselves must not set FAILED — known editorial debt is depth.
    const block = script.slice(script.indexOf('rpc/styleguide_content_drift'));
    const reported = block.slice(block.indexOf('const total'), block.indexOf('most common'));
    expect(reported).not.toContain('FAILED = true');
  });

  it('says so when the RPC is missing instead of passing silently', () => {
    expect(script).toMatch(/styleguide_content_drift → HTTP/);
    expect(script).toMatch(/measured NOTHING/);
  });
});
