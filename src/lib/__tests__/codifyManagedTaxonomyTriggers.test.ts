/**
 * Guards the codification of the 29 `validate_managed_*` triggers.
 *
 * `check-schema-object-drift.mjs` failed on every open PR because those
 * triggers run in production and no migration created them. The scanner's own
 * docblock notes that a trigger inside a `do $$ ... execute 'create trigger
 * ...' $$` block STILL matches, "because the statement text is present either
 * way" — so dynamic creation alone is not the problem. What it cannot see is a
 * name COMPOSED at run time: the taxonomy migrations build each statement with
 * `format(...)`, so the literal name never appears in any file.
 *
 * THE CENTRAL TEST REPLICATES THE SCANNER'S OWN REGEX rather than asserting on
 * the migration's text. Asserting "the file contains 29 CREATE TRIGGER lines"
 * would pass against statements the gate still cannot match — which is the
 * entire failure being fixed. This checks the property, not the prose.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = (p: string) => resolve(__dirname, '../../../', p);
const MIGRATIONS = root('supabase/migrations');
const MIGRATION = '99991792213055_codify_managed_taxonomy_triggers.sql';
const SQL = readFileSync(join(MIGRATIONS, MIGRATION), 'utf8');

/** The 24 distinct names the gate reported as uncovered (29 table/name pairs). */
const CODIFIED_NAMES = [
  'validate_managed_accommodation_type',
  'validate_managed_category',
  'validate_managed_cause_of_death',
  'validate_managed_chosen_family_status',
  'validate_managed_current_relationship_status',
  'validate_managed_hotel_type',
  'validate_managed_profile_bdsm_role',
  'validate_managed_profile_communication_about_sex',
  'validate_managed_profile_disability_status',
  'validate_managed_profile_family_acceptance_level',
  'validate_managed_profile_financial_situation',
  'validate_managed_profile_housing_situation',
  'validate_managed_profile_immigration_status',
  'validate_managed_profile_jealousy_comfort_level',
  'validate_managed_profile_kink_experience_level',
  'validate_managed_profile_mental_health_openness',
  'validate_managed_profile_neurodivergent_status',
  'validate_managed_profile_physical_affection_preference',
  'validate_managed_profile_romance_style',
  'validate_managed_profile_sexual_exploration_openness',
  'validate_managed_profile_sexual_frequency_preference',
  'validate_managed_profile_sexual_health_status',
  'validate_managed_profile_workplace_safety',
  'validate_managed_relationship_style',
];

/** Already literal in the corpus before this migration — must NOT be restated. */
const PRE_EXISTING = [
  'validate_managed_competition_category',
  'validate_managed_event_type',
  'validate_managed_organisation_roles',
  'validate_managed_profile_flags',
];

/** Verbatim copy of the regex in scripts/check-schema-object-drift.mjs. */
const SCANNER_RE = /\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([a-z0-9_]+)"?/gi;

function namesCreatedInCorpus(): Set<string> {
  const found = new Set<string>();
  for (const f of readdirSync(MIGRATIONS)) {
    if (!f.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    for (const m of sql.matchAll(SCANNER_RE)) found.add(m[1].toLowerCase());
  }
  return found;
}

describe('validate_managed_* trigger codification', () => {
  const created = namesCreatedInCorpus();

  it('positive control: the scanner regex finds a known-good trigger', () => {
    // Without this, "all 24 are covered" is equally true of a broken regex
    // that matches everything, or of a corpus read that silently found nothing.
    expect(created.size).toBeGreaterThan(100);
    expect(created.has('trg_personalities_outing_guard')).toBe(true);
  });

  it('the SCANNER regex now matches every codified name', () => {
    // The property the gate checks — not the migration's text.
    const missing = CODIFIED_NAMES.filter((n) => !created.has(n));
    expect(missing).toEqual([]);
  });

  it('emits one drop-if-exists per create, so it is idempotent both ways', () => {
    // On prod each is dropped and recreated identically inside the transaction;
    // on a rebuild the taxonomy loop creates them first and the drop keeps the
    // recreate from raising 42710.
    const creates = (SQL.match(/^CREATE TRIGGER /gim) ?? []).length;
    const drops = (SQL.match(/^drop trigger if exists /gim) ?? []).length;
    expect(creates).toBe(29);
    expect(drops).toBe(29);
  });

  it('every create is preceded by the drop for the SAME table', () => {
    // A drop on the wrong table would leave the original attached and then
    // fail on 42710, or silently detach something else.
    const pairs = [
      ...SQL.matchAll(
        /^drop trigger if exists (\w+) on public\.(\w+);\s*\nCREATE TRIGGER (\w+) BEFORE [^\n]*ON public\.(\w+) /gim,
      ),
    ];
    expect(pairs.length).toBe(29);
    for (const [, dName, dTbl, cName, cTbl] of pairs) {
      expect(dName).toBe(cName);
      expect(dTbl).toBe(cTbl);
    }
  });

  it('does NOT restate the four already-literal triggers', () => {
    // Scope claim: restating them would be churn, and a sweep that detached
    // them would still satisfy the coverage test above.
    for (const n of PRE_EXISTING) {
      expect(SQL).not.toContain(`CREATE TRIGGER ${n} `);
    }
  });

  it('does not touch the shrink-only drift baseline', () => {
    // The baseline's header says "Never add", and the gate hard-fails on an
    // entry that later becomes covered — so adding these would hand work to
    // whoever codified them properly.
    const baseline = JSON.parse(
      readFileSync(root('scripts/schema-object-drift-baseline.json'), 'utf8'),
    ) as { uncovered?: string[] };
    const entries = baseline.uncovered ?? [];
    expect(entries.filter((e) => e.includes('validate_managed'))).toEqual([]);
  });

  it('postconditions assert the reached state and RAISE', () => {
    for (const p of ['P1 failed', 'P2 failed', 'P3 failed']) {
      expect(SQL).toContain(p);
    }
    const raises = SQL.match(/raise exception 'P\d/g) ?? [];
    expect(raises.length).toBe(3);
    // P1 must assert attachment, not count statements — a count passes on a
    // file that emitted none.
    expect(SQL).toMatch(/not exists \(\s*\n\s*select 1\s*\n\s*from pg_trigger/);
    expect(SQL).not.toMatch(/if\s+false\s+then/i);
  });
});
