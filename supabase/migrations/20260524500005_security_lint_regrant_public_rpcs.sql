-- Re-grant EXECUTE on the public-facing SECURITY DEFINER RPCs that the
-- frontend actually calls. Identified by grepping src/ and workers/ for
-- .rpc('<name>') and intersecting with the revoke list. Each function
-- below will re-introduce a 0028/0029 warning — accepted exception, same
-- pattern as the RLS helpers and chromatic --destructive.
DO $$
DECLARE
  sig text;
  anon_sigs text[] := ARRAY[
    'city_markable_totals(uuid)',
    'contribution_metrics_for_year(integer)',
    'count_marketplace_subcategory(text)',
    'entities_along_route(text, integer, text[], integer)',
    'entities_in_polygon(text, text, integer)',
    'event_attendee_counts(uuid[])',
    'event_favorite_counts(uuid[])',
    'find_polygon_for_point(numeric, numeric)',
    'footprint_public_stats(uuid)',
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
    'increment_article_views(uuid)',
    'increment_listing_views(uuid)',
    'increment_personality_views(uuid)',
    'is_venue_open_at(uuid, timestamp with time zone)',
    'news_cities_with_articles()',
    'news_countries_with_articles()',
    'post_like_counts(uuid[])',
    'rpc_venues_ranked(uuid, numeric, numeric, jsonb, text, integer, integer)',
    'track_share_view(text, text)',
    'username_available(text)',
    'venues_open_now(uuid, integer)',
    'check_mailbox_availability(text)',
    'record_redirect_click(uuid, text, text, text, text, text, text, integer)',
    'match_content_embeddings(extensions.vector, double precision, integer)'
  ];
  auth_sigs text[] := ARRAY[
    'decrement_comment_likes(uuid)',
    'decrement_post_likes(uuid)',
    'evaluate_achievements(uuid)',
    'flag_venue_safety_signal(uuid)',
    'footprint_return_nudge(uuid)',
    'footprint_stats(uuid)',
    'fork_public_trip(uuid)',
    'get_or_create_direct_conversation(uuid, uuid)',
    'get_or_create_email_token()',
    'increment_comment_likes(uuid)',
    'increment_post_comments(uuid)',
    'increment_post_likes(uuid)',
    'intimate_get_my_text()',
    'intimate_is_blocked(uuid, uuid)',
    'intimate_profile_key()',
    'intimate_report_to_moderation_flag()',
    'intimate_set_text(text, text)',
    'quest_create_recap_stub(uuid)',
    'record_safety_validation(uuid, uuid)',
    'record_search_audit(text, text, text, jsonb, jsonb, jsonb)',
    'rotate_email_token()',
    'submit_venue_safety_signal(uuid, uuid, boolean)'
  ];
BEGIN
  FOREACH sig IN ARRAY anon_sigs LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', sig);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'skip: function not found public.%', sig;
      WHEN OTHERS THEN
        RAISE NOTICE 'grant failed on public.%: %', sig, SQLERRM;
    END;
  END LOOP;
  FOREACH sig IN ARRAY auth_sigs LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', sig);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'skip: function not found public.%', sig;
      WHEN OTHERS THEN
        RAISE NOTICE 'grant failed on public.%: %', sig, SQLERRM;
    END;
  END LOOP;
END $$;
