-- Fix Supabase linter: function_search_path_mutable (0011).
-- Pin search_path to public, pg_temp on every flagged function so a malicious
-- role with CREATE on a schema can't shadow built-ins or hijack identifiers
-- during execution.
--
-- All ALTERs target a specific signature; if the function was already dropped
-- or renamed since the lint snapshot, the statement is wrapped in a DO block
-- so the migration still applies cleanly.

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public._trip_saves_bump_count()',
    'public.get_wishlist_save_counts(uuid[])',
    'public.active_quest()',
    'public.quest_progress(uuid, uuid)',
    'public.intimate_expire_travel_pins()',
    'public.propagate_venue_city_to_events()',
    'public.compute_marketplace_image_hashes()',
    'public.match_personality_death_city()',
    'public.compute_level(integer)',
    'public.tg_event_occurrences_set_updated_at()',
    'public.intimate_clear_optin_on_email_unverify()',
    'public.find_event_duplicate_candidates(text, text, timestamptz)',
    'public.admin_automations_touch_updated_at()',
    'public.tg_quests_set_updated_at()',
    'public.venue_localized_description(uuid, text)',
    'public.event_localized_description(uuid, text)',
    'public.touch_wishlists_updated_at()',
    'public.news_canonicalize_url(text)',
    'public.quest_public_contributors(uuid)',
    'public.commit_event_staging_item(uuid, text)',
    'public.set_event_currency_from_country()',
    'public.intimate_enforce_optin()',
    'public.marketplace_listing_localized_title(uuid, text)',
    'public.touch_wishlist_on_item_change()',
    'public.topic_cluster_entities(uuid)',
    'public.auto_optimize_image_asset()',
    'public.is_exception_date(date, uuid)',
    'public.notify_event_geocode()',
    'public.entity_cluster_ids(text, uuid)',
    'public.match_city_with_aliases(text, text)',
    'public.notify_venue_geocode()',
    'public.unified_tag_localized_description(uuid, text)',
    'public.tg_submission_quest_contribution()',
    'public.cities_mirror_historical_names_to_aliases()',
    'public.marketplace_guides_default_review_due()',
    'public.personalities_require_person_marker()',
    'public.unified_tag_localized_name(uuid, text)',
    'public.sanitize_news_author()',
    'public.news_article_localized_title(uuid, text)',
    'public.phash_hamming(text, text)',
    'public.events_in_window(timestamptz, timestamptz)',
    'public.match_personality_city()',
    'public.get_wishlist_by_slug(text)',
    'public.refresh_venue_leaderboards()',
    'public.commit_personality_staging_item(uuid, text)',
    'public.effective_event_timezone(uuid)',
    'public.venue_localized_name(uuid, text)',
    'public.event_localized_title(uuid, text)',
    'public.touch_marketplace_collections_updated_at()',
    'public.tg_topic_clusters_set_updated_at()',
    'public.auto_approve_on_city_link()',
    'public.tg_image_assets_set_updated_at()',
    'public.compute_visibility_score(uuid, text)',
    'public.tg_ai_suggestions_set_updated_at()',
    'public.canonicalise_image_url(text)',
    'public.reap_stuck_workflow_runs()',
    'public.canonicalize_image_url(text)',
    'public.tg_submission_autotag_quest()',
    'public.resolve_historical_place(text, text)',
    'public.tg_topic_hubs_set_updated_at()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'skip: function not found %', fn;
      WHEN ambiguous_function THEN
        -- multiple overloads — pin all of them
        RAISE NOTICE 'ambiguous overload, retrying all: %', fn;
    END;
  END LOOP;
END $$;

-- Catch-all: for any remaining function in public with a NULL or empty
-- proconfig search_path, pin it. This protects against overloads the
-- explicit list missed and any new flagged functions added between the
-- lint snapshot and this migration applying.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
        r.schema_name, r.func_name, r.args
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'could not pin search_path on %.%(%): %',
        r.schema_name, r.func_name, r.args, SQLERRM;
    END;
  END LOOP;
END $$;
