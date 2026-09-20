import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for 99991789897891_venue_closure_decision_funnel.sql.
 *
 * `run_venue_closure_decision` returned `close_eligible: 0` nightly while
 * booking last_run_status='success', and that zero has two opposite meanings
 * that print identically — "everything closable is closed" and "the selector
 * cannot see anything". Measured on prod it was the second: 84 broken-URL
 * venues in the pool, 21 of them stale, and all 21 vetoed by `is_featured`.
 *
 * What must not rot:
 *   1. the funnel keys stay in BOTH return paths (dry-run and live) — a
 *      summary that explains itself only in dry-run is useless to the cron,
 *      which never passes p_dry_run;
 *   2. the pool and the candidate set stay derived from ONE temp table, so a
 *      later edit cannot count the vetoes over a different set than the one
 *      the write uses;
 *   3. the `is_featured` veto stays. The migration's header records why the
 *      tempting fix — clearing the flag on 671 foursquare rows — was refused,
 *      and a later pass that "unblocks" the engine by deleting the veto would
 *      auto-close venues an import may have deliberately promoted.
 *
 * Assertions run against COMMENT-STRIPPED SQL: the header names every funnel
 * key and quotes the veto, so a bare toContain over the raw file passes with
 * the implementation gutted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FN = 'run_venue_closure_decision';

/** Latest migration defining the function, so a later restatement is what is
 *  checked rather than this one forever. */
function latestDefinition(): string {
  const hit = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) =>
      readFileSync(join(MIGRATIONS, f), 'utf8').includes(`CREATE OR REPLACE FUNCTION public.${FN}`),
    )
    .pop();
  if (!hit) throw new Error(`no migration defines ${FN}`);
  return readFileSync(join(MIGRATIONS, hit), 'utf8');
}

function statements(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

/** The function body only — excludes the trailing do $verify$ block, which
 *  quotes several of the same keys and would satisfy assertions about the
 *  implementation. */
function fnBody(sql: string): string {
  const from = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${FN}`);
  const to = sql.indexOf('DO $verify$', from);
  expect(from).toBeGreaterThan(-1);
  return to > from ? sql.slice(from, to) : sql.slice(from);
}

const FUNNEL_KEYS = [
  'pool',
  'held_not_yet_stale',
  'held_featured',
  'held_engagement',
  'held_open_review',
] as const;

describe('venue closure decision reports why the pool is empty', () => {
  const src = statements(latestDefinition());
  const body = fnBody(src);

  it('emits every funnel key from BOTH return paths', () => {
    // The cron never passes p_dry_run, so a funnel that only appears in the
    // dry-run branch explains nothing to the job that actually runs nightly.
    const returns = body.match(/jsonb_build_object\(\s*'dry_run'[\s\S]*?\);/g) ?? [];
    expect(returns).toHaveLength(2);
    for (const ret of returns) {
      for (const k of FUNNEL_KEYS) {
        expect(ret).toContain(`'${k}'`);
      }
    }
  });

  it('derives the candidate set FROM the pool, not from a second predicate', () => {
    // One predicate. If _vcd_cand is rebuilt by re-stating the venues query,
    // the funnel and the write can drift and the counts stop describing the
    // rows that actually get closed.
    expect(body).toMatch(/create temp table _vcd_cand[\s\S]*?from _vcd_pool/);
    // The CANDIDATE-defining predicate exists exactly once. Scoped to the
    // pair that defines candidacy rather than to `from public.venues`, which
    // the pre-existing reopen block legitimately uses for its own UPDATE —
    // the first draft of this assertion matched that and failed on correct
    // code.
    const candidatePredicate =
      body.match(/closure_status\s*=\s*'open'\s+and\s+v\.url_status\s*=\s*'broken'/g) ?? [];
    expect(candidatePredicate).toHaveLength(1);
  });

  it('counts the vetoes over _vcd_pool', () => {
    expect(body).toMatch(/count\(\*\) filter \(where veto_featured\)[\s\S]*?from _vcd_pool/);
  });

  it('keeps the is_featured veto', () => {
    // Deliberately kept: 671 of 673 featured venues came from one foursquare
    // import, but they are real queer venues and nothing records whether the
    // promotion was intentional. Removing the veto auto-closes them.
    expect(body).toMatch(/veto_featured/);
    expect(body).toMatch(/not p\.veto_featured/);
  });

  it('keeps all four vetoes in the candidate filter', () => {
    for (const v of ['veto_fresh', 'veto_featured', 'veto_engaged', 'veto_review']) {
      expect(body).toMatch(new RegExp(`not p\\.${v}\\b`));
    }
  });

  it('asserts a relationship, not tonight numbers, in the verify block', () => {
    // A migration that pins pool=84 goes red the first time a URL recovers.
    const verify = src.slice(src.indexOf('DO $verify$'));
    expect(verify).toMatch(/close_eligible[\s\S]{0,80}>[\s\S]{0,40}pool/);
    expect(verify).not.toMatch(/=\s*84\b|=\s*21\b|=\s*65\b/);
  });

  it('does not clear is_featured anywhere', () => {
    // The refused fix. If a later edit adds it, this migration's stated
    // reasoning and its behaviour have parted company.
    expect(src).not.toMatch(/update\s+public\.venues[\s\S]{0,200}set[\s\S]{0,120}is_featured\s*=/i);
  });
});
