#!/usr/bin/env node
/**
 * Security gate: `anon` must never be able to read a `public.profiles` column outside the
 * allowlist granted by supabase/migrations/20260816120000_profiles_anon_column_grants.sql.
 *
 * WHY THIS EXISTS. `profiles` has 173 columns, and RLS on it filters ROWS ONLY —
 * `profiles_public_read` checks `privacy_settings->>'profile_visibility'` and says nothing
 * about columns. So the column ACL is the *only* thing protecting email, date_of_birth,
 * kink_interests, sexual_orientation and the rest from an anonymous
 * `GET /rest/v1/profiles?select=*`. There is no second layer to fall back on.
 *
 * WHY IT CAN REGRESS SILENTLY. The realistic failure is not someone editing the column
 * list. It is someone re-running
 *     GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
 * which is exactly what 20260428060000_restore_anon_public_select.sql did — a migration
 * written for countries/cities/venues that swept `profiles` up with them, and is how the
 * hole got there in the first place. A table-level grant subsumes every column ACL while
 * leaving pg_attribute.attacl completely untouched, so a check that asked "are the column
 * grants still there?" would stay green while all 173 columns were readable again.
 *
 * Hence the RPC asserts the ABSENCE of a table-level grant, not the presence of the
 * column grants. Its three arms:
 *   1. any table-level SELECT on profiles for anon or PUBLIC
 *   2. any column ACL for anon outside the allowlist
 *   3. any view over profiles that lacks `security_invoker` and is readable by an API
 *      role — such a view runs as postgres and bypasses both RLS and the column ACL
 *
 * Fix when this fails: do not widen the allowlist to make it pass. Work out which query
 * needs the column and route it through a SECURITY DEFINER RPC instead (the pattern
 * `get_public_profile_safe` already establishes). If widening really is right, edit the
 * GRANT, the allowlist inside profiles_column_exposure(), and
 * supabase/migrations/__tests__/profiles_column_grants.sql together — they are three copies of one
 * contract and the SQL test asserts exact set equality, so a partial edit fails loudly.
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping profiles column-grant gate')
  process.exit(0)
}

const res = await fetch(`${BASE}/rest/v1/rpc/profiles_column_exposure`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
})

if (!res.ok) {
  const body = await res.text()
  // PostgREST answers an unknown function with 404 PGRST202. The gate reads PROD, but a
  // migration only reaches prod on merge to main — so without this the check would fail on
  // its own PR, and on every unrelated PR opened before that merge. Only "function is
  // missing" is tolerated; any other error still fails.
  if (res.status === 404 && body.includes('PGRST202')) {
    console.warn('⚠ profiles_column_exposure() is not on prod yet — skipping until its migration lands.')
    process.exit(0)
  }
  console.error(`profiles_column_exposure → HTTP ${res.status}: ${body}`)
  process.exit(1)
}

const rows = await res.json()

if (rows.length === 0) {
  console.log('✓ anon can read only the allowlisted public.profiles columns.')
  process.exit(0)
}

console.error('✗ public.profiles is readable beyond the anon column allowlist:\n')
for (const r of rows) {
  console.error(`  [${r.kind}] ${r.object_name}  ${r.grantee}: ${r.detail}`)
}
console.error(
  '\nRLS on profiles filters rows, not columns — the column ACL is the only protection for' +
    '\nemail, date_of_birth, kink_interests and sexual_orientation.' +
    '\nSee supabase/migrations/20260816120000_profiles_anon_column_grants.sql',
)
process.exit(1)
