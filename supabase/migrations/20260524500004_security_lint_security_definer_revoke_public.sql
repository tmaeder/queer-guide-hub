-- The previous revoke targeted anon and authenticated directly, but the
-- functions only had a PUBLIC grant — anon and authenticated inherited
-- EXECUTE via PUBLIC, so the revoke was a no-op. Revoke from PUBLIC
-- (and from anon/authenticated for safety) on the full SECURITY DEFINER
-- set flagged by linter 0028/0029.
--
-- RLS helper functions are re-granted to authenticated so policies that
-- call them keep working. Switching these to SECURITY INVOKER is not
-- feasible — they query user_roles / auth tables that the user can't
-- read directly, and many policies reference them recursively. These
-- nine remaining lint hits are an accepted exception (same pattern the
-- project already uses for --destructive color and trip-safety colors).
--
-- The 0028/0029 lint will still report:
--   has_role, has_role_jwt, has_any_role_jwt, has_tier,
--   is_intimate_eligible, is_group_admin_or_mod, is_trip_member,
--   can_edit_trip, cms_can_edit
-- These are deliberate.

DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'approve_story_for_claude(uuid, text)',
    'archive_story(uuid, text)',
    'cancel_routine_run(uuid, text)',
    'city_markable_totals(uuid)',
    'cluster_news_article(uuid)',
    'cluster_news_backfill(integer, integer)',
    'cms_can_edit(text, uuid, uuid)',
    'commit_personality_staging_item(uuid, text)',
    'dispatch_claude_routine(uuid, text, text, text)',
    'evaluate_achievements(uuid)',
    'find_exact_duplicates()',
    'find_visual_duplicates(integer, integer)',
    'footprint_public_stats(uuid)',
    'footprint_return_nudge(uuid)',
    'footprint_stats(uuid)',
    'get_personalized_marketplace_listings(uuid, integer)',
    'get_unified_triage_queue(text[], text[], text, text, integer, integer)',
    'get_wishlist_by_slug(text)',
    'get_wishlist_save_counts(uuid[])',
    'has_any_role_jwt(public.app_role[])',
    'has_role(uuid, public.app_role)',
    'has_role_jwt(public.app_role)',
    'has_tier(uuid, text)',
    'hotels_top_cities(integer)',
    'intimate_get_my_text()',
    'intimate_is_blocked(uuid, uuid)',
    'intimate_report_to_moderation_flag()',
    'intimate_set_text(text, text)',
    'is_group_admin_or_mod(uuid, uuid)',
    'is_intimate_eligible(uuid)',
    'mark_story_needs_followup(uuid, text)',
    'merge_duplicate_images(uuid, uuid[])',
    'news_cities_with_articles()',
    'news_countries_with_articles()',
    'quest_create_recap_stub(uuid)',
    'reap_stuck_workflow_runs()',
    'record_fix_proposed(uuid, text, text, text[], text, text, text, text)',
    'record_retest_result(uuid, text, jsonb, text, text)',
    'record_routine_progress(uuid, text, jsonb, text, text)',
    'refresh_story_metadata(uuid)',
    'refresh_venue_leaderboards()',
    'rpc_venues_ranked(uuid, numeric, numeric, jsonb, text, integer, integer)',
    'start_retest(uuid, text, text)',
    'triage_action(uuid, text, text, uuid, text, text, boolean)',
    'unarchive_story(uuid)',
    'username_available(text)',
    'verify_story(uuid, text, text)',
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
    'approve_tag_suggestions(uuid[], uuid)',
    'audit_admin_data_access(uuid, uuid, text, text)',
    'basic_rate_limit(text, integer)',
    'cascade_story_to_members(uuid, text, smallint, uuid, text)',
    'check_mailbox_availability(text)',
    'check_rate_limit_enhanced(text, integer, integer, text)',
    'commit_marketplace_staging_item(uuid, text)',
    'commit_news_staging_item(uuid, text)',
    'count_invalid_coordinates()',
    'create_story(text, uuid[], text, text)',
    'decrement_comment_likes(uuid)',
    'decrement_post_likes(uuid)',
    'expand_all_recurring_events(integer)',
    'expand_event_recurrence(uuid, integer)',
    'find_invalid_coordinates(text, integer)',
    'flag_venue_safety_signal(uuid)',
    'get_admin_counts()',
    'get_broken_marketplace_ids()',
    'get_or_create_direct_conversation(uuid, uuid)',
    'get_or_create_email_token()',
    'get_staging_ids(text, text, text, integer)',
    'get_staging_ids(text, text, text, integer, text)',
    'get_staging_page(text, text, text, text, integer, integer, text, text)',
    'increment_article_views(uuid)',
    'increment_comment_likes(uuid)',
    'increment_listing_views(uuid)',
    'increment_personality_views(uuid)',
    'increment_post_comments(uuid)',
    'increment_post_likes(uuid)',
    'intimate_profile_key()',
    'log_security_event(text, uuid, jsonb, text)',
    'log_sensitive_data_access(uuid, uuid, text, text)',
    'match_content_embeddings(extensions.vector, double precision, integer)',
    'purge_trip_inbox_raw_bodies()',
    'recompute_user_tier(uuid)',
    'record_redirect_click(uuid, text, text, text, text, text, text, integer)',
    'record_safety_validation(uuid, uuid)',
    'record_search_audit(text, text, text, jsonb, jsonb, jsonb)',
    'refresh_contribution_metrics_yearly()',
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
    'story_member_divergence(uuid)',
    'submit_venue_safety_signal(uuid, uuid, boolean)',
    'suggest_story_from_ids(uuid[])',
    'verify_search_intelligence_install()',
    '_image_assets_upsert_link(text, uuid, text, text, text)',
    'contribution_metrics_for_year(integer)',
    'count_marketplace_subcategory(text)',
    'entities_along_route(text, integer, text[], integer)',
    'entities_in_polygon(text, text, integer)',
    'event_attendee_counts(uuid[])',
    'event_favorite_counts(uuid[])',
    'find_polygon_for_point(numeric, numeric)',
    'fork_public_trip(uuid)',
    'get_homepage_stats()',
    'get_marketplace_facets(text, text, text, uuid)',
    'get_marketplace_subcategory_counts()',
    'get_public_profile_safe(uuid)',
    'get_secure_venue_checkins(uuid)',
    'get_shared_trip(text)',
    'get_tag_graph_data(double precision, uuid)',
    'get_trending_entities(text[], text, integer)',
    'get_venue_safety_questions(uuid)',
    'get_venue_safety_score(uuid)',
    'get_venue_social_signals(uuid[], uuid)',
    'get_venues_by_tag(text[], integer)',
    'is_venue_open_at(uuid, timestamp with time zone)',
    'is_trip_member(uuid, uuid)',
    'can_edit_trip(uuid, uuid)',
    'post_like_counts(uuid[])',
    'track_share_view(text, text)',
    'venues_open_now(uuid, integer)'
  ];
  rls_helpers text[] := ARRAY[
    'has_role(uuid, public.app_role)',
    'has_role_jwt(public.app_role)',
    'has_any_role_jwt(public.app_role[])',
    'has_tier(uuid, text)',
    'is_intimate_eligible(uuid)',
    'is_group_admin_or_mod(uuid, uuid)',
    'is_trip_member(uuid, uuid)',
    'can_edit_trip(uuid, uuid)',
    'cms_can_edit(text, uuid, uuid)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', sig);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated', sig);
      IF sig = ANY(rls_helpers) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', sig);
      END IF;
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'skip: function not found public.%', sig;
      WHEN OTHERS THEN
        RAISE NOTICE 'revoke failed on public.%: %', sig, SQLERRM;
    END;
  END LOOP;
END $$;
