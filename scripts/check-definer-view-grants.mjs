#!/usr/bin/env node
/**
 * Security gate: no SECURITY DEFINER view in `public` may carry write grants for the
 * API roles (anon / authenticated).
 *
 * Why this can regress on its own: the project runs Supabase's stock
 *   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated
 * so every newly created view is born with INSERT/UPDATE/DELETE/TRUNCATE for both API
 * roles. On a table that is harmless — RLS is the gate. On a view without
 * security_invoker it is not: the view executes as its owner (postgres) and bypasses
 * the base table's RLS, turning the default grant into a live write path.
 *
 * That is exactly how anon came to be able to DELETE from tag_relations,
 * dedup_review_queue and org_link_suggestions (migration 20260806180000) — tables
 * whose only policy is an admin-gated SELECT.
 *
 * Fix when this fails: either revoke the write set on the offending view, or give the
 * view `WITH (security_invoker = on)` so base-table RLS applies to writes.
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping definer-view grant gate')
  process.exit(0)
}

const res = await fetch(`${BASE}/rest/v1/rpc/definer_view_api_write_grants`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
})
if (!res.ok) {
  console.error(`definer_view_api_write_grants → HTTP ${res.status}: ${await res.text()}`)
  process.exit(1)
}

const rows = await res.json()

if (rows.length === 0) {
  console.log('✓ No SECURITY DEFINER view exposes write privileges to anon/authenticated.')
  process.exit(0)
}

console.error('✗ SECURITY DEFINER view(s) writable by an API role — these bypass RLS:\n')
for (const r of rows) {
  console.error(`  ${r.view_name}  ${r.grantee}: ${r.privileges}`)
}
console.error(
  '\nRevoke the write set on the view, or recreate it WITH (security_invoker = on).' +
    '\nSee supabase/migrations/20260806180000_revoke_api_write_on_security_definer_views.sql',
)
process.exit(1)
