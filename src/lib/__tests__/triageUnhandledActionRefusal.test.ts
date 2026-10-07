/**
 * Guards 99991791361273 — an action a triage queue does not implement must
 * RAISE, not return {"ok": true}.
 *
 * `triage_action` builds its success object UNCONDITIONALLY after a 17-queue
 * CASE whose branches are `IF approve … ELSIF reject … [ELSIF reopen …] END
 * IF` with no ELSE. So `flag` (implemented in zero branches) and `reopen` (on
 * the ten queues whose approve is not reversible) reported success and wrote
 * nothing. Worst on dedup-review, whose approve performs a merge: measured
 * before the fix, 0 rows had ever returned to open, i.e. the Undo path had
 * never once worked while telling reviewers it had.
 *
 * EVERY SQL ASSERTION RUNS OVER COMMENT-STRIPPED TEXT. The migration's header
 * quotes the defect verbatim — including the words `flag`, `reopen`,
 * `can_reopen` and the phrase about falling through to the success object — so
 * an unstripped `toContain` passes against a file whose executable statements
 * have all been deleted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791361273_triage_action_unhandled_action_refusal.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const SRC = join(process.cwd(), 'src');

const raw = readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8');

/** Drops line-leading `--` comments only; a mid-line `--` would take code with it. */
const stripComments = (s: string) =>
  s
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const sql = stripComments(raw);

const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('99991791361273 is the file it claims to be', () => {
  it('exists exactly once in the migrations directory', () => {
    const hits = readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith('99991791361273_'));
    expect(hits).toEqual([MIGRATION]);
  });

  it('strips to a non-trivial body — the control for every assertion below', () => {
    // Without this, a file reduced to its header would satisfy nothing and
    // every `not.toContain` below would pass vacuously.
    expect(sql.length).toBeGreaterThan(1200);
    expect(sql).toContain('pg_get_functiondef');
  });
});

describe('the patch is a token substitution that refuses to guess', () => {
  it('reads the DEPLOYED definition rather than restating the CASE', () => {
    // The live body is not what any single repo file says — 99991790362096
    // patched it in place after 20260806140000 left the repo copy wrong for
    // three days. A CREATE OR REPLACE built from a repo file would revert it.
    expect(sql).toContain('pg_get_functiondef');
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION\s+public\.triage_action/i);
  });

  it('asserts its anchor occurs exactly once before substituting', () => {
    const occurrenceCheck = sql.match(
      /length\(v_new\)\s*-\s*length\(replace\(v_new,\s*v_anchor,\s*''\)\)/,
    );
    expect(occurrenceCheck).not.toBeNull();
    expect(sql).toMatch(/<>\s*1\s*then[\s\S]{0,200}?raise exception/i);
  });

  it('anchors on the success-object assignment, not on END CASE', () => {
    // `END CASE;` is one statement early: the fall-through lands AFTER it but
    // the guard must sit immediately before the thing it guards.
    expect(sql).toContain("v_anchor := E'  v_result := jsonb_build_object('");
  });

  it('is idempotent on a marker, so a re-run changes nothing', () => {
    expect(sql).toMatch(/if position\('unhandled_triage_action' in v_new\) > 0 then/);
  });
});

describe('both refusal arms RAISE', () => {
  // Asserting the CONDITION is not enough: replacing each RAISE with NULL
  // leaves every condition and every message string intact.
  it('refuses flag and skip', () => {
    expect(sql).toContain("IF p_action IN (''flag'', ''skip'') THEN");
    expect(sql).toContain("RAISE EXCEPTION ''% is not a decision this inbox records'', p_action");
  });

  it('refuses reopen on a queue the registry says cannot reopen', () => {
    expect(sql).toContain("IF p_action = ''reopen''");
    expect(sql).toContain(
      "RAISE EXCEPTION ''reopen is not supported for the % queue'', p_queue_type",
    );
  });

  it('raises 22023, the code the sibling refusals already use', () => {
    const arms = sql.match(/USING ERRCODE = ''22023''/g) ?? [];
    expect(arms.length).toBe(2);
  });
});

describe('the contract is the registry, not a list in the function', () => {
  it('reads capabilities.can_reopen', () => {
    expect(sql).toContain("capabilities->>''can_reopen''");
    expect(sql).toMatch(/FROM triage_sources WHERE queue_key = p_queue_type/);
  });

  it('fails CLOSED on a missing registry row', () => {
    // coalesce(..., false): a queue with no row is refused, not allowed. The
    // opposite default would make a registry gap silently permissive.
    expect(sql).toMatch(
      /coalesce\(\(SELECT \(capabilities->>''can_reopen''\)::boolean[\s\S]{0,160}?\), false\)/,
    );
  });

  it('hardcodes no queue list in the reopen arm', () => {
    // The search-drain sentinel was pinned to one slug out of ~240 by exactly
    // this shape. A literal queue name inside the guard is that again.
    const guardBlock = sql.slice(
      sql.indexOf('v_guard :='),
      sql.indexOf('v_new := replace(v_new, v_anchor'),
    );
    expect(guardBlock.length).toBeGreaterThan(200);
    for (const q of ['dedup-review', 'quality-city', 'editorial', 'tags']) {
      expect(guardBlock).not.toContain(q);
    }
  });
});

describe('postconditions assert the reached state', () => {
  const verify = sql.slice(sql.indexOf('do $verify$'));

  it('has a verify block', () => {
    expect(verify.length).toBeGreaterThan(400);
  });

  it('asserts the guard sits AFTER END CASE', () => {
    // Before the CASE it would preempt the tags / duplicates /
    // org-link-review branches, whose own 22023 messages explain WHY the
    // action is refused — a worse message from one place.
    expect(verify).toMatch(
      /position\('unhandled_triage_action' in v_src\) < position\(E'END CASE;' in v_src\)/,
    );
    expect(verify).toContain('P2 failed');
  });

  it('asserts both arms raise, and the registry read', () => {
    expect(verify).toContain('P3 failed');
    expect(verify).toContain('P4 failed');
  });

  it('asserts every active queue declares can_reopen', () => {
    expect(verify).toMatch(/active and \(capabilities->>'can_reopen'\) is null/);
    expect(verify).toContain('P5 failed');
  });

  it('pins the declared count to the seven queues with a real reopen arm', () => {
    expect(verify).toMatch(/v_rows <> 7/);
    expect(verify).toContain('P6 failed');
  });

  it('every postcondition raises rather than merely testing', () => {
    const conditions = verify.match(/\braise exception 'P\d/g) ?? [];
    expect(conditions.length).toBeGreaterThanOrEqual(7);
  });

  it('carries no short-circuit', () => {
    // `if false then` / `where false` would leave every string above matching
    // while the check had stopped checking.
    expect(verify).not.toMatch(/\bwhere false\b/i);
    expect(verify).not.toMatch(/\bif\s+false\s+then\b/i);
  });
});

describe('the UI stops offering what the RPC refuses', () => {
  it('canReopenFor exists and defaults to false', () => {
    const hook = read('hooks/useTriageSourceCapabilities.ts');
    expect(hook).toMatch(/canReopenFor:\s*\(queueKey: string\): boolean =>/);
    // `=== true` rather than a truthiness check, so `undefined` while loading
    // and an unknown queue both read false.
    expect(hook).toMatch(/\?\.can_reopen === true/);
  });

  it('handleUndo consults canReopenFor before sending a write', () => {
    const view = read('components/admin/triage/TriageView.tsx');
    expect(view).toMatch(/const \{ externalConsoleFor, canReopenFor \}/);
    expect(view).toMatch(/if \(!canReopenFor\(target\.queueType\)\)/);
    // And the refusal must return, not warn and continue.
    const undo = view.slice(view.indexOf('const handleUndo'));
    const gate = undo.slice(undo.indexOf('if (!canReopenFor(target.queueType))'));
    expect(gate.slice(0, 400)).toMatch(/return;/);
  });

  it('arms undo only for a reopenable queue', () => {
    const view = read('components/admin/triage/TriageView.tsx');
    // The second gate is the one that matters: without it the U key is offered
    // after an irreversible merge and the backstop above is all that stands
    // between the reviewer and a false "Reopened".
    expect(view).toMatch(
      /\(action === 'approve' \|\| action === 'reject'\) &&\s*\n?\s*canReopenFor\(activeItem\.queue_type\)/,
    );
  });

  it('includes canReopenFor in both callbacks dependency lists', () => {
    const view = read('components/admin/triage/TriageView.tsx');
    // A stale closure here reads the capabilities of whatever queue was
    // selected when the callback was built.
    expect(view).toMatch(/\[activeItem, answers, externalConsoleFor, canReopenFor,/);
    expect(view).toMatch(/\[lastActed, canReopenFor, triageAction\]/);
  });
});

describe('flag is gone from every executable path', () => {
  const files = [
    'components/admin/triage/TriageView.tsx',
    'components/admin/triage/ActionBar.tsx',
    'components/admin/triage/useTriageKeyboard.ts',
    'components/admin/triage/resolveDecision.ts',
    'hooks/useUnifiedTriageQueue.ts',
  ];

  it('no file carries an onFlag prop or an f binding', () => {
    for (const f of files) {
      const body = stripTs(read(f));
      expect(body, f).not.toMatch(/\bonFlag\b/);
      expect(body, f).not.toMatch(/\bf:\s*onFlag\b/);
    }
  });

  it("no file sends the literal 'flag' as an action", () => {
    for (const f of files) {
      const body = stripTs(read(f));
      expect(body, f).not.toMatch(/'flag'/);
    }
  });

  it('TriageAction and TriageActionType no longer admit it', () => {
    expect(stripTs(read('components/admin/triage/resolveDecision.ts'))).toMatch(
      /export type TriageAction = 'approve' \| 'reject' \| 'skip';/,
    );
    expect(stripTs(read('hooks/useUnifiedTriageQueue.ts'))).toMatch(
      /export type TriageActionType = 'approve' \| 'reject' \| 'skip' \| 'reopen';/,
    );
  });

  it('the Flag button is not rendered', () => {
    const bar = stripTs(read('components/admin/triage/ActionBar.tsx'));
    expect(bar).not.toMatch(/data-triage-action="flag"/);
    // The lucide import must go with it, or the icon sits unused.
    expect(bar).not.toMatch(/\bFlag\b/);
  });

  it('skip SURVIVES — it is navigation, not a dropped decision', () => {
    // The cheap way to make every assertion above pass is to delete the whole
    // action bar. Skip is client-side only (TriageView intercepts it before
    // the RPC) and must still be offered.
    const bar = stripTs(read('components/admin/triage/ActionBar.tsx'));
    expect(bar).toMatch(/data-triage-action="skip"/);
    expect(bar).toMatch(/data-triage-action="approve"/);
    expect(bar).toMatch(/data-triage-action="reject"/);
    const kb = stripTs(read('components/admin/triage/useTriageKeyboard.ts'));
    expect(kb).toMatch(/s:\s*onSkip/);
    expect(kb).toMatch(/a:\s*onApprove/);
  });
});

describe('the success toast reads as English', () => {
  it('uses a past-tense map rather than action + "d"', () => {
    const view = stripTs(read('components/admin/triage/TriageView.tsx'));
    expect(view).toMatch(/ACTION_PAST_TENSE: Record<TriageAction, string>/);
    expect(view).toMatch(/approve: 'Approved'/);
    expect(view).toMatch(/reject: 'Rejected'/);
    expect(view).toMatch(/skip: 'Skipped'/);
    // The defect itself: `${action}d` gave "rejectd" and "skipd".
    expect(view).not.toMatch(/\$\{action\}d/);
    expect(view).toMatch(/\$\{ACTION_PAST_TENSE\[action\]\}/);
  });
});

/** Drops `//` lines and `/* *\/` blocks — these files document the defect verbatim. */
function stripTs(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}
