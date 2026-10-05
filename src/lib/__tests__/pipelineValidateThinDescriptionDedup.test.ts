/**
 * `pipeline-validate` routes an event row to a human at `warnings.length >=
 * warnReview`, and that count is unweighted — so a condition counted twice
 * costs two of the three warnings it takes to park a row in front of a
 * reviewer.
 *
 * Two codes fired on one condition. The source contract emits
 * `W_DESCRIPTION_MISSING_OR_THIN` below 20 characters and rides in on
 * `metadata.source_contract`, where `pipeline-validate` merges it into the
 * same array it then pushes its own `W_DESCRIPTION_THIN` onto below 30. The
 * first condition is a strict SUBSET of the second, so every row the contract
 * flagged was flagged again. The `new Set()` at the end of the branch cannot
 * collapse them: they are two different strings, not one repeated.
 *
 * Measured on prod 2026-10-04 over `ingestion_staging`: 814 event rows carry
 * both codes and ZERO carry the contract code alone — the subset relation
 * visible in the data, not argued from the source — with 18 of them parked at
 * `pending_review`.
 *
 * These assertions read the two edge-function sources with comments STRIPPED,
 * because the fix's own comment names both codes verbatim: a bare `toContain`
 * over the raw file would match the explanation and pass with the guard
 * deleted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const VALIDATE = stripComments(
  readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'pipeline-validate', 'index.ts'),
    'utf8',
  ),
);
const CONTRACT = stripComments(
  readFileSync(
    join(process.cwd(), 'supabase', 'functions', '_shared', 'event-source-contract.ts'),
    'utf8',
  ),
);

const CONTRACT_CODE = 'W_DESCRIPTION_MISSING_OR_THIN';
const VALIDATE_CODE = 'W_DESCRIPTION_THIN';

describe('pipeline-validate thin-description dedup', () => {
  it('has executable code left after stripping comments', () => {
    // Guards every assertion below. A stripper that ate the file, or a renamed
    // path, makes the rest of this suite vacuous while reporting a clean pass.
    expect(VALIDATE).toContain("} else if (validator === 'event') {");
    expect(CONTRACT).toContain('export function validateEventSourceContract');
  });

  it('still merges the contract warnings into the same array', () => {
    // The whole defect depends on this merge, and so does the guard: if the
    // contract warnings stop arriving here, the skip below guards nothing and
    // `W_DESCRIPTION_THIN` is the only code again — at which point skipping it
    // would silently drop the warning entirely rather than dedup it.
    expect(VALIDATE).toContain('warnings.push(...contractWarnings)');
    expect(CONTRACT).toContain(`warnings.push('${CONTRACT_CODE}')`);
  });

  it('pushes W_DESCRIPTION_THIN exactly once, and only behind the contract check', () => {
    const pushes = VALIDATE.split('\n').filter((line) => line.includes(`'${VALIDATE_CODE}'`));
    // Exactly one, so a second unguarded push cannot be added beside the
    // guarded one and leave the double count intact.
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toContain(`!contractFlaggedThinDescription`);
    expect(VALIDATE).toContain(
      `const contractFlaggedThinDescription = contractWarnings.includes('${CONTRACT_CODE}')`,
    );
  });

  it('leaves the sibling location warning ungated — the stripper is not eating guards', () => {
    // Positive control, and the honest scope of this change. `W_NO_GEO` is a
    // separate condition from the contract's `W_LOCATION_MISSING` (a row with
    // a venue_id but no city, country or coordinates gets only the contract
    // code), so the two are NOT nested and are deliberately not deduped here.
    // Measured 2026-10-04: 245 rows carry both and every one is already
    // `ai_validation_status='rejected'`, where errors decide the routing and
    // the warning count is inert.
    const geo = VALIDATE.split('\n').filter((line) => line.includes("warnings.push('W_NO_GEO')"));
    expect(geo).toHaveLength(1);
    expect(geo[0]).not.toContain('contractFlagged');
  });

  it("keeps the contract's bound strictly below validate's, so the subset relation holds", () => {
    // This is the invariant the skip rests on. Raise the contract's 20 above
    // validate's 30 and the conditions stop nesting: a 25-character
    // description would then carry the contract code while failing validate's
    // own test, and skipping would discard a warning instead of deduping one.
    const contractBound = CONTRACT.match(/item\.description\.trim\(\)\.length\s*<\s*(\d+)/);
    const validateBound = VALIDATE.match(/desc\.length\s*<\s*(\d+)/);
    expect(contractBound).not.toBeNull();
    expect(validateBound).not.toBeNull();
    expect(Number(contractBound![1])).toBeLessThan(Number(validateBound![1]));
  });

  it('does not lower warnReview — the threshold is not the defect', () => {
    // The double count was. The threshold is also caller-supplied (the
    // gaycities drain scripts pass 6), so a lower default would not be
    // reliable even if it were right.
    expect(VALIDATE).toContain('body.warn_review_threshold ?? 3');
  });
});
