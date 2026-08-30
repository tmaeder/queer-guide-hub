#!/usr/bin/env node
/**
 * Security gate: `anon` / `authenticated` must not hold TRUNCATE, TRIGGER, REFERENCES or
 * MAINTAIN on anything in `public`.
 *
 * WHY THIS EXISTS. **RLS does not gate TRUNCATE.** Row-level security filters rows for
 * SELECT/INSERT/UPDATE/DELETE; TRUNCATE is a table-level operation that Postgres
 * authorises on the privilege alone, so the RLS policies protecting everything else on
 * this platform are simply not in that path. Measured 2026-08-30: `anon` held TRUNCATE on
 * **464** public objects — venues, events, countries, trips, messages, user_roles — and
 * `authenticated` on 485. Revoked in `20260830202340`.
 *
 * IT WAS LATENT, NOT LIVE, AND THE DIFFERENCE MATTERS. PostgREST exposes no TRUNCATE verb,
 * and of 543 anon-EXECUTE routines exactly one mentions 'truncate' — a read-only
 * grant-audit function. So nothing could reach it. That is not a security control; it is
 * an accident of what happens to be deployed. One SECURITY DEFINER function that truncates
 * a table turns it into full data loss.
 *
 * WHY IT CANNOT BE LEFT TO THE DATABASE ALONE. The revoke fixed today's objects AND the
 * `postgres` default ACL (verified in a rolled-back transaction first — for FUNCTIONS the
 * same ALTER DEFAULT PRIVILEGES approach is a no-op because of the built-in
 * EXECUTE-to-PUBLIC grant, see check-anon-function-grants.mjs; for TABLES it works). What
 * it cannot fix is the `supabase_admin` default ACL, which still reads `anon=arwdDxtm` and
 * is unalterable from `postgres` — the same wall as `net.http_request_queue`. A table
 * created by supabase_admin in `public` would inherit the grants again, and only a
 * recurring check would notice.
 *
 * SEVERITY IS SPLIT ON PURPOSE. A gate that is permanently red is a gate people learn to
 * skip, so the unfixable supabase_admin row is reported as INFO and never fails the build.
 * Everything actionable — a real object carrying the privilege, or the postgres default
 * ACL regaining it — is CRITICAL and fails.
 *
 * FIX WHEN THIS FAILS. Do not add an allowlist. For an object:
 *     revoke truncate, trigger, references, maintain on public.<obj> from anon, authenticated;
 * For the default ACL:
 *     alter default privileges in schema public
 *       revoke truncate, trigger, references, maintain on tables from anon, authenticated;
 * If some object genuinely needs one of these for an API role, that is a design question —
 * none of the four is reachable through PostgREST, so the answer is almost certainly no.
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping API-role table-grant gate',
  )
  process.exit(0)
}

const res = await fetch(`${BASE}/rest/v1/rpc/api_role_table_privilege_leaks`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
})

if (!res.ok) {
  const body = await res.text()
  // PostgREST answers an unknown function with 404 PGRST202. This gate reads PROD, but a
  // migration only reaches prod on merge to main — so without this the check would fail on
  // its own PR and on every unrelated PR opened before that merge. Only "function is
  // missing" is tolerated; any other error still fails.
  if (res.status === 404 && body.includes('PGRST202')) {
    console.warn('⚠ api_role_table_privilege_leaks() is not on prod yet — skipping until its migration lands.')
    process.exit(0)
  }
  console.error(`api_role_table_privilege_leaks → HTTP ${res.status}: ${body}`)
  process.exit(1)
}

const rows = await res.json()
const critical = rows.filter((r) => r.severity === 'critical')
const info = rows.filter((r) => r.severity !== 'critical')

for (const r of info) {
  console.log(`ℹ ${r.object_name}: ${r.leaked}`)
  console.log('  (not alterable from the postgres role — tracked, not actionable here)')
}

if (critical.length === 0) {
  console.log('✓ anon/authenticated hold no TRUNCATE, TRIGGER, REFERENCES or MAINTAIN in public.')
  process.exit(0)
}

console.error(
  `\n✗ ${critical.length} object(s)/default-ACL(s) grant TRUNCATE/TRIGGER/REFERENCES/MAINTAIN to an API role.`,
)
console.error('  RLS does NOT gate TRUNCATE — these are not held by any row policy.\n')
for (const r of critical.slice(0, 40)) {
  console.error(`  - ${r.object_name} [${r.kind}] → ${r.role_name}: ${r.leaked}`)
}
if (critical.length > 40) console.error(`  … and ${critical.length - 40} more`)
console.error('\nSee the header of this script for the exact revoke statements.')
process.exit(1)
