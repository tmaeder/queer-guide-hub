import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A circuit breaker that has no row in `api_circuit_breakers` can NEVER trip.
 *
 * Both halves of the protocol no-op on a missing row, in opposite directions:
 *
 *   checkCircuit()                  absent row -> { allowed: true }. Never blocks.
 *   circuit_breaker_record_failure  UPDATE ... WHERE api_name = $1;
 *                                   IF NOT FOUND THEN RETURN circuit_opened:false;
 *
 * The recorder is a bare UPDATE with an early return — it does not insert. So the
 * failure is not "unguarded until the first failure creates a row"; the row is
 * never created and the breaker is decorative forever.
 *
 * Measured 2026-09-04: TWENTY breaker names were called in edge-function code
 * with no registered row, twelve of them LLM breakers — i.e. most of this
 * platform's enrichment spend ran with no circuit at all.
 *
 * WHY THIS TEST RESOLVES CONSTANTS. Scanning only for a string literal in the
 * breaker-argument position finds 16 of those 20. The other four are passed
 * through a module-level constant:
 *
 *     const BREAKER = 'llm.editorial'
 *     await withCircuitBreaker(supabase, BREAKER, ...)
 *
 * A literal-only guard would have declared this fixed with a fifth of it still
 * broken — so the resolver below follows single-file `const NAME = '...'`
 * bindings. Names that are genuinely dynamic (built per-item at runtime, e.g.
 * `source-rss-news`'s per-provider `apiName`) cannot be resolved statically and
 * are out of scope; that is a known limit, stated rather than hidden.
 */

const ROOT = join(__dirname, '..', '..', '..');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

/** The helpers whose second argument is a breaker name. */
const BREAKER_CALLS =
  '(?:checkCircuit|withCircuitBreaker|createBatchCircuitChecker|rpcWithBreaker|rpcWithBatchBreaker)';

/**
 * Test fixtures and deliberately-unresolvable names. `missing.api` exists
 * precisely to exercise the absent-row path, so registering it would break the
 * suite it belongs to.
 */
const NOT_REAL_BREAKERS = new Set(['missing.api', 'test.api', 'rpc.test']);

/**
 * Breakers that have a LIVE ROW on prod but no migration that creates one.
 * Verified individually on 2026-09-04 — every name here returned
 * `row_exists = true` from `api_circuit_breakers`, so each one does trip today.
 *
 * They are still a real defect, just a lower-severity one: the rows were seeded
 * outside the migration path (raw Management-API SQL records no history), so a
 * database rebuilt from `supabase/migrations` alone would not have them and all
 * ten would silently become un-trippable. Fixing that means writing the
 * registrations with the thresholds they currently carry, which is a separate,
 * checkable change — not something to bundle into a migration about a different
 * defect.
 *
 * THIS LIST MAY ONLY SHRINK. It is not an exemption: an entry that gains a real
 * registration starts failing the last test in this file, which tells you to
 * delete it. That is the `KNOWN_NAME_MISMATCHES` discipline from
 * check-migration-drift.mjs, and it is what stops an allowlist rotting into a
 * permanent blind spot nobody re-reads.
 */
const REGISTERED_OUTSIDE_MIGRATIONS = new Set([
  'awin',
  'eventbrite',
  'foursquare',
  'google_places',
  'ilga_graphql',
  'llm.existence.pageread',
  'refuge_restrooms',
  'rest_countries',
  'ticketmaster',
  'tomtom',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** Breaker names used in one file: direct literals plus resolved local consts. */
function breakerNamesIn(src: string): string[] {
  const names = new Set<string>();

  // 1. Direct literal: withCircuitBreaker(supabase, 'llm.editorial', ...)
  for (const m of src.matchAll(new RegExp(`${BREAKER_CALLS}\\(\\s*\\w+\\s*,\\s*'([^']+)'`, 'g'))) {
    names.add(m[1]);
  }

  // 2. Via a module-level constant. Collect `const X = '...'` then look for
  //    calls passing X. Deliberately only single-file: an imported constant is
  //    rare here and resolving across modules would need a real parser.
  const consts = new Map<string, string>();
  for (const m of src.matchAll(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']+)'\s*;?\s*$/gm)) {
    consts.set(m[1], m[2]);
  }
  for (const m of src.matchAll(
    new RegExp(`${BREAKER_CALLS}\\(\\s*\\w+\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*[,)]`, 'g'),
  )) {
    const resolved = consts.get(m[1]);
    if (resolved) names.add(resolved);
  }

  return [...names];
}

/** Every breaker name any migration registers, by whichever route. */
function registeredNames(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    if (!f.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');

    // register_circuit_breaker('x', ...) / register_circuit_breaker_if_absent('x')
    for (const m of sql.matchAll(/register_circuit_breaker(?:_if_absent)?\s*\(\s*'([^']+)'/g)) {
      out.add(m[1]);
    }
    // Direct seeding: INSERT INTO api_circuit_breakers ... VALUES ('x', ...)
    if (/insert\s+into\s+(?:public\.)?api_circuit_breakers/i.test(sql)) {
      const tail = sql.slice(sql.search(/insert\s+into\s+(?:public\.)?api_circuit_breakers/i));
      for (const m of tail.matchAll(/\(\s*'([^']+)'\s*,\s*'(?:closed|open|half_open)'/g)) {
        out.add(m[1]);
      }
    }
  }
  return out;
}

describe('every circuit breaker used in code is registered', () => {
  const files = walk(FUNCTIONS_DIR);
  const used = new Map<string, string>(); // name -> first file that uses it
  for (const f of files) {
    for (const n of breakerNamesIn(readFileSync(f, 'utf8'))) {
      if (!used.has(n)) used.set(n, f.slice(ROOT.length + 1));
    }
  }
  const registered = registeredNames();

  it('the scan actually finds breaker usages and registrations', () => {
    // Positive control on BOTH sides. If either scan silently returns nothing,
    // the real assertion below passes vacuously.
    expect(used.size, 'no breaker usages found — the call-site regex broke').toBeGreaterThan(20);
    expect(registered.size, 'no registrations found — the migration regex broke').toBeGreaterThan(
      20,
    );
  });

  it('resolves breaker names passed via a module-level constant', () => {
    // Guards the resolver itself. These four are ONLY reachable through a const,
    // and a literal-only scan reported this whole class fixed while they were
    // still broken.
    for (const n of [
      'llm.editorial',
      'llm.venue-contact-enrich',
      'llm.cf.feedback-autotriage',
      'llm.openai.classify-personhood',
    ]) {
      expect([...used.keys()], `const-resolution regressed: ${n} is no longer detected`).toContain(
        n,
      );
    }
  });

  it('no breaker is used in code without a registered row', () => {
    const unregistered = [...used.entries()]
      .filter(
        ([n]) =>
          !NOT_REAL_BREAKERS.has(n) && !REGISTERED_OUTSIDE_MIGRATIONS.has(n) && !registered.has(n),
      )
      .map(([n, f]) => `${n}  (${f})`)
      .sort();
    expect(
      unregistered,
      'these can NEVER trip — checkCircuit allows on an absent row and ' +
        'circuit_breaker_record_failure is a bare UPDATE that returns early, so no row is ever ' +
        'created. Register them with INSERT ... ON CONFLICT DO NOTHING (never ' +
        'register_circuit_breaker, which is DO UPDATE and clobbers existing tuning):\n  ' +
        unregistered.join('\n  '),
    ).toEqual([]);
  });

  it('the outside-migrations allowlist only shrinks', () => {
    // An entry that has since gained a real registration must be deleted, not
    // left standing. Without this the list silently becomes a permanent
    // exemption — the failure mode every allowlist in this repo is written to
    // avoid.
    const nowRegistered = [...REGISTERED_OUTSIDE_MIGRATIONS]
      .filter((n) => registered.has(n))
      .sort();
    expect(
      nowRegistered,
      `these now have a migration registering them — delete them from ` +
        `REGISTERED_OUTSIDE_MIGRATIONS:\n  ${nowRegistered.join('\n  ')}`,
    ).toEqual([]);

    // And an entry nothing calls any more is dead weight.
    const unused = [...REGISTERED_OUTSIDE_MIGRATIONS].filter((n) => !used.has(n)).sort();
    expect(
      unused,
      `no code calls these any more — delete them from REGISTERED_OUTSIDE_MIGRATIONS:\n  ${unused.join('\n  ')}`,
    ).toEqual([]);
  });
});
