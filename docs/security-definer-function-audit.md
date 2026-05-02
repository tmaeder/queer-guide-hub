# SECURITY DEFINER function audit

Production project `xqeacpakadqfxjxjcewc`.
First captured 2026-05-01; updated 2026-05-02 with deeper body inspection
and applied lockdowns.

## Status: largely complete

| Action | Status | Migration |
|---|---|---|
| `get_vault_secret` lockdown (CRITICAL) | ✅ Done 2026-05-02 | `20260502010000` |
| 12 admin-verb anon REVOKE (defense in depth) | ✅ Done 2026-05-02 | `20260502010100` |
| `user_submission_reputation` view → SECURITY INVOKER | ✅ Done 2026-05-02 | `20260502010200` |
| `personality_internal_notes` redundant policy drop | ✅ Done 2026-05-02 | `20260502010200` |
| Long-tail SECURITY DEFINER review (~150 funcs) | ⏳ Backlog (per-function, not bulk) | — |

## What changed since the first audit

The first version of this doc (2026-05-01) classified 13 admin-verb
functions as 🔴 "likely accidental" because they were exposed to anon
EXECUTE despite admin-only verbs in their names. **A 2026-05-02 body
inspection found that all 13 actually have an internal role check** as
their first statement:

```sql
IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
  RAISE EXCEPTION 'forbidden';
END IF;
```

So anon callers were never able to reach the privileged operations —
they always hit `forbidden`. Not vulnerabilities, but the EXECUTE
grant was misleading and one missed role-check would expose them.
Migration `20260502010100` revokes anon EXECUTE on all 12 (plus
`audit_admin_data_access` which checks the parameter rather than the
caller, also harmless but worth tightening).

The first doc also noted `get_vault_secret` as the highest-priority
unflagged-by-advisor item. **2026-05-02 body inspection confirmed
zero internal role check**:

```sql
CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_name text)
RETURNS text LANGUAGE sql SECURITY DEFINER
AS $function$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = secret_name LIMIT 1;
$function$
```

Default Postgres function ACL (PUBLIC EXECUTE) meant anyone with a
Supabase API key could read every vault secret. Migration
`20260502010000` REVOKEs from PUBLIC, anon, and authenticated. Only
`service_role` and `postgres` retain EXECUTE. Edge functions invoking
this from the wrong role context will need a service_role connection.

## What's left

### Long-tail default-PUBLIC SECURITY DEFINER functions (~150)

The advisor only flags functions with an explicit `GRANT EXECUTE TO
anon|authenticated`. Most SECURITY DEFINER functions in `public` rely
on the default PUBLIC EXECUTE — equally exposed but unflagged.

Notable categories that should be reviewed individually for whether
they need a role check or REVOKE:

- All `commit_*_staging_item` and `commit_*_staging_batch` (venue, event, personality, city, country, marketplace, news, village)
- All `find_*_duplicates` and `find_*_duplicate_candidates`
- `merge_entities`, `merge_tag`, `merge_unified_tag`
- `auto_clean_*`, `auto_remove_broken_link`
- `apply_content_change`, `apply_enrichment`, `revert_content_change`
- `assign_user_role`, `approve_group_join_request`, `reject_group_join_request`
- pgmq_* wrappers (`pgmq_send`, `pgmq_read`, `pgmq_delete`, etc.)

The pattern from this audit applies:

> 1. Does this function need to be callable by unauthenticated requests? If no → `REVOKE EXECUTE FROM PUBLIC`.
> 2. Should authenticated users be able to call it? Only if yes → `GRANT EXECUTE TO authenticated`.
> 3. Does the function body trust its arguments? If it accepts a `user_id` parameter, does it verify `auth.uid() = user_id` (or a role check)?

Going forward, codify this as a pre-merge checklist for any new
SECURITY DEFINER function.

### Other items

- 17 SECURITY DEFINER functions explicitly granted to `authenticated` only — lower risk. Mostly intra-app operations a logged-in user might run on their own data. `get_admin_counts()` is the one that flags as needing inner-function role check; bodies of the others were not inspected.

## Cumulative inventory (snapshot 2026-05-02)

Categorised summary of the 25 functions explicitly granted to BOTH
anon AND authenticated:

| Function | Args | Class | Status |
|---|---|---|---|
| `has_role` | `(_user_id, _role)` | ✅ Deliberate | Keep — RLS predicate |
| `has_role_jwt` | `(required_role)` | ✅ Deliberate | Keep — RLS predicate |
| `has_any_role_jwt` | `(required_roles[])` | ✅ Deliberate | Keep — RLS predicate |
| `cms_can_edit` | `(content_type, content_id, user_id)` | ✅ Deliberate | Keep — permission predicate |
| `increment_article_views` | `(article_id)` | ✅ Deliberate | Keep — view counter |
| `increment_listing_views` | `(listing_id)` | ✅ Deliberate | Keep — view counter |
| `increment_personality_views` | `(personality_id)` | ✅ Deliberate | Keep — view counter |
| `track_share_view` | `(token, referer_host)` | ✅ Deliberate | Keep — public share analytics |
| `get_trending_entities` | `(types[], city, limit)` | ✅ Deliberate | Keep — public read aggregation |
| `get_shared_trip` | `(token)` | ✅ Deliberate | Keep — public share link |
| `log_security_event` | `(event_type, user_id, metadata, severity)` | ⚠️ Verify rate-limited | Keep — client-side incident reporting |
| `audit_admin_data_access` | `(admin_id, ...)` | ✅ FIXED | anon REVOKEd 2026-05-02 |
| `dispatch_claude_routine` | `(story_id, runner, prompt, prompt_hash)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `cancel_routine_run` | `(run_id, reason)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `record_routine_progress` | `(run_id, status, ...)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `record_fix_proposed` | `(run_id, pr_url, ...)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `record_retest_result` | `(retest_id, status, ...)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `start_retest` | `(run_id, kind, runner)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `mark_story_needs_followup` | `(story_id, reason)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `archive_story` | `(story_id, reason)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `unarchive_story` | `(story_id)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `verify_story` | `(story_id, outcome, note)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `approve_story_for_claude` | `(story_id, note)` | ✅ FIXED (had inner role check) | anon REVOKEd 2026-05-02 |
| `commit_marketplace_staging_item` | `(staging_id, actor)` | ✅ FIXED | PUBLIC REVOKEd in `20260501040200` |
| `commit_news_staging_item` | `(staging_id, actor)` | ✅ FIXED | PUBLIC REVOKEd in `20260501040200` |

Also fixed but not in the explicit-grant list (was default PUBLIC):

| Function | Args | Class | Status |
|---|---|---|---|
| `get_vault_secret` | `(secret_name)` | 🔴 CRITICAL | PUBLIC + anon + authenticated REVOKEd 2026-05-02 |

## Files & references

- This doc: `docs/security-definer-function-audit.md`
- Backlog source: [`docs/consolidation-2026-Q2-addendum-db-advisors.md`](consolidation-2026-Q2-addendum-db-advisors.md)
- Live data: query `pg_proc` for `prosecdef = true` + `routine_privileges`.
