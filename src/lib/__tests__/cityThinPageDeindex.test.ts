import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991793309362_city_thin_page_deindex';
const root = resolve(__dirname, '../../..');
const raw = readFileSync(resolve(root, `supabase/migrations/${MIGRATION}.sql`), 'utf8');

// The header quotes every phrase asserted below, including the anchors it replaces, so an
// unstripped match passes with the statement deleted. Strip line-start comments only.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

// Both halves of this migration quote the very strings they assert about: patch 4's anchor
// contains the ghost-restore line it replaces, and postcondition P6 quotes
// `WHEN is_thin THEN 'ghost'` in order to assert its ABSENCE. A match over the whole file
// therefore reads the anchor or the postcondition instead of the replacement, and fails on
// correct code. Scope to the patch block, and to patch 4's replacement for the ordering.
const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('end $patch$'));
const patch4 = patch.slice(patch.lastIndexOf("v_to := E'           WHEN is_empty THEN false"));

const baseline = JSON.parse(
  readFileSync(resolve(root, 'scripts/city-quality-baseline.json'), 'utf8'),
);

describe(`${MIGRATION} — thin city pages stop publishing`, () => {
  it('PATCHES the classifier instead of restating it', () => {
    // The live body has evolved past its newest migration file (its own comments cite
    // 99991791920004). A full restate would revert whoever wrote that.
    expect(sql).toContain('pg_get_functiondef');
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.run_city_trust_recompute/i);
  });

  it('asserts each anchor matches EXACTLY once, so a drifted body fails loudly', () => {
    // Four patches, four exactly-once guards. A silent mis-patch is worse than a failed push.
    expect(sql.match(/<>\s*1\s+then\s+raise exception 'patch/g) ?? []).toHaveLength(4);
  });

  it('deindexes a thin city and leaves shell_status alone', () => {
    expect(patch4).toContain('WHEN is_thin THEN false');
    // A thin city HAS content, so it is `real`. Routing it to ghost would inflate the very
    // CITY_GHOST_HAS_LIVE_CHILDREN counter the second arm drives to zero. Scoped to the patch
    // block: P6 quotes this exact string to assert it is absent from the function.
    expect(patch).not.toMatch(/WHEN is_thin THEN ''ghost''/);
  });

  it('tests is_thin BEFORE the ghost restore — the order is load-bearing', () => {
    // `WHEN shell_status = 'ghost' THEN true` republishes a ghost that gained content. A ghost
    // gaining ONE venue must not come back thin, so is_thin has to win.
    const thin = patch4.indexOf('WHEN is_thin THEN false');
    const ghost = patch4.indexOf("WHEN shell_status = ''ghost'' THEN true");
    expect(thin).toBeGreaterThan(-1);
    expect(ghost).toBeGreaterThan(-1);
    expect(thin).toBeLessThan(ghost);
  });

  it('bounds the thin count with LIMIT 5 — the arm scans every description-less city', () => {
    expect(sql).toMatch(/LIMIT 5\) t\) < 5/);
  });

  it('re-opens a ghost that regained children (the mirror of the fillable-gap arm)', () => {
    // Gaining the first venue or event never writes the city row, so 51 of 53 such cities were
    // unreachable by the three pre-existing scope arms.
    expect(sql).toMatch(/OR \(c\.shell_status = ''ghost''/);
  });

  it('raises the snapshot writer’s statement_timeout', () => {
    // The gate reads a STORED snapshot. Without this the snapshot stays frozen and no data fix
    // can ever reach the gate.
    expect(sql).toMatch(
      /alter function public\.run_city_quality_issue_sync\(integer\) set statement_timeout = '300s'/i,
    );
  });

  it('EXECUTES the patched function in its own postcondition', () => {
    // CREATE OR REPLACE only parses a plpgsql body; a broken query inside fails at CALL time.
    // A clean db push proves nothing on its own.
    expect(sql).toMatch(/perform public\.run_city_trust_recompute\(false\)/);
  });
});

describe('city-quality baseline moves only where the repair cannot reach', () => {
  const r = baseline.revisions.at(-1);

  it('records a 2026-10-29 revision with a derivation for every raise', () => {
    expect(r.revised_at).toBe('2026-10-29T00:00:00Z');
    expect(Object.keys(r.raised).sort()).toEqual([
      'issues.CITY_IDENTITY_AMBIGUOUS',
      'operations.unlinked_events',
      'publication_blocked',
    ]);
    expect(r.reason.length).toBeGreaterThan(1500);
  });

  it('holds the three raised ceilings at or above the measured post-fix values', () => {
    // Measured in a rolled-back transaction against the LIVE scorecard, after the patch.
    expect(baseline.issues.CITY_IDENTITY_AMBIGUOUS).toBeGreaterThanOrEqual(938);
    expect(baseline.publication_blocked).toBeGreaterThanOrEqual(1173);
    expect(baseline.operations.unlinked_events).toBeGreaterThanOrEqual(2024);
  });

  it('does NOT raise what the repair fixed or what already self-healed', () => {
    // 53 -> 2 under its own ceiling, and wrong-subject reads 0 live despite the stale
    // snapshot reporting 5. A counter the repair closes is never renegotiated.
    expect(baseline.issues.CITY_GHOST_HAS_LIVE_CHILDREN).toBe(8);
    expect(baseline.issues.CITY_DESCRIPTION_WRONG_SUBJECT).toBe(2);
  });

  it('keeps every zero-invariant at zero', () => {
    // "A zero-invariant gets repaired, never renegotiated." — this file, 2026-09-29.
    for (const code of [
      'CITY_LINK_NAMESAKE',
      'CITY_LINK_COUNTRY_MISMATCH',
      'CITY_DUPLICATE_UNRESOLVED',
      'CITY_GHOST_EXPOSED',
      'CITY_PLACEHOLDER_EXPOSED',
    ])
      expect(baseline.issues[code]).toBe(0);
  });
});
