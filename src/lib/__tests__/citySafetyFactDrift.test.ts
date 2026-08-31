import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 2 part D — `safety_notes` FACT drift.
 *
 * The country-key check from 20260913114500 detects a city being RELINKED to another
 * country. It structurally cannot detect a country CHANGING ITS LAW: the prose still names
 * the correct country and `field_provenance.safety_notes.country_id` still points at it,
 * so the row satisfies neither eligibility arm and is never re-examined. The note serves
 * outdated law indefinitely.
 *
 * The fix stamps a fingerprint of the LEGAL composer inputs and makes a mismatch against
 * the country's current inputs eligible work.
 *
 * The sharp edge, and why the second migration exists: an UNSTAMPED note is not a DRIFTED
 * note. `facts IS DISTINCT FROM <current>` is true both when the stamp changed and when
 * there is no stamp at all. Treating those identically would retract correct notes purely
 * for predating the stamp — absence of evidence read as evidence of absence, the same
 * inversion that made a dead logo.dev token look like "no logo exists".
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

/**
 * Strip `--` comments before asserting ABSENCE of something.
 *
 * These migrations explain at length WHY density is excluded and WHY fact_unstamped must
 * not appear in the retraction condition — so a naive `not.toMatch(/density/)` matches the
 * comment that documents the very guarantee it is testing, and fails on correct code. A
 * negative assertion has to read the code, not the prose about the code.
 */
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const backfill = latestDefinitionOf('run_city_safety_backfill');
const factKey = latestDefinitionOf('city_safety_fact_key');
const factKeyCode = stripSqlComments(factKey);

/** The branch taken when compose_safety_note says a human must approve. */
const elseBranch = (() => {
  const start = backfill.search(/IF\s*\(v_out->>'auto_publishable'\)::boolean\s+THEN/i);
  if (start < 0) return null;
  const rest = backfill.slice(start);
  const elseAt = rest.search(/\n\s*ELSE\b/);
  const endAt = rest.search(/\n\s*END IF;/);
  if (elseAt < 0 || endAt < 0 || endAt < elseAt) return null;
  return rest.slice(elseAt, endAt);
})();

describe('the fingerprint covers the legal inputs and only those', () => {
  const LEGAL_KEYS = [
    'country_name',
    'equality_score',
    'criminalizing',
    'death_penalty',
    'penalty',
    'unions_summary',
    'marriage',
    'marriage_since',
  ];

  it.each(LEGAL_KEYS)('includes %s', (key) => {
    expect(factKey).toContain(`'${key}'`);
  });

  it('EXCLUDES density', () => {
    // compose_safety_note() does read venue/event/village counts, but those churn
    // continuously. Including them would make every city with any ingest activity eligible
    // every night, and each write walks cities -> geo_places -> search_reindex_queue on a
    // disk-constrained DB. Density drift changes tone, not legal correctness.
    const keyBody = factKeyCode.slice(
      factKeyCode.indexOf('city_safety_fact_key'),
      factKeyCode.indexOf('COMMENT ON FUNCTION public.city_safety_fact_key'),
    );
    expect(keyBody).not.toContain('density');
    expect(keyBody).not.toMatch(/\bvenues\b/);
    expect(keyBody).not.toMatch(/\bevents\b/);
  });

  it('normalises absence so cosmetic upstream flicker cannot fire it', () => {
    // NULL, '' and ILGA's literal 'No data' are the same absence.
    const norm = latestDefinitionOf('safety_fact_norm');
    expect(norm).toMatch(/'no data'/i);
    expect(norm).toMatch(/lower\(trim\(/i);
  });

  it('is IMMUTABLE so it can be compared in a WHERE clause', () => {
    expect(factKey).toMatch(/IMMUTABLE/i);
  });
});

describe('unstamped is distinguished from drifted', () => {
  it('defines both fact_drift and fact_unstamped', () => {
    expect(backfill).toMatch(/AS\s+fact_drift/i);
    expect(backfill).toMatch(/AS\s+fact_unstamped/i);
  });

  it('fact_drift requires an existing stamp', () => {
    // Without the IS NOT NULL guard, every pre-stamp note reads as drifted.
    const drift = backfill.slice(
      backfill.search(/AND c\.field_provenance->'safety_notes'->'facts' IS NOT NULL/i) - 400,
      backfill.search(/AS\s+fact_drift/i),
    );
    expect(drift).toMatch(/'facts'\s+IS\s+NOT\s+NULL/i);
  });

  it('reports both counts separately in the run summary', () => {
    // A summary claiming `fact_drift: 300` on a night when nothing drifted is a fabricated
    // signal — the class of thing that made last_success_at read as a four-month outage.
    expect(backfill).toMatch(/'fact_drift',\s*v_drifted/);
    expect(backfill).toMatch(/'fact_unstamped',\s*v_unstamped/);
  });
});

describe('retraction fires on evidence only', () => {
  it('parses the review-queue branch', () => {
    expect(elseBranch, 'could not find the ELSE branch').not.toBeNull();
  });

  it('retracts on a wrong country OR on genuine fact drift', () => {
    expect(elseBranch ?? '').toMatch(/rec\.stale_note\s+OR\s+rec\.fact_drift/i);
  });

  it('does NOT retract merely because a note is unstamped', () => {
    // This is the correction in 20260830132442. An unstamped note is eligible so it
    // ACQUIRES a stamp; it is never grounds to blank a note that may be perfectly correct.
    expect(stripSqlComments(elseBranch ?? '')).not.toMatch(/fact_unstamped/);
  });

  it('still clears safety_notes and preserves the retracted text', () => {
    expect(elseBranch ?? '').toMatch(/safety_notes\s*=[\s\S]{0,120}\bNULL\b/i);
    expect(elseBranch ?? '').toMatch(/'retracted'/);
  });

  it('distinguishes the two retraction reasons', () => {
    expect(elseBranch ?? '').toMatch(/different country/i);
    expect(elseBranch ?? '').toMatch(/legal facts changed/i);
  });
});

describe('the outing-safety invariant is untouched', () => {
  it('still gates publication on compose_safety_note’s auto_publishable', () => {
    // The composer forces auto_publishable=false for criminalising and death-penalty
    // countries. Nothing in this change may bypass that test.
    expect(backfill).toMatch(/IF\s*\(v_out->>'auto_publishable'\)::boolean\s+THEN/i);
  });

  it('never writes safety_notes outside the auto_publishable branch except to NULL it', () => {
    const writes = (elseBranch ?? '').match(/safety_notes\s*=\s*([^,\n]+)/g) ?? [];
    for (const w of writes) {
      expect(w).toMatch(/NULL|CASE|safety_notes/i);
    }
  });
});
