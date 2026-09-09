import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Kept on ONE line: `@ts-expect-error` suppresses the next LINE, and TS7016 for an
// untyped .mjs is reported at the module specifier. Same trap as
// recoverMigrationDrift.test.ts.
// @ts-expect-error — .mjs script lib, no type declarations
import { TERMINAL_PARK_ERROR, classifyParkedQueue } from '../../../scripts/lib/geo-address-queue.mjs';

/**
 * Guards the parked-queue classification in check-pipeline-health.mjs.
 *
 * THE DEFECT. The rule was `geo_hygiene_stats().address_queue.parked > 0 → ✗`.
 * Measured on prod 2026-09-09: 2,537 parked rows, every one carrying
 * `last_error = 'no_postal_for_coordinates'` — Photon answering that no postcode
 * exists for those coordinates (venue 2102, event 343, hotel 71, organization 21).
 * Those rows can never succeed, so the ✗ was permanent; the workflow had failed
 * six days running and a genuine wrong-entity regression sat unread underneath it.
 *
 * THE RISK IN FIXING IT is that the check stops having teeth. Every assertion below
 * therefore comes in a pair: the benign shape must warn, and the failing shape must
 * still fail. The script itself needs live service-role credentials, so this pure
 * module is the only place the branching can be exercised at all.
 */
describe('classifyParkedQueue', () => {
  it('does not fail on a queue that is entirely terminal negatives', () => {
    // The exact prod shape on 2026-09-09.
    const v = classifyParkedQueue({
      total: 2537,
      terminal: 2537,
      transient: 0,
      terminal_entity_types: { venue: 2102, event: 343, hotel: 71, organization: 21 },
      transient_errors: {},
      oldest_transient_hours: null,
    });
    expect(v.level).toBe('warn');
    expect(v.message).toContain('2537');
    expect(v.message).toContain(TERMINAL_PARK_ERROR);
  });

  it('FAILS on a transient parked row — one is enough, no threshold', () => {
    // The teeth. A single row that reached attempts>=4 through the drain's catch
    // branch is a real failure and must exit 1.
    const v = classifyParkedQueue({
      total: 1,
      terminal: 0,
      transient: 1,
      terminal_entity_types: {},
      transient_errors: { 'HTTP 500': 1 },
      oldest_transient_hours: 3,
    });
    expect(v.level).toBe('fail');
    expect(v.message).toContain('HTTP 500');
  });

  it('FAILS on transient rows even when terminal rows vastly outnumber them', () => {
    // The regression the old rule would have caught and a naive "ignore parked"
    // fix would not: 2,000 rows parked on HTTP 500 hiding inside a benign backlog.
    const v = classifyParkedQueue({
      total: 4537,
      terminal: 2537,
      transient: 2000,
      terminal_entity_types: { venue: 2102 },
      transient_errors: { 'HTTP 500': 2000 },
      oldest_transient_hours: 48,
    });
    expect(v.level).toBe('fail');
    expect(v.message).toContain('2000');
  });

  it('counts a parked row with NO last_error as transient, not benign', () => {
    // Postgres side uses `is distinct from`, so NULL lands in the transient arm.
    // An unexplained park must fail loudly rather than be absorbed into the
    // "Photon said no" bucket — that absorption is how this class of defect hides.
    const v = classifyParkedQueue({
      total: 1, terminal: 0, transient: 1,
      terminal_entity_types: {}, transient_errors: { '(null)': 1 }, oldest_transient_hours: 1,
    });
    expect(v.level).toBe('fail');
  });

  it('reports an empty queue as ok', () => {
    const v = classifyParkedQueue({
      total: 0, terminal: 0, transient: 0,
      terminal_entity_types: {}, transient_errors: {}, oldest_transient_hours: null,
    });
    expect(v.level).toBe('ok');
  });

  it('FAILS when the envelope is absent — absent is not zero', () => {
    // An undeployed or unreadable sentinel must never read as a clean corpus.
    for (const absent of [null, undefined, 'nope', 42]) {
      expect(classifyParkedQueue(absent).level).toBe('fail');
    }
  });

  it('FAILS when the split keys are missing — a pre-migration shape is UNCLASSIFIED', () => {
    // The old `{depth, parked, oldest_hours}` envelope. Falling through to "ok"
    // here would silently disarm the check on any deploy where the migration has
    // not landed yet.
    const v = classifyParkedQueue({ depth: 2537, parked: 2537, oldest_hours: 900 });
    expect(v.level).toBe('fail');
    expect(v.message).toContain('20360901100100');
  });
});

/**
 * Structural guards on the SQL half. The classifier above is only as good as the
 * split it is fed, and the discriminator lives in Postgres.
 */
describe('geo_address_queue_parked() migration', () => {
  const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
  const sql = (() => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().reverse();
    const hit = files.find((f) =>
      readFileSync(join(MIGRATIONS, f), 'utf8').includes('function public.geo_address_queue_parked'),
    );
    if (!hit) throw new Error('no migration defines geo_address_queue_parked');
    return readFileSync(join(MIGRATIONS, hit), 'utf8');
  })();

  // Comments in this repo are long and explanatory, and a text assertion that a
  // guard exists is satisfiable by the prose describing it. Strip comments first.
  const code = sql.replace(/^\s*--.*$/gm, '');

  it('puts a NULL last_error in the transient arm', () => {
    expect(code).toMatch(/last_error\s+is\s+distinct\s+from\s+'no_postal_for_coordinates'/i);
  });

  it('only looks at rows the drain has actually parked', () => {
    expect(code).toMatch(/attempts\s*>=\s*4/);
  });

  it('names the transient errors rather than only counting them', () => {
    expect(code).toContain('transient_errors');
  });

  it('asserts the two arms partition the parked set at deploy time', () => {
    expect(code).toMatch(/do not partition parked rows/i);
  });
});
