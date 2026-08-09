-- Gate: no NEW write-capable, RLS-bypassing function becomes anon-callable.
--
-- WHY A CI GATE AND NOT A DATABASE DEFAULT. 20260822100000 and 20260823100000
-- promised a follow-up: `alter default privileges in schema public revoke
-- execute on functions from anon` to stop the hole regrowing at the source.
-- **That does not work, and the claim in those two migrations was wrong.**
-- Measured here in rolled-back transactions on prod:
--
--   revoke execute on functions from anon, authenticated
--     -> default ACL loses anon=X/authenticated=X
--     -> a newly created function still carries `=X/postgres`   (PUBLIC)
--     -> has_function_privilege('anon', new_fn) = TRUE
--
--   revoke execute on functions from public
--     -> pg_default_acl is COMPLETELY UNCHANGED; the statement is a no-op
--     -> new function still `{=X/postgres,...}`, anon still true
--
-- The `=X` is Postgres's built-in EXECUTE-to-PUBLIC on every new function. It is
-- not a pg_default_acl row, so ALTER DEFAULT PRIVILEGES cannot subtract it. The
-- only mechanism that could is an event trigger on ddl_command_end, and
-- `current_user` here is `postgres` with rolsuper=false and no membership of
-- supabase_admin, so we cannot create one. Same trap as `revoke ... from anon`
-- being a no-op while PUBLIC holds the grant — which is what left 50 of 97
-- functions reachable in the first draft of 20260822100000.
--
-- So the guard lives in CI instead, next to check-profile-column-grants.mjs,
-- which exists for the structurally identical reason: a blanket grant can
-- re-open a hole without touching the ACL the naive check would look at.
--
-- SCOPE. Deliberately narrow, so the signal survives:
--   VOLATILE (can write) + SECURITY DEFINER (runs as owner, bypasses RLS)
--   + not a trigger function + executable by `anon`
-- Read-only functions are the legitimate public API surface (search, counts,
-- lookups) and would drown the report. Invoker-rights functions are constrained
-- by RLS. Guarded functions self-protect via assert_admin_or_internal() and
-- already raise 42501. Trigger functions are excluded because revoking them
-- breaks ordinary user writes — see 20260823100000.
--
-- THE ALLOWLIST IS SPLIT ON PURPOSE. A single flat list would make 27 unreviewed
-- functions look blessed. `public_by_design` has a verified caller; `legacy`
-- does not and is tracked debt to shrink. Both pass the gate; only the first is
-- an endorsement.

create or replace function public.anon_function_exposure()
returns table (function_name text, signature text, classification text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with allow as (
    select unnest(array[
      -- public_by_design — verified caller, must keep anon:
      'get_secure_venue_checkins',      -- src/hooks/useVenueCheckins.tsx
      'get_similar_tags',               -- src/hooks/useTagRelationships.tsx
      'get_tag_graph_data',             -- src/hooks/useTagRelationships.tsx
      'increment_article_views',        -- src/hooks/useNews.tsx, NewsDetail
      'increment_listing_views',        -- src/hooks/useMarketplace.tsx
      'increment_personality_views',    -- src/hooks/usePersonalities.tsx
      'upsert_api_error',               -- src/utils/autoFileError.ts
      'match_content_embeddings',       -- workers/submit — uses SUPABASE_ANON_KEY
      -- legacy — no verified caller; candidates for revoke, not endorsements:
      '_apply_review_value',
      '_dedup_set_needs_attention',
      '_dedup_write_corroboration_signal',
      '_ingest_firecrawl_rows',
      '_review_clear_needs_attention',
      '_review_write_audit',
      '_review_write_provenance',
      'apply_enrichment',                    -- pipeline-quality-enhance (service key)
      'apply_news_refetch',                  -- news-fulltext-backfill (service key)
      'auto_apply_feedback_duplicates',
      'flag_stale_feedback',                 -- admin FeedbackPresets
      'gc_stale_api_errors',
      'get_similar_personalities',           -- card was REMOVED; comment-only reference
      'insert_event_reminder_notifications',
      'log_search_click',                    -- workers/search-proxy (SERVICE key)
      'promote_personality',
      'rate_limit_hit',                      -- edge fns (service key)
      'reclassify_news_categories',
      'record_redirect_click',               -- redirect-handler (service key)
      'recount_unified_tag_usage_for',
      'search_documents_index_guides',
      'search_documents_index_landmarks',
      'search_documents_index_milestones',
      'search_documents_index_organizations',
      'track_umami_event',                   -- umami-analytics (service key)
      'travel_inbox_post_item',              -- workers/travel-inbox (SERVICE key)
      'unpromote_personality'
    ]) as name
  )
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid)::text,
         'volatile + security definer + anon-executable'::text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind = 'f'
    and p.provolatile = 'v'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (select count(*) from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal) = 0
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    -- self-guarding functions already refuse anon with 42501
    and pg_get_functiondef(p.oid) !~* '(assert_admin_or_internal|is_admin|has_role|auth\.uid|jwt|current_setting|p_secret)'
    and p.proname not in (select name from allow)
  order by p.proname;
$function$;

comment on function public.anon_function_exposure() is
  'CI gate: write-capable SECURITY DEFINER functions reachable by anon and not allowlisted. Empty = healthy.';

revoke all on function public.anon_function_exposure() from public, anon, authenticated;
grant execute on function public.anon_function_exposure() to service_role;
