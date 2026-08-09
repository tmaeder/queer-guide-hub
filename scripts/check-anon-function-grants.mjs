#!/usr/bin/env node
/**
 * Security gate: no NEW write-capable, RLS-bypassing function may become anon-callable.
 *
 * WHY THIS EXISTS. Supabase ships
 *     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role
 * so every function created in this project is anon-callable the moment it exists unless
 * someone remembers to revoke it. That is how 97 admin/cron RPCs — including
 * run_venue_fuzzy_automerge, purge_mailbox_emails and admin_delete_marketplace_merchant —
 * ended up reachable by an anonymous caller (fixed in 20260822100000 / 20260823100000).
 * Nothing stops the 98th.
 *
 * WHY IT IS A CI GATE AND NOT A DATABASE DEFAULT. Both of those migrations promised the
 * "real" fix as a follow-up: `alter default privileges ... revoke execute on functions
 * from anon`. **That does not work.** Verified in rolled-back transactions against prod:
 *
 *   revoke ... from anon, authenticated -> default ACL loses those entries, but a newly
 *     created function still carries `=X/postgres` (the built-in PUBLIC grant) and
 *     has_function_privilege('anon', new_fn) is still TRUE.
 *   revoke ... from public              -> pg_default_acl is completely unchanged. No-op.
 *
 * The `=X` is Postgres's built-in EXECUTE-to-PUBLIC on new functions; it is not a
 * pg_default_acl row, so ALTER DEFAULT PRIVILEGES cannot subtract it. An event trigger
 * could, but `postgres` here has rolsuper=false and is not a member of supabase_admin.
 * So the enforcement point is CI. This is the same structure as
 * check-profile-column-grants.mjs, which exists because a blanket table grant can re-open
 * a hole without touching the column ACL a naive check would inspect.
 *
 * SCOPE. Narrow on purpose so the signal survives: VOLATILE (can write) + SECURITY DEFINER
 * (runs as owner, bypasses RLS) + not a trigger function + executable by anon. Read-only
 * functions are the legitimate public API surface; invoker-rights functions are held by
 * RLS; self-guarding functions already raise 42501; trigger functions must keep their
 * grants or ordinary user writes break (see 20260823100000).
 *
 * FIX WHEN THIS FAILS. Do not reflexively widen the allowlist. Decide which the new
 * function is:
 *   - cron / service-role only  -> `revoke execute on function public.<name>(<args>) from public, anon;`
 *     (`from anon` ALONE IS A NO-OP when PUBLIC holds the grant — that left 50 of 97
 *     functions reachable in the first draft of 20260822100000)
 *   - admin console             -> add `perform assert_admin_or_internal();` to the body
 *   - genuinely public          -> add it to the `public_by_design` half of the allowlist
 *     in supabase/migrations/20260824100000_anon_function_exposure_gate.sql, WITH the
 *     call site in a comment
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping anon function-grant gate')
  process.exit(0)
}

const res = await fetch(`${BASE}/rest/v1/rpc/anon_function_exposure`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
})

if (!res.ok) {
  const body = await res.text()
  // The gate reads PROD, but a migration only reaches prod on merge to main — so without
  // this the check would fail on its own PR and on every unrelated PR opened before that
  // merge. Only "function is missing" is tolerated; any other error still fails.
  if (res.status === 404 && body.includes('PGRST202')) {
    console.warn('⚠ anon_function_exposure() is not on prod yet — skipping until its migration lands.')
    process.exit(0)
  }
  console.error(`anon_function_exposure → HTTP ${res.status}: ${body}`)
  process.exit(1)
}

const rows = await res.json()

if (rows.length === 0) {
  console.log('✓ no unallowlisted write-capable SECURITY DEFINER function is anon-callable.')
  process.exit(0)
}

console.error(`✗ ${rows.length} write-capable SECURITY DEFINER function(s) reachable by anon:\n`)
for (const r of rows) {
  console.error(`  public.${r.function_name}(${r.signature})`)
}
console.error(
  '\nThese run as the function owner, so RLS does not apply, and an anonymous caller can' +
    '\ninvoke them over the public REST API with only the anon key.' +
    '\n\nPick one:' +
    '\n  cron/service-role only -> revoke execute ... from public, anon;   (NOT `from anon` alone —' +
    '\n                            that is a no-op while PUBLIC holds the grant)' +
    '\n  admin console          -> perform assert_admin_or_internal(); in the body' +
    '\n  genuinely public       -> allowlist it in' +
    '\n                            supabase/migrations/20260824100000_anon_function_exposure_gate.sql' +
    '\n                            with the call site in a comment',
)
process.exit(1)
