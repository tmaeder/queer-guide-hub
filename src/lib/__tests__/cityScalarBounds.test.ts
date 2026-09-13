import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The physical bounds on city scalars exist in TWO languages and must agree.
 *
 *   TypeScript  supabase/functions/_shared/city-scalar-bounds.ts
 *               ONE definition, imported by both writers — the staging validator
 *               (`venue-pipeline-utils`) and the direct-write producer
 *               (`city-factual-backfill`, which is where all 181 bad areas came
 *               from; `pipeline-validate` never sees that path).
 *   SQL         public.city_scalar_defects()
 *               the corpus gate.
 *
 * If they drift, the gate and the producers disagree about what a defect is, and
 * the likely shape of that disagreement is the dangerous one: a loosened TS bound
 * admits rows SQL still counts, CI goes red for rows the pipeline thinks are
 * fine, and the usual fix for a red CI is to raise the baseline. That is how a
 * bound gets quietly deleted.
 *
 * THIS FILE'S FIRST VERSION WAS COMMENT-SATISFIABLE. It asserted
 * `sql.includes('-500')` against the whole migration, and the migration header
 * says "-500 m" in prose — so deleting `e < -500 or` from the predicate left the
 * test green. Everything below reads the FUNCTION BODY with comments stripped.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const TS_BOUNDS = join(ROOT, 'supabase', 'functions', '_shared', 'city-scalar-bounds.ts');
const HEALTH_SCRIPT = join(ROOT, 'scripts', 'check-pipeline-health.mjs');

function latestMigrationContaining(needle: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => readFileSync(join(MIGRATIONS, f), 'utf8').includes(needle));
  expect(files.length, `no migration contains ${needle}`).toBeGreaterThan(0);
  return readFileSync(join(MIGRATIONS, files[files.length - 1]), 'utf8');
}

/** The executable body of city_scalar_defects(), with SQL comments removed. */
function defectsFunctionBody(): string {
  const sql = latestMigrationContaining('function public.city_scalar_defects()');
  const m = /as \$function\$([\s\S]*?)\$function\$/.exec(sql);
  expect(m, 'could not extract the city_scalar_defects body').not.toBeNull();
  return m![1]
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

function tsConstant(name: string): number {
  const src = readFileSync(TS_BOUNDS, 'utf8');
  const m = new RegExp(`export const ${name} = (-?[0-9_.e+]+)`).exec(src);
  expect(m, `${name} not exported from city-scalar-bounds.ts`).not.toBeNull();
  return Number(m![1].replace(/_/g, ''));
}

describe('city scalar bounds: SQL and TypeScript agree', () => {
  const body = defectsFunctionBody();

  it.each([
    ['MAX_CITY_AREA_KM2', 200000],
    ['MIN_ELEVATION_M', -500],
    ['MAX_ELEVATION_M', 5300],
    ['MAX_DENSITY_PER_KM2', 50000],
  ])('%s is %i in both the TS module and the SQL predicate', (name, expected) => {
    expect(tsConstant(name)).toBe(expected);
    // Against the comment-stripped BODY, so prose in the header cannot satisfy it.
    expect(
      body.includes(String(expected)),
      `${name} = ${expected} does not appear in the executable body of city_scalar_defects()`,
    ).toBe(true);
  });

  it('MAX_COUNTRY_AREA_KM2 clears every published figure for Russia', () => {
    // Pinned exactly to Wikidata's 17,098,246 in the first draft, which left no
    // headroom and flagged Russia on a Rosstat-sourced record.
    expect(tsConstant('MAX_COUNTRY_AREA_KM2')).toBeGreaterThan(17_125_191);
  });

  it('there is exactly one TypeScript definition of each bound', () => {
    // Two copies is how the gate and the producer drift apart. Both writers must
    // import, not redeclare.
    for (const f of ['venue-pipeline-utils.ts', 'city-factual-backfill/index.ts']) {
      const p = f.includes('/')
        ? join(ROOT, 'supabase', 'functions', f)
        : join(ROOT, 'supabase', 'functions', '_shared', f);
      const src = readFileSync(p, 'utf8');
      expect(src, `${f} must import the bounds, not redeclare them`).toMatch(
        /city-scalar-bounds\.ts/,
      );
      expect(src).not.toMatch(/const MAX_CITY_AREA_KM2\s*=/);
      expect(src).not.toMatch(/const MAX_DENSITY_PER_KM2\s*=/);
    }
  });
});

describe('city scalar bounds never reject an entity', () => {
  const utils = readFileSync(
    join(ROOT, 'supabase', 'functions', '_shared', 'venue-pipeline-utils.ts'),
    'utf8',
  );

  it('the scalar codes are warnings, never errors', () => {
    // pipeline-validate turns any `errors` entry into 'rejected', and the
    // human-approval trigger promotes only 'pending'/'needs_review' — a hard
    // rejection can never be overridden. An error here would discard the whole
    // staged city because one number was wrong.
    for (const code of ['W_IMPLAUSIBLE_AREA', 'W_IMPLAUSIBLE_ELEVATION', 'W_IMPLAUSIBLE_DENSITY']) {
      expect(utils).toContain(`warnings.push('${code}')`);
      expect(utils).not.toContain(`errors.push('${code}')`);
    }
    // And the E_ spellings must not come back under any name.
    expect(utils).not.toMatch(/errors\.push\('E_IMPLAUSIBLE_/);
  });

  it('the real producer checks plausibility before writing', () => {
    // The 181 bad areas came from city-factual-backfill's direct UPDATE, not
    // from the staging validator. A guard only in the validator would have
    // stopped none of them.
    const producer = readFileSync(
      join(ROOT, 'supabase', 'functions', 'city-factual-backfill', 'index.ts'),
      'utf8',
    );
    expect(producer).toContain('plausibleCityScalar');
    // Rejections must be counted, not silently dropped.
    expect(producer).toContain('implausible_scalars_rejected');
  });
});

describe('the repair never recomputes a retracted value', () => {
  const repair = readdirSync(MIGRATIONS)
    .filter((f) => f.includes('repair_city_scalar_defects'))
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');

  it('writes NULL, never an arithmetic correction', () => {
    // 58% of the impossible areas are a clean factor of 1e6, which makes "just
    // divide" tempting; the other 42% would acquire a plausible wrong number.
    expect(repair.length, 'repair migration not found').toBeGreaterThan(0);
    expect(repair).toMatch(/area_km2\s*=\s*case when t\.bad_area then null/);
    expect(repair).not.toMatch(/area_km2\s*=[^;]*\/\s*1e6/);
    expect(repair).not.toMatch(/area_km2\s*=[^;]*\/\s*1000000/);
  });

  it('preserves what it removes and guards the jsonb concatenation', () => {
    expect(repair).toContain("'retracted'");
    // `a || b` RAISES when either side is a scalar and silently produces an
    // array when either is an array; field_provenance has several writers.
    expect(repair).toContain('_jsonb_obj');
  });

  it('drains in a loop rather than capping a single statement', () => {
    // A bare `limit 300` plus the zero-assertion is self-blocking: >300 rows
    // makes the migration unapplyable instead of re-runnable.
    expect(repair).toMatch(/loop/i);
    expect(repair).toMatch(/order by id/i);
  });
});

/**
 * Positive control for check-pipeline-health §11b.
 *
 * The section's key-presence check was labelled "positive control" and is not
 * one — it proves the probe returns the right keys, not that the gate reports a
 * real defect. This runs the ACTUAL script against stubbed fetch responses and
 * asserts the section's behaviour in each state. Without it, §11b could be
 * gutted and nothing in CI would notice.
 */
describe('check-pipeline-health §11b behaviour', () => {
  const MARKERS =
    /physically impossible city|Density defects|cities: area <=|cities: elevation <|cities: city more populous|city_scalar_defects/;

  function runWith(fixture: unknown, status = 200): string {
    const dir = mkdtempSync(join(tmpdir(), 'csd-'));
    const stub = join(dir, 'stub.mjs');
    writeFileSync(
      stub,
      `const ok=(b)=>new Response(JSON.stringify(b),{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async(u)=>{const s=String(u);
if(s.includes('city_scalar_defects')){return ${status} === 200 ? ok(${JSON.stringify(fixture)}) : new Response('{}',{status:${status}});}
if(s.includes('/rpc/'))return ok({});return ok([]);};`,
    );
    try {
      return execFileSync(process.execPath, ['--import', stub, HEALTH_SCRIPT], {
        encoding: 'utf8',
        env: { ...process.env, SUPABASE_URL: 'https://stub', SUPABASE_SERVICE_ROLE_KEY: 'stub' },
      });
    } catch (e: unknown) {
      // The script exits 1 when any section fails; other sections fail against
      // empty stubs, so the exit code is not the signal — the §11b lines are.
      return String((e as { stdout?: string }).stdout ?? '');
    }
  }

  const clean = {
    area_impossible: 0,
    elevation_impossible: 0,
    population_exceeds_country: 0,
    density_impossible: 33,
    retracted_pending_refill: 181,
    samples: {},
  };
  const sectionLines = (out: string) => out.split('\n').filter((l) => MARKERS.test(l));

  it('reports no failure on a clean corpus', () => {
    const lines = sectionLines(runWith(clean));
    expect(lines.some((l) => l.includes('✗'))).toBe(false);
    expect(lines.some((l) => l.includes('No physically impossible'))).toBe(true);
  });

  it('FAILS on a real defect — the actual positive control', () => {
    const lines = sectionLines(
      runWith({ ...clean, area_impossible: 7, population_exceeds_country: 2 }),
    );
    expect(lines.filter((l) => l.includes('✗')).length).toBe(2);
  });

  it('FAILS on a renamed key rather than reading it as clean', () => {
    const { population_exceeds_country: _drop, ...renamed } = clean;
    const lines = sectionLines(runWith(renamed));
    expect(lines.some((l) => l.includes('✗') && l.includes('missing'))).toBe(true);
  });

  it('warns but does not fail when the RPC is not yet deployed (404)', () => {
    const lines = sectionLines(runWith(clean, 404));
    expect(lines.some((l) => l.includes('⚠') && l.includes('NOT DEPLOYED'))).toBe(true);
    expect(lines.some((l) => l.includes('✗'))).toBe(false);
  });

  it('FAILS on a broken probe (5xx) instead of failing open', () => {
    const lines = sectionLines(runWith(clean, 500));
    expect(lines.some((l) => l.includes('✗'))).toBe(true);
  });

  it('does not fail when density rises — it is advisory by design', () => {
    // The repair guarantees density rises as retracted areas refill; a ratchet
    // here would red the build with no legal response.
    const lines = sectionLines(runWith({ ...clean, density_impossible: 99 }));
    expect(lines.some((l) => l.includes('✗'))).toBe(false);
    expect(lines.some((l) => l.includes('Density defects: 99'))).toBe(true);
  });
});
