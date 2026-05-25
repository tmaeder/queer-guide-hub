-- Fix Supabase linter: anon_security_definer_function_executable (0028)
-- and authenticated_security_definer_function_executable (0029).
-- Revoke EXECUTE from anon and authenticated on every flagged SECURITY
-- DEFINER function. Triggers still fire (they run as table owner, not
-- via EXECUTE permission); admin/internal RPCs become unreachable from
-- the Data API. Public-facing RPCs (increment_*_views, get_wishlist_*,
-- get_homepage_stats, get_shared_trip, etc.) will also become unreachable
-- — the frontend must be updated to call them via service-role edge
-- functions, or this migration partially reverted for the specific
-- functions you want public.
--
-- Exclusions: RLS helper functions remain executable to authenticated.
-- Revoking them would break every policy that calls them and produce
-- instant 500s across the app:
--   has_role, has_role_jwt, has_any_role_jwt, has_tier,
--   is_intimate_eligible, is_group_admin_or_mod, is_trip_member,
--   can_edit_trip, cms_can_edit
-- These still appear in the linter — accept as documented exceptions
-- the same way the project already keeps a chromatic --destructive
-- color and the trip-safety traffic light.
--
-- Re-grant pattern if you discover a function the frontend needs:
--   GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO authenticated;

DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    -- trigger functions (also revoke from PUBLIC)
    'auto_approve_on_city_link()',
    'admin_automation_runs_after_finish()',
    'marketplace_guides_refresh_pick_count()',
    'match_personality_city()',
    'match_personality_death_city()',
    'notify_event_geocode()',
    'notify_venue_geocode()',
    'on_venue_checkin_inserted()',
    'propagate_venue_city_to_events()',
    'sync_tag_alias_to_search_synonym()',
    'tg_marketplace_listings_sync_image_assets()',
    'tg_news_articles_sync_image_assets()',
    'tg_trust_on_endorsement()',
    'tg_trust_on_submission_accepted()',
    'update_group_member_count()',
    'user_place_marks_fill_city()',
    -- admin / internal RPCs
    '_image_assets_upsert_link(text, uuid, text, text, text)',
    'accept_story_suggestion(uuid, text)',
    'add_story_members(uuid, uuid[])',
    'admin_automation_dry_run(text)',
    'admin_automation_dry_run_all()',
    'admin_automation_pause_all(boolean)',
    'admin_automation_record_failure(uuid, bigint, text)',
    'admin_automation_record_success(uuid)',
    'admin_automation_run(text)',
    'admin_automation_set_enabled(text, boolean)',
    'admin_bulk_review_action(text, uuid)',
    'approve_editorial_draft(uuid)',
    'approve_story_for_claude(uuid, text)',
    'approve_tag_suggestions(uuid[], uuid)',
    'archive_story(uuid, text)',
    'audit_admin_data_access(uuid, uuid, text, text)',
    'basic_rate_limit(text, integer)',
    'cancel_routine_run(uuid, text)',
    'cascade_story_to_members(uuid, text, smallint, uuid, text)',
    'check_mailbox_availability(text)',
    'check_rate_limit_enhanced(text, integer, integer, text)',
    'cluster_news_article(uuid)',
    'cluster_news_backfill(integer, integer)',
    'commit_marketplace_staging_item(uuid, text)',
    'commit_news_staging_item(uuid, text)',
    'commit_personality_staging_item(uuid, text)',
    'count_invalid_coordinates()',
    'create_story(text, uuid[], text, text)',
    'decrement_comment_likes(uuid)',
    'decrement_post_likes(uuid)',
    'dispatch_claude_routine(uuid, text, text, text)',
    'evaluate_achievements(uuid)',
    'expand_all_recurring_events(integer)',
    'expand_event_recurrence(uuid, integer)',
    'find_exact_duplicates()',
    'find_invalid_coordinates(text, integer)',
    'find_visual_duplicates(integer, integer)',
    'flag_venue_safety_signal(uuid)',
    'get_admin_counts()',
    'get_broken_marketplace_ids()',
    'get_or_create_direct_conversation(uuid, uuid)',
    'get_or_create_email_token()',
    'get_staging_ids(text, text, text, integer)',
    'get_staging_ids(text, text, text, integer, text)',
    'get_staging_page(text, text, text, text, integer, integer, text, text)',
    'get_unified_triage_queue(text[], text[], text, text, integer, integer)',
    'increment_article_views(uuid)',
    'increment_comment_likes(uuid)',
    'increment_listing_views(uuid)',
    'increment_personality_views(uuid)',
    'increment_post_comments(uuid)',
    'increment_post_likes(uuid)',
    'intimate_get_my_text()',
    'intimate_is_blocked(uuid, uuid)',
    'intimate_profile_key()',
    'intimate_report_to_moderation_flag()',
    'intimate_set_text(text, text)',
    'log_security_event(text, uuid, jsonb, text)',
    'log_sensitive_data_access(uuid, uuid, text, text)',
    'mark_story_needs_followup(uuid, text)',
    'match_content_embeddings(extensions.vector, double precision, integer)',
    'merge_duplicate_images(uuid, uuid[])',
    'purge_trip_inbox_raw_bodies()',
    'quest_create_recap_stub(uuid)',
    'reap_stuck_workflow_runs()',
    'recompute_user_tier(uuid)',
    'record_fix_proposed(uuid, text, text, text[], text, text, text, text)',
    'record_redirect_click(uuid, text, text, text, text, text, text, integer)',
    'record_retest_result(uuid, text, jsonb, text, text)',
    'record_routine_progress(uuid, text, jsonb, text, text)',
    'record_safety_validation(uuid, uuid)',
    'record_search_audit(text, text, text, jsonb, jsonb, jsonb)',
    'refresh_contribution_metrics_yearly()',
    'refresh_story_metadata(uuid)',
    'refresh_venue_leaderboards()',
    'remove_story_members(uuid, uuid[])',
    'resolve_story(uuid, boolean)',
    'rotate_email_token()',
    'run_enrichment_log_purge()',
    'run_event_auto_archive()',
    'run_ingestion_events_purge()',
    'run_news_dedup_audit_purge()',
    'run_scraper_dedupe_purge()',
    'run_staging_auto_reject_stale()',
    'run_workflow_runs_purge()',
    'set_story_narrative(uuid, text, text, boolean)',
    'start_retest(uuid, text, text)',
    'story_member_divergence(uuid)',
    'submit_venue_safety_signal(uuid, uuid, boolean)',
    'suggest_story_from_ids(uuid[])',
    'triage_action(uuid, text, text, uuid, text, text, boolean)',
    'unarchive_story(uuid)',
    'verify_search_intelligence_install()',
    'verify_story(uuid, text, text)',
    -- public-facing helpers (frontend may call these — re-grant if needed)
    'city_markable_totals(uuid)',
    'contribution_metrics_for_year(integer)',
    'count_marketplace_subcategory(text)',
    'entities_along_route(text, integer, text[], integer)',
    'entities_in_polygon(text, text, integer)',
    'event_attendee_counts(uuid[])',
    'event_favorite_counts(uuid[])',
    'find_polygon_for_point(numeric, numeric)',
    'footprint_public_stats(uuid)',
    'footprint_return_nudge(uuid)',
    'footprint_stats(uuid)',
    'fork_public_trip(uuid)',
    'get_homepage_stats()',
    'get_marketplace_facets(text, text, text, uuid)',
    'get_marketplace_subcategory_counts()',
    'get_personalized_marketplace_listings(uuid, integer)',
    'get_public_profile_safe(uuid)',
    'get_secure_venue_checkins(uuid)',
    'get_shared_trip(text)',
    'get_tag_graph_data(double precision, uuid)',
    'get_trending_entities(text[], text, integer)',
    'get_venue_safety_questions(uuid)',
    'get_venue_safety_score(uuid)',
    'get_venue_social_signals(uuid[], uuid)',
    'get_venues_by_tag(text[], integer)',
    'get_wishlist_by_slug(text)',
    'get_wishlist_save_counts(uuid[])',
    'hotels_top_cities(integer)',
    'is_venue_open_at(uuid, timestamp with time zone)',
    'news_cities_with_articles()',
    'news_countries_with_articles()',
    'post_like_counts(uuid[])',
    'rpc_venues_ranked(uuid, numeric, numeric, jsonb, text, integer, integer)',
    'track_share_view(text, text)',
    'username_available(text)',
    'venues_open_now(uuid, integer)'
  ];
  trigger_only_prefix text;
  trigger_only_prefixes text[] := ARRAY[
    'auto_approve_on_city_link',
    'admin_automation_runs_after_finish',
    'marketplace_guides_refresh_pick_count',
    'match_personality_city',
    'match_personality_death_city',
    'notify_event_geocode',
    'notify_venue_geocode',
    'on_venue_checkin_inserted',
    'propagate_venue_city_to_events',
    'sync_tag_alias_to_search_synonym',
    'tg_marketplace_listings_sync_image_assets',
    'tg_news_articles_sync_image_assets',
    'tg_trust_on_endorsement',
    'tg_trust_on_submission_accepted',
    'update_group_member_count',
    'user_place_marks_fill_city'
  ];
  is_trigger_only boolean;
  fn_name text;
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    fn_name := split_part(sig, '(', 1);
    is_trigger_only := fn_name = ANY(trigger_only_prefixes);
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated',
        sig
      );
      IF is_trigger_only THEN
        EXECUTE format(
          'REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC',
          sig
        );
      END IF;
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'skip: function not found public.%', sig;
      WHEN OTHERS THEN
        RAISE NOTICE 'revoke failed on public.%: %', sig, SQLERRM;
    END;
  END LOOP;
END $$;
