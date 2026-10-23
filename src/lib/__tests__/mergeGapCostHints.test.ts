import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991792753750_merge_gap_cost_hints.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// The header quotes the plan, the default cost and the words "enabled=false", so an
// unstripped `toContain` passes with every executable statement deleted. Strip
// line-LEADING comments only; a mid-line `--` would take the executable half with it.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const verifyBlock = (() => {
  const a = sql.indexOf('do $verify$');
  const b = sql.indexOf('end $verify$;');
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return sql.slice(a, b);
})();

/** The three ALTER statements, excluding the verify block. */
const alters = sql.slice(0, sql.indexOf('do $verify$'));

describe('merge_gap_* cost hints', () => {
  it('raises the cost of all three functions in the chain', () => {
    // The selector calls patch, which calls fill, which calls empty. Leaving any of
    // them at the default lets the planner pick that one as a cheap filter instead.
    expect(alters).toMatch(
      /alter function public\.merge_gap_patch\(text, jsonb, jsonb\)\s+cost\s+(\d+);/,
    );
    expect(alters).toMatch(/alter function public\.merge_gap_fill\(jsonb, jsonb\)\s+cost\s+(\d+);/);
    expect(alters).toMatch(/alter function public\.merge_gap_empty\(jsonb\)\s+cost\s+(\d+);/);
    expect(alters.match(/alter function public\.merge_gap_\w+\(/g) ?? []).toHaveLength(3);
  });

  it('puts every cost above the default 100, in call-nesting order', () => {
    const cost = (fn: string) => {
      const m = alters.match(
        new RegExp(`alter function public\\.${fn}\\([^)]*\\)\\s+cost\\s+(\\d+);`),
      );
      expect(m).not.toBeNull();
      return Number(m![1]);
    };
    const patch = cost('merge_gap_patch');
    const fill = cost('merge_gap_fill');
    const empty = cost('merge_gap_empty');
    // Above the default, or the plan can regress to the Seq Scan join filter.
    for (const c of [patch, fill, empty]) expect(c).toBeGreaterThan(100);
    // Ordered by nesting: the outer call must never look cheaper than its callees.
    expect(patch).toBeGreaterThan(fill);
    expect(fill).toBeGreaterThan(empty);
  });

  it('changes only the cost -- no body, no volatility, no security mode', () => {
    // A cost hint is a planner statement. Rewriting a body in a SECURITY DEFINER
    // merge path is a different, much larger change, and concurrent work is live there.
    // Scoped to the ALTER statements, NOT the whole file: the verify block
    // legitimately says "no longer IMMUTABLE/INVOKER" in its own P3 message, and a
    // file-wide ban matches that and fails on correct code.
    expect(alters).not.toMatch(/create or replace function/i);
    expect(alters).not.toMatch(/\bsecurity (definer|invoker)\b/i);
    expect(alters).not.toMatch(/\b(immutable|stable|volatile)\b/i);
    expect(alters).not.toMatch(/\breset\s+all\b/i);
    // The one that genuinely must hold file-wide: no body is restated anywhere.
    expect(sql).not.toMatch(/create or replace function/i);
  });
});

describe('postconditions', () => {
  it('rejects any of the three still sitting at or below the default', () => {
    expect(verifyBlock).toMatch(/if v_cost <= 100 then/);
    expect(verifyBlock).toMatch(/raise exception 'P1 failed/);
  });

  it('counts exactly three functions, so a missing one cannot pass silently', () => {
    // Without this, a loop over a set that lost a function reports clean.
    expect(verifyBlock).toMatch(/if v_bad <> 3 then/);
  });

  it('asserts the ordering, not merely "above default"', () => {
    expect(verifyBlock).toMatch(/raise exception 'P2 failed: merge_gap_patch must cost more/);
    expect(verifyBlock).toMatch(/raise exception 'P2 failed: merge_gap_fill must cost more/);
  });

  it('proves the hint did not change what the functions are', () => {
    expect(verifyBlock).toMatch(/p\.provolatile <> 'i' or p\.prosecdef is true/);
    expect(verifyBlock).toMatch(/raise exception 'P3 failed/);
  });

  it('does not re-enable the paused automation, and only NOTICEs if it is on', () => {
    // Re-enabling is an operator step needing the cron recreated and the sync's
    // `recreated` list read. A RAISE here would also abort db push for the repo
    // the moment someone legitimately re-enables it.
    expect(sql).not.toMatch(/update\s+public\.admin_automations/i);
    expect(sql).not.toMatch(/enabled\s*=\s*true/i);
    expect(sql).not.toMatch(/cron\.(schedule|alter_job|unschedule)/i);
    expect(verifyBlock).toMatch(/raise notice/);
  });

  it('cannot be short-circuited by a constant predicate', () => {
    expect(verifyBlock).not.toMatch(/\bif\s+(true|false)\b/i);
    expect(verifyBlock).not.toMatch(/where\s+false\b/i);
  });

  it('pins no millisecond figure as a threshold', () => {
    // 2793 and 120000 were the measurement; either in a condition would make this
    // file fail on a loaded instance and abort db push for everything queued.
    for (const n of ['2793', '120000', '93202', '181613']) {
      expect(verifyBlock).not.toContain(n);
    }
  });
});
