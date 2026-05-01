# SECURITY DEFINER function audit

Production project `xqeacpakadqfxjxjcewc`, captured 2026-05-01 via
Supabase MCP. Closes Batch 3 of the consolidation sprint advisor
backlog (see [consolidation-2026-Q2-addendum-db-advisors.md](consolidation-2026-Q2-addendum-db-advisors.md)).

**Headline finding.** The Supabase advisor flagged 65 SECURITY DEFINER
functions exposed to anon (23) or authenticated (42). The reality is
worse: **most SECURITY DEFINER functions in `public` default to
PUBLIC EXECUTE** because no `REVOKE FROM PUBLIC` was issued at
creation. The 65 advisor flags are the subset that ALSO have an
explicit `GRANT EXECUTE TO anon|authenticated`. Hundreds more rely on
the default PUBLIC grant — equally exposed but not flagged.

This document catalogues the 65 explicit grants by intent classification
so the team can decide which to keep, which to tighten with `REVOKE`,
and which need a per-function review.

## Methodology

Naming-pattern heuristics + obvious-purpose check. Three categories:

- ✅ **Likely deliberate** — read-only or single-row counter intended for client-side use; the SECURITY DEFINER wrap is for RLS bypass on auxiliary tables. Keep public exposure.
- ⚠️ **Needs review** — operation looks privileged but is exposed to anon. May be intentional (e.g. story narrative editing from a public token), may be accidental.
- 🔴 **Likely accidental** — admin-only verb in the name (approve, archive, dispatch, cancel) but anon can call it. High priority to either tighten OR add explicit role check inside the function.

The classification is heuristic. Each flagged function still needs a 1-line confirmation from someone who knows the use case.

## 25 functions exposed to BOTH anon AND authenticated

These have explicit `GRANT EXECUTE TO anon` AND `GRANT EXECUTE TO authenticated`. The double-grant strongly suggests intent — but for the 🔴 entries, the anon side is suspicious.

| Function | Args | Class | Note |
|---|---|---|---|
| `has_role` | `(_user_id, _role)` | ✅ | Role check predicate. Used in RLS policies. Keep. |
| `has_role_jwt` | `(required_role)` | ✅ | Same; JWT-based variant. Keep. |
| `has_any_role_jwt` | `(required_roles[])` | ✅ | Same. Keep. |
| `cms_can_edit` | `(content_type, content_id, user_id)` | ✅ | Permission predicate. Keep. |
| `increment_article_views` | `(article_id)` | ✅ | View counter. Standard pattern. Keep. |
| `increment_listing_views` | `(listing_id)` | ✅ | Same. Keep. |
| `increment_personality_views` | `(personality_id)` | ✅ | Same. Keep. |
| `track_share_view` | `(token, referer_host)` | ✅ | Share-link analytics. Keep. |
| `get_trending_entities` | `(types[], city, limit)` | ✅ | Public read aggregation. Keep. |
| `get_shared_trip` | `(token)` | ✅ | Public share link. Keep. |
| `log_security_event` | `(event_type, user_id, metadata, severity)` | ⚠️ | Anon clients reporting security events makes sense, but verify rate-limited. |
| `audit_admin_data_access` | `(admin_id, target_user_id, data_type, justification)` | 🔴 | Why can anon call an admin audit log writer? Either tighten OR enforce admin-role check inside. |
| `dispatch_claude_routine` | `(story_id, runner, prompt, prompt_hash)` | 🔴 | Dispatch from anon — looks like accidental. Should be admin/service-role only. |
| `cancel_routine_run` | `(run_id, reason)` | 🔴 | Same. |
| `record_routine_progress` | `(run_id, status, payload, ...)` | 🔴 | Same. |
| `record_fix_proposed` | `(run_id, pr_url, ...)` | 🔴 | Same. |
| `record_retest_result` | `(retest_id, status, ...)` | 🔴 | Same. |
| `start_retest` | `(run_id, kind, runner)` | 🔴 | Same. |
| `mark_story_needs_followup` | `(story_id, reason)` | 🔴 | Same. |
| `archive_story` | `(story_id, reason)` | 🔴 | Story management — admin-only verb but anon-callable. |
| `unarchive_story` | `(story_id)` | 🔴 | Same. |
| `verify_story` | `(story_id, outcome, note)` | 🔴 | Same. |
| `approve_story_for_claude` | `(story_id, note)` | 🔴 | Approval workflow exposed to anon. |
| `commit_marketplace_staging_item` | `(staging_id, actor)` | ✅ FIXED | Reviewer commit RPC, added 2026-05-01. PUBLIC EXECUTE was Postgres default; revoked in `20260501040200`. Now authenticated-only. |
| `commit_news_staging_item` | `(staging_id, actor)` | ✅ FIXED | Same as above. |

**Suggested action for the 13 🔴 entries:** these all look like Claude routine / story management operations that should be admin or service-role only. Either:
- (a) `REVOKE EXECUTE FROM anon` on each, OR
- (b) Add `IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'forbidden'; END IF;` at the top of each.

Option (a) is faster but breaks any internal call from edge functions running with anon key. Option (b) is more defensive in depth.

## 17 functions exposed to authenticated only

Lower risk. Mostly intra-app operations a logged-in user might run on their own data. Spot-check:

| Function | Args | Class |
|---|---|---|
| `basic_rate_limit` | `(identifier, max_attempts)` | ✅ |
| `check_rate_limit_enhanced` | `(identifier, max_attempts, window, action_type)` | ✅ |
| `can_edit_trip` | `(trip_id, user_id)` | ✅ |
| `is_trip_member` | `(trip_id, user_id)` | ✅ |
| `check_mailbox_availability` | `(address)` | ✅ |
| `get_admin_counts` | `()` | ⚠️ — should be admin-only; check function body for role gate |
| `get_or_create_direct_conversation` | `(user1_id, user2_id)` | ✅ |
| `get_or_create_email_token` | `()` | ✅ |
| `rotate_email_token` | `()` | ✅ |
| `get_public_profile_safe` | `(target_user_id)` | ✅ |
| `get_venue_social_signals` | `(venue_ids[], viewer_id)` | ✅ |
| `decrement_comment_likes` | `(comment_id)` | ✅ |
| `decrement_post_likes` | `(post_id)` | ✅ |
| `increment_comment_likes` | `(comment_id)` | ✅ |
| `increment_post_likes` | `(post_id)` | ✅ |
| `increment_post_comments` | `(post_id)` | ✅ |
| `log_sensitive_data_access` | `(user_id, target_user_id, data_type, access_method)` | ✅ |
| `match_content_embeddings` | `(query_embedding, similarity, count)` | ✅ |
| `record_redirect_click` | `(redirect_id, path, ...)` | ✅ |

Only `get_admin_counts` flags as needing inner-function role check.

## ~150+ functions with default PUBLIC EXECUTE (advisor doesn't flag)

Examples (not exhaustive):
- All other `commit_*_staging_item` and `commit_*_staging_batch` (venue, event, personality, city, country, marketplace_batch, news_batch, village_batch)
- All `find_*_duplicates` and `find_*_duplicate_candidates`
- `merge_entities`, `merge_tag`, `merge_unified_tag`
- `auto_clean_*`, `auto_remove_broken_link`
- `apply_content_change`, `apply_enrichment`, `revert_content_change`
- `assign_user_role`, `approve_group_join_request`, `reject_group_join_request`
- pgmq_* wrappers (`pgmq_send`, `pgmq_read`, `pgmq_delete`, etc.)
- `get_vault_secret(secret_name)` — **CRITICAL**: this returns vault secrets and defaults to PUBLIC EXECUTE. Verify whether the function body has its own auth check.

**Recommended sweep:** for any SECURITY DEFINER function that mutates state or returns sensitive data, add `REVOKE EXECUTE FROM PUBLIC` immediately after creation. Going forward, codify this as a pre-merge checklist for any new SECURITY DEFINER function:

> 1. Does this function need to be callable by unauthenticated requests? If no → `REVOKE EXECUTE FROM PUBLIC`.
> 2. Should authenticated users be able to call it? Only if yes → `GRANT EXECUTE TO authenticated`.
> 3. Does the function body trust its arguments? If it accepts a `user_id` parameter, does it verify `auth.uid() = user_id` (or a role check)?

## Recommended next batches

In rough priority order:

1. **Lock down the 13 🔴 anon-exposed admin-verb functions.** One migration with `REVOKE EXECUTE FROM anon` on each. ~15 min effort, biggest security improvement.
2. **Audit `get_vault_secret`** — verify auth check inside the function body. Critical because secrets.
3. **Verify `get_admin_counts` body has admin-role check.**
4. **Verify `log_security_event` is rate-limited or has fingerprint dedup** — anon endpoints that write to a log table are spam targets.
5. **Catalogue all default-PUBLIC SECURITY DEFINER functions** that mutate state or read sensitive tables; sweep each.

## Files & references

- This doc: `docs/security-definer-function-audit.md`
- Backlog source: [`docs/consolidation-2026-Q2-addendum-db-advisors.md`](consolidation-2026-Q2-addendum-db-advisors.md)
- Live data: rerun the SQL at the top of the script header to refresh.
