#!/usr/bin/env node
/**
 * Security gate: no NEW SECURITY DEFINER function may hand safety-gated row
 * CONTENT to an anonymous caller.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE SIBLING GATE. check-anon-function-grants.mjs
 * is scoped, deliberately, to VOLATILE (can write) + SECURITY DEFINER. That scope is
 * correct for what it guards and it is why it works — but it is blind to a READ-ONLY
 * definer that leaks. Both halves of that blind spot were live at once:
 *
 *   _dedup_event_cluster_side   VOLATILE? no, STABLE   -> gate blind    -> leaked ~5h
 *   event_dup_signals           VOLATILE               -> gate caught it, loudly,
 *                                                          on every open PR in the repo
 *
 * Both were introduced by the same PR (#3470). Only the volatile one was noticed.
 * Writing this detector then found a THIRD instance that predated all of it:
 * `event_previous_editions`, which returned the title, description, coordinates and
 * venue of safety_gated events in Dubai (AE), Kuala Lumpur (MY) and Doha (QA) to a
 * signed-out caller. Verified by reading it under `set local role anon` — 1 row before
 * the fix, `[]` after.
 *
 * WHAT IS AT STAKE. 61 events, 1,346 venues and 437 organizations carry
 * safety_gated = true because they sit in criminalizing countries. Their RLS is
 * `USING (NOT safety_gated OR auth.uid() IS NOT NULL)`. SECURITY DEFINER runs as the
 * function owner and skips that policy entirely, so one anon RPC call is enough.
 *
 * WHY AN ALLOWLIST AND NOT ZERO-TOLERANCE. The naive rule — definer + anon + reads a
 * gated table — matches 57 functions. Tightened to "and never names safety_gated,
 * auth.uid, or an admin assertion, and returns a content-shaped type" it is 18. That
 * is a list, not a gate. And the heuristic demonstrably over-reports: `get_entity_detail`
 * satisfies every clause and still returns NULL for a gated event, because it filters
 * through an indirection no regex can follow. So the current population is recorded in
 * the migration and anything NEW fails here.
 *
 * THE ALLOWLIST IS A RECORD, NOT AN ENDORSEMENT. Two entries are verified against prod;
 * the rest are marked UNAUDITED in
 * supabase/migrations/20291001093418_definer_content_exposure_gate.sql. Writing them
 * down as unaudited is the honest state. A gate that fails on 18 pre-existing functions
 * gets switched off in a week; a silent baseline reads as approval. The value here is
 * the NEXT one.
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping definer content-leak gate')
  process.exit(0)
}

const res = await fetch(`${BASE}/rest/v1/rpc/definer_content_exposure`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
})

if (!res.ok) {
  const body = await res.text()
  // Same tolerance as the sibling gate: this reads PROD, but the RPC only reaches prod
  // on merge to main, so without this the check fails on its own PR and on every
  // unrelated PR opened before that merge. Only "function is missing" is tolerated.
  if (res.status === 404 && body.includes('PGRST202')) {
    console.warn('⚠ definer_content_exposure() is not on prod yet — skipping until its migration lands.')
    process.exit(0)
  }
  console.error(`definer_content_exposure → HTTP ${res.status}: ${body}`)
  process.exit(1)
}

const rows = await res.json()

if (!Array.isArray(rows)) {
  console.error(`definer_content_exposure returned a non-array: ${JSON.stringify(rows).slice(0, 200)}`)
  process.exit(1)
}

if (rows.length === 0) {
  console.log('✓ no unallowlisted SECURITY DEFINER function exposes safety-gated content to anon.')
  process.exit(0)
}

console.error(
  `✗ ${rows.length} SECURITY DEFINER function(s) can hand safety-gated row content to anon:\n`,
)
for (const r of rows) {
  console.error(`  public.${r.function_name}  ->  ${r.returns}`)
}
console.error(
  '\nThese run as the function owner, so the safety_gated RLS policy does not apply, and' +
    '\nan anonymous caller can invoke them over the public REST API with only the anon key.' +
    '\nThat exposes venues, events and organizations in criminalizing countries — the exact' +
    '\nharm the safety layer exists to prevent.' +
    '\n\nPick one:' +
    '\n  reads gated tables and does not need owner rights' +
    '\n                         -> SECURITY INVOKER. The existing policy then answers per' +
    '\n                            caller: anon sees the ungated subset, a signed-in user' +
    '\n                            sees everything. Do NOT bolt on `and not safety_gated`' +
    '\n                            instead — that hides gated rows from signed-in users too,' +
    '\n                            trading a leak for a regression.' +
    '\n  cron / service-role only -> revoke execute ... from public, anon, authenticated;' +
    '\n  admin console          -> perform assert_admin_or_internal(); in the body' +
    '\n  verified safe          -> allowlist it in' +
    '\n                            supabase/migrations/20291001093418_definer_content_exposure_gate.sql' +
    '\n                            WITH the evidence — read it under `set local role anon`' +
    '\n                            against a gated row and paste what you got.',
)
process.exit(1)
