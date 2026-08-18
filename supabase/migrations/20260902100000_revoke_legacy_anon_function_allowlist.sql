-- Shrink the `legacy` half of the anon-function allowlist to nothing.
--
-- 20260824100000 shipped the CI gate with a deliberately SPLIT allowlist:
--   public_by_design (8) -- verified caller, must keep anon
--   legacy           (27) -- no verified caller, tracked debt, NOT an endorsement
-- This closes all 27. The gate's allowlist is now only the 8 that are actually
-- meant to be public.
--
-- WHY THEY ARE ALL SAFE TO REVOKE. Every real caller was traced before writing
-- this, and each one reaches these functions by a path that never uses an API
-- role:
--
--   * called only from other SQL functions -- and EVERY calling function is
--     SECURITY DEFINER, so the inner call runs as the function owner (postgres),
--     which holds EXECUTE regardless of what anon/authenticated hold:
--       _apply_review_value                <- approve_entity_review
--       _dedup_set_needs_attention         <- approve_/reject_dedup_review, run_dedup_truth_sweep
--       _dedup_write_corroboration_signal  <- approve_dedup_review, run_dedup_truth_sweep
--       _ingest_firecrawl_rows             <- ingest_firecrawl_batch
--       _review_clear_needs_attention      <- approve_/reject_entity_review
--       _review_write_audit                <- approve_/reject_entity_review
--       _review_write_provenance           <- approve_entity_review
--       auto_apply_feedback_duplicates     <- run_feedback_auto_dedup
--       flag_stale_feedback                <- run_feedback_stale_flag
--       gc_stale_api_errors                <- run_feedback_stale_error_gc
--       promote_personality                <- run_personality_auto_promote
--       recount_unified_tag_usage_for      <- merge_tag_concept, unmerge_tag_concept
--       search_documents_index_guides      <- search_documents_rebuild, _sync_inline_legacy, search_reindex_drain
--       search_documents_index_landmarks   <- search_documents_sync_landmark_profile
--       search_documents_index_milestones  <- (as guides)
--       search_documents_index_organizations <- (as guides)
--
--   * called only by an edge function on getServiceClient() (service_role):
--       apply_enrichment       <- pipeline-quality-enhance/index.ts:272
--       apply_news_refetch     <- news-fulltext-backfill/index.ts:81
--       rate_limit_hit         <- _shared/user-rate-limit.ts:37
--       record_redirect_click  <- redirect-handler/index.ts:280   (SUPABASE_SERVICE_ROLE_KEY)
--       track_umami_event      <- umami-analytics/index.ts:47     (getServiceClient)
--
--   * called only by a Cloudflare Worker holding the SERVICE key:
--       log_search_click       <- workers/search-proxy/src/index.ts:639 (SUPABASE_SERVICE_KEY)
--       travel_inbox_post_item <- workers/travel-inbox/src/supabase.ts:122
--                                 (constructed at index.ts:108 with SUPABASE_SERVICE_ROLE_KEY)
--
--   * called only by pg_cron, which runs as postgres:
--       insert_event_reminder_notifications
--
--   * no caller anywhere in src/, supabase/functions/, workers/, extension/,
--     scripts/, e2e/ or any other SQL function:
--       get_similar_personalities  (survives only in a comment in
--                                   src/pages/PersonalityDetail.parts.tsx:507
--                                   about a card that was REMOVED)
--       reclassify_news_categories
--       unpromote_personality
--
-- The distinction that matters is that a SECURITY DEFINER caller does NOT need
-- its callee to be granted to the API roles. Compare 20260823100000, where
-- TRIGGER functions had to keep `authenticated` precisely because they are
-- invoked by an ordinary user's own write. None of these 27 is a trigger
-- function, and none is attached to a trigger.
--
-- `from public, anon, authenticated` -- NOT `from anon`. 12 of the 27 carry
-- `=X/postgres` (the built-in EXECUTE-to-PUBLIC), and for those the shorter form
-- is a silent no-op. Measured on prod in a rolled-back transaction:
--
--   revoke execute on function public.apply_enrichment(...) from anon, authenticated;
--     -> acl becomes `=X/postgres | postgres=X/postgres | service_role=X/postgres`
--        (the anon and authenticated entries are visibly GONE)
--     -> has_function_privilege('anon', ...) is STILL TRUE
--
-- The ACL reads as revoked while the privilege survives. That is what left 50 of
-- 97 functions reachable in the first draft of 20260822100000. Never audit this
-- by eyeballing proacl; always ask has_function_privilege().

revoke execute on function public._apply_review_value(review_field_registry,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public._dedup_set_needs_attention(text,uuid,boolean) from public, anon, authenticated;
revoke execute on function public._dedup_write_corroboration_signal(text,uuid,uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public._ingest_firecrawl_rows(jsonb) from public, anon, authenticated;
revoke execute on function public._review_clear_needs_attention(text,uuid) from public, anon, authenticated;
revoke execute on function public._review_write_audit(text,uuid,text,jsonb,numeric,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public._review_write_provenance(text,uuid,text,jsonb,numeric,jsonb) from public, anon, authenticated;
revoke execute on function public.apply_enrichment(uuid,uuid,text,jsonb,text,text,text,integer,jsonb) from public, anon, authenticated;
revoke execute on function public.apply_news_refetch(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.auto_apply_feedback_duplicates(real) from public, anon, authenticated;
revoke execute on function public.flag_stale_feedback(integer) from public, anon, authenticated;
revoke execute on function public.gc_stale_api_errors(integer,integer) from public, anon, authenticated;
revoke execute on function public.get_similar_personalities(uuid,integer,double precision) from public, anon, authenticated;
revoke execute on function public.insert_event_reminder_notifications() from public, anon, authenticated;
revoke execute on function public.log_search_click(text,text,text) from public, anon, authenticated;
revoke execute on function public.promote_personality(uuid,text) from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text,integer,integer) from public, anon, authenticated;
revoke execute on function public.reclassify_news_categories(uuid,integer) from public, anon, authenticated;
revoke execute on function public.record_redirect_click(uuid,text,text,text,text,text,text,integer) from public, anon, authenticated;
revoke execute on function public.recount_unified_tag_usage_for(uuid[]) from public, anon, authenticated;
revoke execute on function public.search_documents_index_guides(uuid) from public, anon, authenticated;
revoke execute on function public.search_documents_index_landmarks(uuid) from public, anon, authenticated;
revoke execute on function public.search_documents_index_milestones(uuid) from public, anon, authenticated;
revoke execute on function public.search_documents_index_organizations(uuid) from public, anon, authenticated;
revoke execute on function public.track_umami_event(jsonb) from public, anon, authenticated;
revoke execute on function public.travel_inbox_post_item(uuid) from public, anon, authenticated;
revoke execute on function public.unpromote_personality(uuid) from public, anon, authenticated;

-- The gate's allowlist is now ONLY functions with a verified public caller.
-- Everything else that is VOLATILE + SECURITY DEFINER + non-trigger must be
-- unreachable by anon, and the gate fails if a new one appears. See
-- 20260824100000 for why this cannot be enforced by ALTER DEFAULT PRIVILEGES.
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
      'match_content_embeddings'        -- workers/submit — uses SUPABASE_ANON_KEY
      -- The `legacy` half is gone: all 27 were revoked in 20260902100000.
      -- Do not re-add a name here to make the gate pass. Read the FIX WHEN THIS
      -- FAILS block in scripts/check-anon-function-grants.mjs first.
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
