/**
 * Guards `sync-supabase-advisors`' SECURITY_WARN_NOISE denylist.
 *
 * Context (2026-10-16): the two pg_graphql lints fired 736 findings — 90% of the
 * 818 open `api_error` rows — and are unfixable by construction. The endpoint is
 * closed (`graphql_public` removed from the project's PostgREST exposed schemas,
 * /graphql/v1 now answers PGRST106) but the lints read TABLE GRANTS, which this
 * repo cannot revoke: `20260427160000` tried and `20260428060000` reverted it
 * after every public page started returning 401. So they fire forever.
 *
 * EVERY ASSERTION RUNS OVER COMMENT-STRIPPED SOURCE. The function's own header
 * quotes both rule names verbatim while explaining why they are suppressed, so
 * a `toContain` over the raw file passes with the Set entries deleted — the
 * vacuous-assertion class this repo keeps recording.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const RAW = readFileSync(
  resolve(__dirname, '../../../supabase/functions/sync-supabase-advisors/index.ts'),
  'utf8',
);
const SRC = stripComments(RAW);

/** The `new Set([...])` literal only — not the header, not the predicate. */
const DENYLIST = (() => {
  const m = SRC.match(/SECURITY_WARN_NOISE\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error('SECURITY_WARN_NOISE Set literal not found in stripped source');
  return m[1];
})();

const GRAPHQL_LINTS = ['pg_graphql_anon_table_exposed', 'pg_graphql_authenticated_table_exposed'];

/** Pre-existing entries. A sweep that empties the Set must fail, not pass. */
const PRE_EXISTING = [
  'authenticated_security_definer_function_executable',
  'anon_security_definer_function_executable',
  'function_search_path_mutable',
];

describe('sync-supabase-advisors pg_graphql noise suppression', () => {
  it('positive control: the header really does quote the rule names', () => {
    // If this ever fails the stripper has become load-bearing for nothing and
    // the tests below are no longer guarding against a vacuous match.
    for (const lint of GRAPHQL_LINTS) {
      expect(RAW).toContain(lint);
    }
    expect(RAW.length).toBeGreaterThan(SRC.length);
  });

  it('suppresses both pg_graphql lints in the Set literal, not just the prose', () => {
    for (const lint of GRAPHQL_LINTS) {
      expect(DENYLIST).toContain(lint);
    }
  });

  it('keeps the pre-existing denylist entries', () => {
    for (const lint of PRE_EXISTING) {
      expect(DENYLIST).toContain(lint);
    }
  });

  it('still consults the denylist for security WARN', () => {
    // Anchor on the CONDITION. A test that only checks the Set passes while the
    // predicate has stopped reading it.
    expect(SRC).toMatch(/return\s*!SECURITY_WARN_NOISE\.has\(l\.name\)/);
    // ERROR must stay unconditional — suppression is WARN-only.
    expect(SRC).toMatch(/if\s*\(l\.level === 'ERROR'\)\s*return true/);
  });

  it('keeps the auto-resolve pass that drains the suppressed backlog', () => {
    // Dropping a lint only closes its existing rows because step 4 resolves
    // advisor rows absent from liveFingerprints. Without this the 736 rows sit
    // open forever and the suppression fixes nothing visible.
    expect(SRC).toMatch(/!liveFingerprints\.has\(/);
    expect(SRC).toMatch(/\.like\('fingerprint',\s*'advisor:%'\)/);
    expect(SRC).toMatch(/feedback_status:\s*'done'/);
  });

  it('does not suppress a security lint class wholesale', () => {
    // The denylist is per-rule. A blanket `return false` for security WARN
    // would silence rls_policy_always_true and security_definer_view too.
    expect(SRC).not.toMatch(/if\s*\(type === 'security'\)\s*return false/);
    const entries = DENYLIST.split(',').filter((s) => s.trim().length > 0);
    expect(entries).toHaveLength(PRE_EXISTING.length + GRAPHQL_LINTS.length);
  });
});
