import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `city-agentic-enrich` review-gates `lgbt_friendly_rating` behind a
 * "MUST be cited" rule, and three separate defects made that rule vacuous.
 * All three were measured on prod against the 14 rows open on 2026-10-01 at
 * /admin/governance?mode=triage&queue=quality-city.
 *
 * (1) THE GATE COUNTED THE WRONG SET. `ratingValid` required
 *     `citations.length > 0` — ANY citation, for ANY field — while the proposal
 *     carried only `citations.filter(field === 'lgbt_friendly_rating')`. So a
 *     rating could be queued with an EMPTY cite list while the gate read as
 *     satisfied.
 *
 * (2) THE QUEUE INSERT FELL BACK TO ANOTHER FIELD'S EVIDENCE.
 *     `citations: g.cite.length ? g.cite : citations` meant a field with no
 *     citation of its own displayed somebody else's. All 6 open `editorial_hook`
 *     rows and the one `best_time_to_visit` row ("January to August", Da Nang)
 *     showed an ILGA equality-score quote as their basis — an equality score
 *     offered as the source for a travel-timing claim. A reviewer cannot tell
 *     that apart from a real citation.
 *
 * (3) THE CITATION WAS OUR OWN DATA. `safetyContext` is built from
 *     `countries.equality_score` — computed by `_shared/equality-score.ts`,
 *     published by nobody — and the model hands it back as a verbatim `quote`
 *     attributed to ilga.org. 245 of 383 APPROVED rating rows quote an
 *     `equality_score=` string; 180 are attributed to ilga.org.
 *
 * Asserted against COMMENT-STRIPPED source. The fix's own comments quote every
 * removed expression verbatim in order to explain it, so an unstripped check
 * passes on the prose with the executable line reverted — the trap CLAUDE.md
 * records seven times. The comment-only control at the bottom proves the
 * stripper is load-bearing rather than decorative.
 */

const RAW = readFileSync(
  join(process.cwd(), 'supabase', 'functions', 'city-agentic-enrich', 'index.ts'),
  'utf8',
);

/** Drop `//` line comments and `/* *\/` blocks, keeping line structure. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const code = stripComments(RAW);

describe('city-agentic-enrich citation scoping', () => {
  it('has executable code to test against', () => {
    // Guards every assertion below: an empty slice makes them all vacuous, and
    // a stripper that ate the whole file would otherwise read as a clean pass.
    expect(code).toContain('const gatedProposals');
    expect(code).toContain("from('city_review_queue')");
    expect(code.length).toBeGreaterThan(5000);
  });

  // --- (1) the rating gate reads its OWN citation set -----------------------
  it('gates the rating on a rating-scoped citation, not on any citation', () => {
    expect(code).toMatch(/ratingCite\.length > 0/);
    // The defect verbatim. `citations.length` must not gate the rating again.
    expect(code).not.toMatch(/&&\s*citations\.length > 0/);
  });

  it('builds the rating proposal from the same set it gated on', () => {
    // Two expressions that are supposed to be the same set must BE the same
    // binding — computing the filter twice is how they drifted apart.
    const ratingPush = code.slice(
      code.indexOf("field: 'lgbt_friendly_rating'"),
      code.indexOf("field: 'lgbt_friendly_rating'") + 260,
    );
    expect(ratingPush).toContain('cite: ratingCite');
    expect(ratingPush).not.toContain('citations.filter');
  });

  // --- (2) no proposal shows another field's evidence -----------------------
  it('inserts each proposal with its own citations and no fallback', () => {
    expect(code).toMatch(/citations: g\.cite,/);
    // The defect verbatim.
    expect(code).not.toMatch(/g\.cite\.length \? g\.cite : citations/);
  });

  it('routes every gated field through the one scoped helper', () => {
    // Asserted by COUNT, not presence: the helper is used three times (rating,
    // hook, best_time_to_visit) and a surviving hand-rolled `citations.filter`
    // at any one call site satisfies a bare presence check while that field
    // keeps the unscoped behaviour.
    // Exactly 3, not 4: the definition is `const citeFor = (...names) =>`, which
    // carries no `citeFor(`, so every match here is a real call site.
    expect(code.match(/citeFor\(/g) ?? []).toHaveLength(3);
    expect(code).toMatch(/const citeFor = \(\.\.\.names/);
    expect(code.match(/citations\.filter/g) ?? []).toHaveLength(1); // only inside citeFor
  });

  // --- (3) our own injected context is not evidence ------------------------
  it('refuses a citation that quotes our own safetyContext', () => {
    expect(code).toContain('const selfQuote');
    expect(code).toMatch(/equality_score=/);
    // The filter must actually be applied, not merely defined.
    expect(code).toMatch(/!selfQuote\(x\)/);
  });

  it('builds safetyContext from our own equality_score, which is why (3) is detectable', () => {
    // If this stops being true the selfQuote test above is checking a string we
    // no longer inject, and would pass while detecting nothing.
    expect(code).toMatch(/safetyContext = `\$\{co\.name\}: equality_score=/);
  });

  // --- control --------------------------------------------------------------
  it('the comment stripper is load-bearing', () => {
    // Every defect string this file bans is quoted VERBATIM in the fix's own
    // comments to explain it. If the stripper ever stopped working, the bans
    // would match the prose and pass with the fix reverted.
    expect(RAW).toContain('g.cite.length ? g.cite : citations');
    expect(code).not.toContain('g.cite.length ? g.cite : citations');
  });
});
