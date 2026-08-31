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
    expect(probeLadder.length, 'probe ladder markers moved — update this test').toBeGreaterThan(
      200,
    );
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
    const evidence = body.slice(
      body.indexOf('v_has_evidence :='),
      body.indexOf("'insufficient_evidence'"),
    );
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
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.city_resolve_or_create[\s\S]*?FROM\s+PUBLIC,\s*anon/i,
    );
  });

  /**
   * The postal-code arm, added for the aids-ch health registry.
   *
   * A postal code is NOT one-to-one with a city anywhere: 636 rows of the Swiss
   * postal directory put one code in several municipalities, a US ZIP crosses
   * city lines, a UK postcode is finer than a town. The arm is only safe while
   * it demands a single claimant and treats a disagreement with the name as a
   * reason to stop. Loosening either turns it into the name-only resolution that
   * 20260802090844 exists to prevent, one column over.
   */
  describe('postal-code arm', () => {
    const arm = (() => {
      const start = probeLadder.indexOf('-- (g) Postal code');
      return start >= 0 ? probeLadder.slice(start) : '';
    })();

    it('parses out of the migration', () => {
      expect(arm.length, 'postal arm marker moved — update this test').toBeGreaterThan(200);
    });

    it('requires exactly one claimant and never picks a favourite', () => {
      // v_postal_n = 1 is the whole guard. `> 0`, or taking the first row of
      // several, would resolve a shared code to whichever city sorts first.
      expect(arm).toMatch(/v_postal_n\s*=\s*1/);
      expect(arm).not.toMatch(/v_postal_n\s*>\s*0/);
    });

    it('counts DISTINCT survivors, so a merged twin is not a second city', () => {
      expect(arm).toContain('count(DISTINCT coalesce(c.duplicate_of_id, c.id))');
    });

    it('contradicts a name hit rather than deferring to it', () => {
      // When a name arm already matched and the postal code points elsewhere,
      // one of the two signals is wrong and the answer is neither of them.
      expect(arm).toContain("'refused', 'postal_conflict'");
      expect(arm).toContain('name_and_postal_disagree');
    });

    it('stays opt-in, so callers that pass no code are unaffected', () => {
      expect(sql).toMatch(/p_postal_code\s+text\s+DEFAULT\s+NULL/i);
      expect(arm).toMatch(/IF\s+v_postal\s+IS\s+NOT\s+NULL\s+THEN/i);
    });

    it('runs last, after every name-based arm', () => {
      // Placed before the alias arm it would pre-empt a better identity signal.
      expect(probeLadder.indexOf('-- (f) Alias')).toBeLessThan(
        probeLadder.indexOf('-- (g) Postal code'),
      );
    });
  });
});
