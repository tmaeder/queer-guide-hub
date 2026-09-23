import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for 99991790172641_city_commit_routes_through_resolver.sql.
 *
 * `commit_city_staging_item` was routed through `city_resolve_or_create` by
 * 20261001100300. 20261001110000 then restated the WHOLE body in order to add
 * two capital columns and silently reverted the routing — the CREATE OR REPLACE
 * restate trap. Nothing caught it: the only existing test
 * (`cityResolveOrCreate.test.ts`) asserts the advisory-lock key parity and
 * nothing about the routing, and the health script keys on `near_pairs` growth,
 * which did not move (live 107 against a 196 baseline).
 *
 * This is the check whose absence let the revert through, so it must survive a
 * third restatement: it finds the LATEST migration defining the function rather
 * than pinning a filename.
 *
 * Every assertion runs against COMMENT-STRIPPED SQL. The reverting migration's
 * own header lists `commit_city_staging_item()` in its lockstep list, and this
 * migration's header quotes `city_resolve_or_create` a dozen times, so a bare
 * `toContain` over the raw file passes with the call deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FN = 'commit_city_staging_item';
const RESOLVER = 'city_resolve_or_create';
const MIGRATION = '99991790172641';

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** The latest migration defining the function — not a pinned filename, so a
 *  later restatement is what gets checked rather than this one forever. */
function latestDefinitionFile(): string {
  const hit = migrationFiles()
    .filter((f) =>
      readFileSync(join(MIGRATIONS, f), 'utf8').includes(
        `CREATE OR REPLACE FUNCTION public.${FN}`,
      ),
    )
    .pop();
  if (!hit) throw new Error(`no migration defines ${FN}`);
  return hit;
}

/** Strip `--` line comments. Without this the headers alone satisfy most of
 *  the assertions below while the statements say the opposite. */
function statements(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * The function body ONLY.
 *
 * Scoping is load-bearing here rather than tidy: the same migration's verify
 * block carries the literal regex `insert\s+into\s+(public\.)?cities\M`, so the
 * "does not insert into cities" assertion matched against the whole file would
 * fail on correct code — and its mirror, asserted over the whole file, would
 * pass with the statement restored. Scope the assertion to the half of the
 * file it is about.
 */
function functionBody(sql: string): string {
  const from = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${FN}`);
  expect(from, `${FN} is not defined in this migration`).toBeGreaterThan(-1);
  const open = sql.indexOf('$function$', from);
  expect(open).toBeGreaterThan(from);
  const close = sql.indexOf('$function$', open + '$function$'.length);
  expect(close).toBeGreaterThan(open);
  return sql.slice(from, close);
}

/** The fill-if-empty UPDATE only. The column names appear three times each in
 *  the body (DECLARE, parse, write) and only this one is the write. */
function cityUpdate(fnBody: string): string {
  const from = fnBody.indexOf('UPDATE public.cities SET');
  expect(from, 'the fill-if-empty UPDATE is missing entirely').toBeGreaterThan(-1);
  const to = fnBody.indexOf('WHERE id = v_result_id;', from);
  expect(to).toBeGreaterThan(from);
  return fnBody.slice(from, to);
}

const latestFile = latestDefinitionFile();
const latestSrc = statements(readFileSync(join(MIGRATIONS, latestFile), 'utf8'));
const body = functionBody(latestSrc);
const update = cityUpdate(body);

describe('commit_city_staging_item routes identity through the resolver', () => {
  it('the latest definition is this migration, or a later one that still routes', () => {
    // A positive control on the finder itself: an empty or wrong match would
    // make every assertion below vacuous.
    expect(latestFile >= `${MIGRATION}_`).toBe(true);
    expect(body.length).toBeGreaterThan(500);
  });

  it('calls city_resolve_or_create', () => {
    expect(body).toContain(`public.${RESOLVER}(`);
  });

  it('does not INSERT into cities itself', () => {
    // The defect, spelled the way both reverted versions spelled it.
    expect(body).not.toMatch(/insert\s+into\s+(public\.)?cities\b/i);
  });

  it('raises rather than inserting when the resolver refuses', () => {
    // A refusal is not an insert. Without this the resolver's refusal reasons
    // are swallowed and the staging row is dispositioned as though it committed.
    expect(body).toMatch(/city_unresolved:/);
    expect(body).toMatch(/v_res\.city_id\s+IS\s+NULL/i);
  });

  it('keeps the capital-scope columns and their key-PRESENCE semantics', () => {
    // The mirror mistake: restoring the routing while losing what the reverting
    // migration legitimately added would be just as silent.
    //
    // SCOPED TO THE UPDATE. Both column names also appear in the DECLARE block
    // and in the parsing lines, so asserting them over the whole body passes
    // with the write itself deleted — mutation-tested, it did.
    expect(update).toMatch(
      /is_regional_capital\s*=\s*CASE WHEN v_has_regional THEN v_is_regional_capital ELSE is_regional_capital END/,
    );
    expect(update).toMatch(
      /capital_of_region\s*=\s*CASE WHEN v_has_capital_of THEN v_capital_of_region ELSE capital_of_region END/,
    );
    // Presence, not value: is_regional_capital is NOT NULL DEFAULT false, so an
    // unprobed row and a probed negative are indistinguishable by value.
    expect(body).toMatch(/v_meta\s*\?\s*'is_regional_capital'/);
    expect(body).toMatch(/v_meta\s*\?\s*'capital_of_region'/);
  });

  it('restates the COMMENT in the same migration as the body', () => {
    // The live comment survived the revert and went on claiming the routing was
    // there, because the reverting migration restated the body alone. Body and
    // comment must move together.
    const comment = latestSrc.slice(latestSrc.indexOf('COMMENT ON FUNCTION'));
    expect(comment).toContain(`public.${FN}(uuid, text)`);
    expect(comment).toContain(RESOLVER);
  });
});

describe('city_writer_signals', () => {
  const sentinelFile = migrationFiles()
    .filter((f) =>
      readFileSync(join(MIGRATIONS, f), 'utf8').includes(
        'CREATE OR REPLACE FUNCTION public.city_writer_signals',
      ),
    )
    .pop();
  const sentinelSrc = statements(
    readFileSync(join(MIGRATIONS, sentinelFile ?? latestFile), 'utf8'),
  );

  it('exists', () => {
    expect(sentinelFile, 'no migration defines city_writer_signals').toBeTruthy();
  });

  it('reports coverage, not only the verdict', () => {
    // Zero offenders over a scan that matched nothing is vacuous, not clean —
    // so functions_scanned and inserters are reported alongside offender_count.
    //
    // SCOPED TO THE RETURNED OBJECT. Every one of these keys also appears in
    // the migration's own verify block as `v_sig->>'...'`, so asserting them
    // over the whole file passes with the key dropped from the result —
    // mutation-tested, it did.
    const from = sentinelSrc.indexOf('SELECT jsonb_build_object(');
    expect(from, 'the sentinel returns no jsonb_build_object').toBeGreaterThan(-1);
    const shape = sentinelSrc.slice(from, sentinelSrc.indexOf('$fn$;', from));
    for (const key of ['functions_scanned', 'inserters', 'offender_count', 'offenders']) {
      expect(shape).toContain(`'${key}'`);
    }
  });

  it('uses \\M and never \\b — Postgres regex has no word-boundary \\b', () => {
    // \b is a BACKSPACE in a Postgres regex, so a pattern using it silently
    // matches nothing and the sentinel reports a clean corpus forever. The
    // first draft of this audit returned an empty set for exactly that reason.
    const scan = sentinelSrc.slice(
      sentinelSrc.indexOf('CREATE OR REPLACE FUNCTION public.city_writer_signals'),
    );
    expect(scan).toContain('cities\\M');
    expect(scan).not.toContain('cities\\b');
  });

  it('exempts only city_resolve_or_create', () => {
    const scan = sentinelSrc.slice(
      sentinelSrc.indexOf('CREATE OR REPLACE FUNCTION public.city_writer_signals'),
    );
    expect(scan).toMatch(/proname\s*<>\s*'city_resolve_or_create'/);
    expect(scan).toMatch(/prosrc\s*!~\*\s*'city_resolve_or_create'/);
  });

  it('is service_role only', () => {
    // A DEFINER function granted to `authenticated` is granted to every member.
    expect(sentinelSrc).toMatch(
      /REVOKE ALL ON FUNCTION public\.city_writer_signals\(\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sentinelSrc).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.city_writer_signals\(\) TO service_role/,
    );
  });

  it('is asserted by the migration with a positive control on the scan', () => {
    const verify = sentinelSrc.slice(sentinelSrc.indexOf('DO $verify$'));
    // Anchored on the CONDITIONS, not on the text they print — a RAISE message
    // left intact while the `if` is neutered passes a needle-based assertion.
    expect(verify).toMatch(/functions_scanned'\)::int\s*<\s*100/);
    expect(verify).toMatch(/inserters'\)::int\s*<\s*1/);
    expect(verify).toMatch(/offender_count'\)::int\s*<>\s*0/);
  });
});

describe('the health script is wired to the sentinel', () => {
  const health = readFileSync(
    join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'),
    'utf8',
  );

  it('calls the RPC', () => {
    // Anchored on the fetch URL, not on the name — a name that also appears in
    // a comment satisfies a bare toContain while the call is gone.
    //
    // And anchored on the CLOSING BACKTICK: the bare path is a PREFIX of
    // `city_writer_signals_DISABLED`, so a renamed endpoint satisfies a plain
    // toContain. Same shape as `< 10000` matching `< 10000000`. Mutation-tested.
    expect(health).toMatch(/\/rest\/v1\/rpc\/city_writer_signals`/);
  });

  it('fails on an offender and on a broken probe, and only WARNs on 404', () => {
    const block = health.slice(health.indexOf('/rest/v1/rpc/city_writer_signals'));
    expect(block).toMatch(/res\.status === 404/);
    expect(block.slice(0, block.indexOf('\n}\n'))).toMatch(/FAILED = true/);
  });

  it('treats an empty scan and a missing key as failures, not as clean', () => {
    const block = health.slice(health.indexOf('/rest/v1/rpc/city_writer_signals'));
    expect(block).toMatch(/scanned < 100/);
    expect(block).toMatch(/inserters < 1/);
    expect(block).toMatch(/'offender_count' in cw/);
  });
});
