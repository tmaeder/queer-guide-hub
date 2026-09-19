import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99970101100000_event_city_match_namesake_repair.sql';
const DIR = join(process.cwd(), 'supabase', 'migrations');

const raw = readFileSync(join(DIR, MIGRATION), 'utf8');

/**
 * The migration's own header quotes the defect verbatim, so a `toContain` over the whole
 * file passes against a gutted statement. Every assertion below runs over comment-stripped
 * source, and the ones about a single statement are scoped to that statement.
 */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** the body of the `do $verify$ ... $verify$` block, where the postconditions live */
const verifyBlock = (() => {
  const m = statements.match(/do \$verify\$([\s\S]*?)\$verify\$/);
  if (!m) throw new Error('verify block not found');
  return m[1];
})();

describe('event-city-match namesake repair', () => {
  it('is present and above the live migration ceiling at authoring time', () => {
    const versions = readdirSync(DIR)
      .map((f) => f.match(/^(\d{14})_/)?.[1])
      .filter((v): v is string => Boolean(v));
    expect(versions).toContain('99970101100000');
    // It must sort above every version that was already applied when this was authored.
    // Asserting it is the GLOBAL maximum is wrong -- a sibling migration shipping in the
    // same change correctly sorts above it -- and that over-strict form failed the moment
    // 99970101100100 landed beside it.
    const CEILING_AT_AUTHORING = '99950101100000';
    expect('99970101100000' > CEILING_AT_AUTHORING).toBe(true);
    expect(versions.filter((v) => v <= CEILING_AT_AUTHORING && v === '99970101100000')).toEqual([]);
  });

  it('selects the cohort with a PREFIX match, never equality', () => {
    // `= 'event-city-match'` silently drops every row promoted to
    // 'event-city-match|promoted-2026-06-06', which is where Derby and Elstree live.
    expect(statements).toMatch(/data_source\s+like\s+'event-city-match%'/);
    expect(statements).not.toMatch(/data_source\s*=\s*'event-city-match'/);
  });

  it('corrects exactly the six class-A rows to their resolved Wikidata coordinates', () => {
    const pairs: Array<[string, string]> = [
      ['106ad24f-7e81-4ecd-854f-21fecc465585', 'Q2280322'], // Banstead
      ['e50651b5-7b81-403e-b922-258be1ed5711', 'Q746681'], // Egham
      ['968ad3fb-d0cb-4b79-a1eb-e0084c61aa04', 'Q646980'], // Aldershot
      ['3276d78f-f3a0-4874-a62b-08d4a18d0060', 'Q964785'], // Whitstable
      ['6d9f81a9-bee3-4980-bfa6-a6ff42172308', 'Q353089'], // Addison TX
      ['85ced89c-da59-4e8a-a346-4e625ab325b3', 'Q19931'], // Elstree
    ];
    for (const [id, qid] of pairs) {
      expect(statements).toContain(id);
      expect(statements).toContain(qid);
    }
  });

  it('never repoints College Park or Derby — it unlinks their events instead', () => {
    // Both rows are legitimately where they are; the EVENT is what was misfiled.
    // Repointing either would recreate this migration's own defect in the other direction.
    const collegeParkMd = '43f48339-2eb4-4def-811c-5bd8b235929d';
    const derbyCt = 'dd4e3e3e-9018-4505-8ece-ada04f084acc';

    // Scope to the WHOLE class-A statement including its `with fix(...)` CTE, because the
    // ids live in the CTE's VALUES list, which sits BEFORE `update cities c`. A regex
    // anchored on `update cities c` alone matched neither id and passed against a repoint.
    const classA = statements.match(/with fix\(id, qid, lat, lon, cc\)[\s\S]*?> 100000;/);
    expect(classA).not.toBeNull();
    expect(classA![0]).not.toContain(collegeParkMd);
    expect(classA![0]).not.toContain(derbyCt);

    // and they appear only as the *source* the events are unlinked FROM
    expect(statements).toContain('city_id = null');
    expect(statements).toContain(collegeParkMd);
    expect(statements).toContain(derbyCt);
  });

  it('keeps each unlinked event recoverable — its own geo evidence is asserted intact', () => {
    // A null city_id is recoverable; a wrong one is not. The events keep coordinates,
    // state and postcode so run_event_city_link can relink them once the right rows exist.
    expect(verifyBlock).toContain("state = 'Georgia'");
    expect(verifyBlock).toContain("postal_code = '30337'");
    expect(verifyBlock).toContain("e.state = 'England'");
    expect(verifyBlock).toContain("e.postal_code = 'DE1 1LH'");
  });

  it('corrects Londres BEFORE merging so no cross-country override is needed', () => {
    const londres = 'da4f3a14-c321-4c26-b89e-d84aba579c94';
    const countryFixAt = statements.indexOf(`where id = '${londres}'`);
    const mergeAt = statements.indexOf('merge_cities(');
    expect(countryFixAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(-1);
    expect(countryFixAt).toBeLessThan(mergeAt);
    // the confirm flag stays false: the merge is same-country by the time it runs
    expect(statements).toMatch(/merge_cities\([^)]*false\)/);
  });

  it('guards every write on the defect, so a row fixed elsewhere is skipped not aborted', () => {
    // `100000` also appears in postcondition P7, so asserting it over the whole file
    // matched the postcondition copy and passed with the UPDATE's own guard deleted.
    const classAStmt = statements.match(/with fix\(id, qid, lat, lon, cc\)[\s\S]*?;/);
    expect(classAStmt).not.toBeNull();
    expect(classAStmt![0]).toMatch(
      /haversine_m\(c\.latitude, c\.longitude, f\.lat, f\.lon\)\s*>\s*100000/,
    );
    expect(statements).toContain('and e.city_id = b.wrong_city_id');
  });

  it('asserts the reached state positively and cannot pass on an empty probe', () => {
    // counting rows in a BAD state returns zero for a row that vanished from the corpus
    expect(verifyBlock).toMatch(/P9[\s\S]*cohort/);
    expect(verifyBlock).toMatch(/v_cohort\s*<\s*200/);
    // nine postconditions, each raising
    const raises = verifyBlock.match(/raise exception/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(9);
    // and none of them may be short-circuited
    expect(verifyBlock).not.toMatch(/where\s+false/);
    expect(verifyBlock).not.toMatch(/if\s+false/);
  });

  it('gates the corpus-wide invariant, not merely its own rows', () => {
    // this is the assertion that caught the promoted-row cohort gap
    expect(verifyBlock).toMatch(/co\.code\s*=\s*'US'\s+and\s+e\.state\s*=\s*'England'/);
  });
});
