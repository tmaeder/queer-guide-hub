import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the one-off importer `scripts/data-quality/import-gays-cruising.mjs`.
 *
 * This is a SEPARATE file from gaysCruisingLicence.test.ts on purpose. That one
 * guards the licence boundary of the parser and the migrations — a boundary that
 * holds whatever this import does. This one guards the importer's own
 * correctness invariants, each of which has a recorded casualty count behind it
 * somewhere in this repo. Merging them would make a licence failure and a
 * data-shape failure read the same in CI.
 */

const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'data-quality', 'import-gays-cruising.mjs');
const src = readFileSync(SCRIPT, 'utf8');

/** Comments quote the very patterns being banned, so assertions run over code. */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

describe('gays-cruising importer', () => {
  it('never emits an empty-string country', () => {
    // venues_country_iso2_check allows NULL and rejects ''. A `?? ''` here is a
    // two-character edit that CI would otherwise only catch at commit time, and
    // the last time it happened it silently killed 907/1851 refuge-restrooms
    // rows and 203/381 osm rows before 20260915131700.
    expect(code).not.toMatch(/country\s*[:=][^,\n]*\?\?\s*['"]{2}/);
    expect(code).not.toMatch(/country\s*:\s*['"]{2}/);
    // The country key must be spread conditionally, never assigned outright.
    expect(code).toMatch(/\.\.\.\(countryCode\s*\?\s*\{\s*country:\s*countryCode\s*\}/);
  });

  it('keys identity on the numeric spot id, never a name slug', () => {
    // A Spartacus cohort keyed on `<name-slug>:<city>` duplicated 47% of itself.
    expect(code).toMatch(/sourceId:\s*String\(rec\.id\)/);
    expect(code).toMatch(/Number\.isInteger\(rec\.id\)/);
    // source_entity_id must come off the payload's own sourceId, not be rebuilt.
    expect(code).toMatch(/source_entity_id[\s\S]{0,400}n->>'sourceId'/);
  });

  it('synthesises an address, which keeps the cohort out of the review queue', () => {
    // A row here scores W_NO_CONTACT + W_SHORT_DESCRIPTION = 2 warnings and
    // stays `approved`; pipeline-validate flips to needs_review at 3. Dropping
    // the address adds the third and sends the whole cohort to a human queue.
    expect(code).toMatch(/address:/);
  });

  it('commits as the cruising category, which is what arms the safety gate', () => {
    // venue_is_safety_gated() ORs on category='cruising' (20261110100000), so
    // the category IS the gate for this cohort. Any other value publishes them.
    expect(code).toMatch(/category:\s*['"]cruising['"]/);
  });

  it('refuses to run without a recorded consent reference', () => {
    expect(code).toMatch(/GAYS_CRUISING_CONSENT_REF/);
    expect(code).toMatch(/function requireConsent/);
    // Both WRITE paths must call it. `phaseReport` is exempt: reading a local
    // file and printing a tally relies on no permission.
    //
    // Scoped to the function BODY, not a fixed character window. The first
    // version of this assertion used `.slice(0, 200)` from the function start;
    // that is brittle by construction — it passed while `phaseStage` did not
    // call requireConsent() at all, and only a comment-only control mutation
    // exposed it. A window is not a scope.
    // The boundary must be the next top-level function of ANY kind, not the
    // next `async function`. `function requireConsent()` is declared between
    // phaseStage and phaseDrain and is not async, so an async-only boundary
    // swallowed its own DEFINITION into phaseStage's body — the assertion then
    // matched the declaration and survived deleting the call. Asserting the
    // CALL form `requireConsent();` is the second, independent guard against
    // that: a declaration is `requireConsent() {`, never `requireConsent();`.
    const bodyOf = (fn: string) => {
      const start = code.indexOf(`async function ${fn}(`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const rest = code.slice(start + 1);
      const next = rest.search(/\n(?:async )?function /);
      return next === -1 ? rest : rest.slice(0, next);
    };
    expect(bodyOf('phaseStage'), 'phaseStage writes to the DB without checking consent').toMatch(
      /requireConsent\(\);/,
    );
    expect(bodyOf('phaseDrain'), 'phaseDrain commits without checking consent').toMatch(
      /requireConsent\(\);/,
    );
  });

  it('does not report a vacuous gate pass on an empty corpus', () => {
    // `ungated:0, miscategorised:0` is also what zero rows returns. Measured
    // against the real table while writing this: the first version printed a
    // clean gate check having verified nothing.
    expect(code).toMatch(/committed\s*>\s*0\s*&&\s*gTotal\s*===\s*0/);
    expect(code).toMatch(/PROBE BROKEN/);
  });

  it('keeps prose off unless BOTH the flag and the acknowledgement are set', () => {
    // The source's write-ups are its USERS' text, which Keyup cannot sublicense,
    // and 1,826 of them name a real retail chain as a sex location. Turning this
    // on must be deliberate, not reachable by a stray flag.
    expect(code).toMatch(
      /INCLUDE_PROSE\s*=\s*has\(['"]include-prose['"]\)\s*&&\s*process\.env\.GAYS_CRUISING_PROSE_ACK\s*===/,
    );
    // The description key must be spread behind that constant, never assigned.
    expect(code).not.toMatch(/^\s*description:\s*decodeEntities/m);
    expect(code).toMatch(/\.\.\.\(INCLUDE_PROSE\s*&&/);
  });

  it('quarantines brand-named rows rather than silently dropping them', () => {
    // Whether to publish an assertion about a named third-party business is an
    // editorial decision. The script must preserve the set for a human, not
    // make the call by deleting it.
    expect(code).toMatch(/quarantine-brands\.ndjson/);
    expect(code).toMatch(/BRAND_RE/);
  });

  it('matches generic placeholder names on the whole string, not as substrings', () => {
    // A substring rule eats "Parque Ecológico de Foo", which is a real name.
    expect(code).toMatch(/GENERIC_NAMES\.has\(key\)/);
    expect(code).not.toMatch(/GENERIC_NAMES[\s\S]{0,80}\.some\(/);
  });

  it('reads the criminalizing set from the database, never a hand list', () => {
    // CLAUDE.md: never reconstruct safety_gated from an inferred predicate.
    // death_penalty_risk() is the source of truth and is ILGA-maintained.
    expect(code).toMatch(/death_penalty_risk\(/);
  });
});
