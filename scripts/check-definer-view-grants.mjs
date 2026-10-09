#!/usr/bin/env node
/**
 * Security gate, three checks:
 *   1. No SECURITY DEFINER view in `public` may carry write grants for the API roles
 *      (anon / authenticated).
 *   2. No view registered in `security_invoker_required_views` may have lost its
 *      `security_invoker` flag.
 *   3. No SECURITY DEFINER view may be SELECT-able by anon / authenticated / PUBLIC.
 *
 * Check 3 was added 2026-10-09 because 1 and 2 are each narrower than the class and
 * BOTH passed cleanly while anon read 140 rows out of `feedback_board_v` — see the
 * comment above that check for why neither could have seen it. Read access is the
 * same RLS bypass as write access, one verb over.
 *
 * Check 2 exists because check 1 is blind to half the problem: `CREATE OR REPLACE VIEW`
 * resets reloptions, so a routine edit to a view body silently reverts a previous
 * `ALTER VIEW ... SET (security_invoker = true)`. If that view's write grants had already
 * been revoked, check 1 sees nothing while the view quietly goes back to bypassing RLS.
 * That is how admin_media_unified regressed for weeks (migration 20260810140000).
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

/**
 * @param {string} name
 * @param {boolean} [optional] When the RPC does not exist yet, warn and skip instead of
 *   failing. The gate reads PROD, but a migration only reaches prod on merge to main —
 *   so a check introduced alongside its RPC would otherwise fail on its own PR, and on
 *   every unrelated PR opened before that merge. Only "function is missing" is tolerated;
 *   any other error still fails.
 */
async function callRpc(name, optional = false) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    const body = await res.text()
    // PostgREST answers an unknown function with 404 PGRST202.
    if (optional && res.status === 404 && body.includes('PGRST202')) {
      console.warn(`⚠ ${name}() is not on prod yet — skipping that check until its migration lands.`)
      return null
    }
    console.error(`${name} → HTTP ${res.status}: ${body}`)
    process.exit(1)
  }
  return res.json()
}

// Both checks run before exiting so one CI run reports everything that is wrong.
let failed = false

const grantRows = await callRpc('definer_view_api_write_grants')

if (grantRows.length === 0) {
  console.log('✓ No SECURITY DEFINER view exposes write privileges to anon/authenticated.')
} else {
  failed = true
  console.error('✗ SECURITY DEFINER view(s) writable by an API role — these bypass RLS:\n')
  for (const r of grantRows) {
    console.error(`  ${r.view_name}  ${r.grantee}: ${r.privileges}`)
  }
  console.error(
    '\nRevoke the write set on the view, or recreate it WITH (security_invoker = on).' +
      '\nSee supabase/migrations/20260806180000_revoke_api_write_on_security_definer_views.sql',
  )
}

// Second, narrower check. The grant check above can only see a view that bypasses RLS
// AND still happens to carry write grants. `CREATE OR REPLACE VIEW` resets reloptions,
// so editing a view body silently discards a previous `SET (security_invoker = true)`.
// If that view's write grants were already revoked, the check above stays SILENT — which
// is exactly how admin_media_unified regressed unnoticed. See migration
// 20260810140000_restore_security_invoker_on_replaced_views.sql.
const invokerRows = await callRpc('security_invoker_view_regressions', true)

if (invokerRows === null) {
  // Not deployed yet; callRpc already warned.
} else if (invokerRows.length === 0) {
  console.log('✓ Every view registered as security_invoker still has it.')
} else {
  failed = true
  console.error('\n✗ View(s) have LOST security_invoker — they now bypass base-table RLS:\n')
  for (const r of invokerRows) {
    console.error(`  ${r.view_name}  (${r.reason})`)
  }
  console.error(
    '\nAlmost always a CREATE OR REPLACE VIEW that omitted the option. Re-apply it:' +
      '\n  alter view public.<name> set (security_invoker = on);' +
      '\nor write the body as CREATE OR REPLACE VIEW ... WITH (security_invoker = on) AS ...',
  )
}

// Third check: READ access. Arms 1 and 2 were both narrower than this class and
// both passed cleanly while anon was reading 140 rows out of feedback_board_v on
// 2026-10-09 — a definer view over community_submissions, whose RLS policy
// restricts reads to the row's own author plus admins. The base table answered
// anon with 401; the view answered with every user's feedback.
//
// Arm 1 missed it because its privilege filter is the WRITE set
// (INSERT/UPDATE/DELETE/TRUNCATE) — it was built for Supabase's stock
// ALTER DEFAULT PRIVILEGES, which hands out writes, and a hand-written
// `grant select` is a different door. Arm 2 missed it because it only inspects
// views REGISTERED in `security_invoker_required_views`, and that view was
// never in any migration, so it was never registered.
//
// This arm needs no registration: it asks the structural question directly, so
// the next unregistered off-path view is caught by construction.
const readRows = await callRpc('definer_view_api_read_grants', true)

// Shrink-only, like KNOWN_NAME_MISMATCHES in check-migration-drift.mjs. A view
// here must be a DELIBERATE public projection over a private table — the one
// case that cannot be expressed with security_invoker, because RLS would hide
// the very rows the projection exists to publish. Empty today, and a zero
// invariant is only honest while it stays empty: adding a name means writing
// down which columns are published and why that is safe.
const DELIBERATELY_PUBLIC = new Set([])

if (readRows === null) {
  // Not deployed yet; callRpc already warned.
} else {
  const leaks = readRows.filter((r) => !DELIBERATELY_PUBLIC.has(r.view_name))
  // An entry that has stopped leaking must be DELETED, not left to rot into an
  // allowlist nobody re-reads — same discipline as the drift gate's list.
  const stale = [...DELIBERATELY_PUBLIC].filter(
    (name) => !readRows.some((r) => r.view_name === name),
  )

  if (stale.length > 0) {
    failed = true
    console.error(
      '\n✗ DELIBERATELY_PUBLIC lists view(s) that are no longer API-readable — delete them:\n',
    )
    for (const name of stale) console.error(`  ${name}`)
  }

  if (leaks.length === 0) {
    console.log('✓ No SECURITY DEFINER view is readable by anon/authenticated.')
  } else {
    failed = true
    console.error('\n✗ SECURITY DEFINER view(s) READABLE by an API role — these bypass RLS:\n')
    for (const r of leaks) {
      console.error(`  ${r.view_name}  ${r.grantee}: ${r.privileges}`)
    }
    console.error(
      '\nThese serve base-table rows to callers the base table itself refuses.' +
        '\nFix, in order of preference:' +
        '\n  1. revoke select on public.<name> from anon, authenticated;' +
        '\n  2. alter view public.<name> set (security_invoker = true);  -- RLS then applies' +
        '\n  3. only if the view is a deliberate curated projection over private rows,' +
        '\n     add it to DELIBERATELY_PUBLIC in this file and say which columns it publishes.' +
        '\nSee supabase/migrations/99991791560472_feedback_board_v_anon_exposure.sql',
    )
  }
}

process.exit(failed ? 1 : 0)
