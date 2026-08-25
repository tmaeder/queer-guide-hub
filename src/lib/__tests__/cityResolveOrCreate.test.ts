import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `city_resolve_or_create` is the write door for cities, and four of its
 * properties are load-bearing in a way that is easy to "simplify" away later.
 *
 * Context: every unique key on `cities` keys on the STRING — measured on
 * production 2026-08-25, exact-name, QID and slug duplicate groups are all zero
 * over 5,552 live rows — so the only duplicates that can still be created are
 * the ones where the string differs, and there is no key for those. This
 * function is the layer that catches them, and each guard below exists because
 * a specific real failure produced it:
 *
 *  1. The probe arms must NOT filter `duplicate_of_id IS NULL`. Two of the four
 *     unique indexes are TOTAL. 20260811100400 records the cost of getting this
 *     wrong: two rows with merged twins aborted a 798-row batch with 23505.
 *  2. Geographic proximity must never be a MATCH. Manhattan sits 14 m from New
 *     York's centroid and Mestre 0 m from Venice's; merging a district into its
 *     city destroys content, and `unmerge_cities` does not undo reparenting.
 *  3. Creating needs evidence beyond a name and a country. A bare (name,
 *     country) with no coordinates is the shape that produced pairs nothing can
 *     ever reunite.
 *  4. Two distinct Wikidata QIDs are two distinct entities and must be excluded
 *     from the candidate set, or a district blocks the creation of its own city.
 *
 * Text check against the migrations directory, so it runs in CI without
 * credentials — same pattern as `citySafetyBackfill.test.ts`.
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

const sql = latestDefinitionOf('city_resolve_or_create');

/** The function body, from its own CREATE to the closing dollar-quote. */
const body = (() => {
  const start = sql.search(/create\s+or\s+replace\s+function\s+public\.city_resolve_or_create/i);
  const rest = sql.slice(start);
  const end = rest.indexOf('END; $$;');
  return end < 0 ? rest : rest.slice(0, end);
})();

/** Everything from the probe ladder down to the candidate collection. */
const probeLadder = (() => {
  const start = body.indexOf('-- (a) QID');
  const end = body.indexOf('-- No identity hit');
  return start >= 0 && end > start ? body.slice(start, end) : '';
})();

describe('city_resolve_or_create', () => {
  it('parses the probe ladder out of the migration', () => {
    expect(probeLadder.length, 'probe ladder markers moved — update this test').toBeGreaterThan(200);
  });

  it('probes the TOTAL unique keys without filtering duplicate_of_id', () => {
    // The arms SELECT coalesce(c.duplicate_of_id, c.id) — following a merged row
    // to its survivor — and must never add `duplicate_of_id IS NULL`, which
    // would match the partial index and go blind to the two total ones.
    expect(probeLadder).toContain('coalesce(c.duplicate_of_id, c.id)');
    expect(probeLadder).not.toMatch(/duplicate_of_id\s+IS\s+NULL/i);
  });

  it('probes canonical_key, lower(name) and city_aliases', () => {
    expect(probeLadder).toContain('c.canonical_key = v_key');
    expect(probeLadder).toContain('lower(c.name) = lower(v_base)');
    expect(probeLadder).toContain('city_aliases');
  });

  it('never matches name_normalized when it normalizes to nothing', () => {
    // normalize_name strips every non-[a-z0-9] character, so a Greek, Japanese,
    // Korean, Hebrew, Cyrillic, Georgian, Thai, Khmer or Lao name becomes ''.
    // 27 live rows do. Matching on '' would resolve all of them to whichever
    // row happens to come first.
    expect(body).toMatch(/length\(v_nn\)\s*>=\s*3/);
  });

  it('treats geographic proximity as a refusal, never as a match', () => {
    const geoBlock = body.slice(body.indexOf('-- No identity hit'));
    expect(geoBlock).toContain("'refused', 'geo_proximity'");
    expect(geoBlock).not.toMatch(/'matched',\s*'geo_proximity'/);
  });

  it('excludes a candidate whose Wikidata QID contradicts the caller', () => {
    const geoBlock = body.slice(body.indexOf('-- No identity hit'));
    expect(geoBlock).toMatch(/c\.wikidata_qid\s*<>\s*btrim\(p_wikidata_qid\)/);
  });

  it('requires coordinates, a QID, a source id or an admin before creating', () => {
    expect(body).toContain('v_has_evidence');
    expect(body).toContain("'insufficient_evidence'");
    // All four disjuncts, so dropping one is a visible failure rather than a
    // quietly widened door.
    const evidence = body.slice(body.indexOf('v_has_evidence :='), body.indexOf("'insufficient_evidence'"));
    expect(evidence).toContain('p_lat IS NOT NULL');
    expect(evidence).toContain('p_wikidata_qid');
    expect(evidence).toContain('p_source_entity_id');
    expect(evidence).toContain("p_actor = 'admin'");
  });

  it('serializes on the same advisory-lock key as commit_city_staging_item', () => {
    // Different keys would let the two creating paths race each other into a
    // duplicate that neither probe could have seen.
    expect(body).toContain("hashtextextended(v_country_id::text || '|' || v_nn, 0)");
    expect(body).toContain('pg_advisory_xact_lock');
  });

  it('re-probes inside the unique_violation handler instead of returning null', () => {
    const handler = body.slice(body.indexOf('EXCEPTION WHEN unique_violation'));
    expect(handler).toContain('canonical_key = v_key');
    expect(handler).toContain("'raced'");
  });

  it('blocks a name whose own country contradicts the given one', () => {
    expect(body).toContain("'country_contradiction'");
  });

  it('is not callable by anon', () => {
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.city_resolve_or_create[\s\S]*?FROM\s+PUBLIC,\s*anon/i);
  });
});
