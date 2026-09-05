import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `source-*` edge function is invoked by pg_cron or by pipeline-executor,
 * neither of which carries a user JWT. Without a `[functions.<name>]
 * verify_jwt = false` block in `supabase/config.toml` the platform gate rejects
 * the call before the function's own auth ever runs.
 *
 * Measured 2026-09-04: THIRTEEN source functions had no entry at all. They kept
 * working only because their registered cron command happens to send an anon-key
 * Bearer, which satisfies the platform gate by accident. Two consequences, both
 * bad: any invocation path without that header 401s, and rotating the anon key
 * would break every one of them simultaneously.
 *
 * A 401 is the worst possible failure here — it is indistinguishable from the
 * upstream being down, it is recorded as an error, and it burns the
 * `auto_pause_threshold = 3` counter. That is the same mechanism that had already
 * taken `venue_accessibility_osm` offline (see
 * 20270302100000_gateway_idle_timeout_is_not_a_failure.sql).
 *
 * THE ENTRY IS NOT A RUBBER STAMP. `verify_jwt = false` removes the platform's
 * check, so it is only correct for a function that gates itself. The second test
 * enforces exactly that, and the PUBLIC_ENDPOINTS allowlist is why it is not a
 * blanket rule: source-bluesky-url, source-social-url and source-tiktok-url are
 * deliberately public "user pastes a URL" endpoints with their own per-hour rate
 * limits, an SSRF guard and a forced `pending` review status. They hold no
 * requireInternalOrAdmin call, so giving them the entry would leave a public,
 * unauthenticated write path into `community_submissions`.
 *
 * So the invariant is a BICONDITIONAL, not a checklist: a source function has the
 * config entry if and only if it self-gates. Both directions fail loudly —
 * forgetting the entry on a cron target, and adding it to a public endpoint.
 */

const ROOT = join(__dirname, '..', '..', '..');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const CONFIG = join(ROOT, 'supabase', 'config.toml');

/**
 * Deliberately public, self-rate-limited, human-review-gated. Adding one of
 * these to config.toml is a security decision and must break this test first.
 */
const PUBLIC_ENDPOINTS = new Set(['source-bluesky-url', 'source-social-url', 'source-tiktok-url']);

/**
 * Sources that MUST NOT be reachable by cron regardless of their auth posture,
 * because the upstream forbids it.
 *
 * This category exists because the first version of this test did not have it
 * and was WRONG in CI. Its rule was "self-gates => must have a config entry",
 * which is a question about authentication, and authentication is not the only
 * thing a config entry decides. `verify_jwt = false` is what lets pg_cron reach
 * the function at all, so for a source under an express prohibition the entry is
 * the difference between holding an offline parser (allowed) and running a
 * crawler (not allowed).
 *
 * gays-cruising.com (Keyup Studio S.L., Valencia): Condiciones de Uso §5 forbids
 * reproducing, copying, reselling or exploiting any part of the service without
 * consent given expressly and in writing; §17 puts disputes under Spanish law.
 * src/lib/__tests__/gaysCruisingLicence.test.ts is the primary guard and it is
 * what caught the entry this file's rule had demanded.
 *
 * Adding a name here is not a workaround for a failing assertion — it is a claim
 * that the upstream prohibits scheduled access, and it needs the same kind of
 * citation the entry above carries.
 */
const LICENCE_BLOCKED = new Set(['source-gays-cruising']);

/** Calls that make a function responsible for its own authorization. */
const SELF_GATES = ['requireInternalOrAdmin', 'hasValidWebhookSecret', 'requireAdmin'];

function sourceFunctions(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('source-'))
    .map((e) => e.name)
    .sort();
}

function hasConfigEntry(config: string, name: string): boolean {
  // Match the block header exactly so `source-gay-ch` cannot be satisfied by
  // `source-gay-ch-extra`.
  return new RegExp(`^\\[functions\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, 'm').test(
    config,
  );
}

function selfGates(name: string): boolean {
  const entry = join(FUNCTIONS_DIR, name, 'index.ts');
  if (!existsSync(entry)) return false;
  const src = readFileSync(entry, 'utf8');
  return SELF_GATES.some((g) => src.includes(g));
}

describe('source-* edge functions declare verify_jwt = false', () => {
  const config = readFileSync(CONFIG, 'utf8');
  const fns = sourceFunctions();

  it('finds source functions to check at all', () => {
    // A positive control. If the directory scan silently returns nothing, every
    // other assertion below passes vacuously — the "absence needs a positive
    // control" rule.
    expect(fns.length).toBeGreaterThan(10);
  });

  it('every self-gating source function has a config.toml entry', () => {
    const missing = fns.filter(
      (n) =>
        !PUBLIC_ENDPOINTS.has(n) &&
        !LICENCE_BLOCKED.has(n) &&
        selfGates(n) &&
        !hasConfigEntry(config, n),
    );
    expect(
      missing,
      `these self-gate but have no [functions.<name>] block, so pg_cron reaches them only by ` +
        `accident of the anon-key Bearer:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no licence-blocked source has been given verify_jwt = false', () => {
    // This test AGREES with gaysCruisingLicence.test.ts instead of contradicting
    // it. Two guards disagreeing about the same line is how one of them gets
    // "fixed" by deleting the other; stating the same rule from both sides means
    // a future edit has to argue with both.
    const opened = [...LICENCE_BLOCKED].filter((n) => hasConfigEntry(config, n)).sort();
    expect(
      opened,
      `the upstream forbids scheduled access to these; verify_jwt=false is what lets a cron ` +
        `reach them, which turns an offline parser into a crawler:\n  ${opened.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the licence-blocked list names functions that actually exist', () => {
    // A stale entry would silently exempt nothing and hide a real gap, the same
    // way a rotting allowlist does. If the function is gone, delete the entry.
    const ghosts = [...LICENCE_BLOCKED].filter((n) => !fns.includes(n)).sort();
    expect(ghosts, `these are listed as licence-blocked but no such function exists`).toEqual([]);
  });

  it('no public endpoint has been given verify_jwt = false', () => {
    const opened = [...PUBLIC_ENDPOINTS].filter((n) => hasConfigEntry(config, n)).sort();
    expect(
      opened,
      `these are public "user pastes a URL" endpoints with no requireInternalOrAdmin call. ` +
        `A config entry turns them into unauthenticated write paths into community_submissions. ` +
        `If one of them has GAINED a self-gate, remove it from PUBLIC_ENDPOINTS in the same commit:\n  ${opened.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the public allowlist still describes reality — none of them self-gates', () => {
    // Keeps the allowlist from rotting into a blanket exemption. The moment one
    // of these grows a real gate, it should be treated like every other source
    // function instead of staying permanently excused.
    const nowGated = [...PUBLIC_ENDPOINTS].filter((n) => selfGates(n)).sort();
    expect(
      nowGated,
      `these now self-gate and should leave PUBLIC_ENDPOINTS (and gain a config entry):\n  ${nowGated.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every allowlisted public endpoint still exists', () => {
    const gone = [...PUBLIC_ENDPOINTS]
      .filter((n) => !existsSync(join(FUNCTIONS_DIR, n, 'index.ts')))
      .sort();
    expect(
      gone,
      `delete these from PUBLIC_ENDPOINTS — the function is gone:\n  ${gone.join('\n  ')}`,
    ).toEqual([]);
  });
});
