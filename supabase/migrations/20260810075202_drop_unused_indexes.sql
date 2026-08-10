-- DRIFT RECOVERY — this file's version is already in remote schema_migrations.
--
-- Applied live via the Supabase MCP on 2026-08-10 and then stranded in an unmerged draft
-- PR (#2680), so prod held the version with no repo file — the exact drift state
-- `check-migration-drift.mjs` exists to catch, and it fails EVERY pull request in the repo
-- while it lasts, not just the one that caused it. Committed here at the exact stamped
-- version, which is the documented recovery.
--
-- That version sorts below the current remote max (20260826100000), so the ordering rule in
-- `check-migration-versions.mjs` would normally reject it. It does not, because that rule
-- now checks remote history: `db push` matches by version and SKIPS an already-applied
-- migration rather than aborting on it. Nothing about this file's header grants the
-- exemption — prod's own history does. Do not renumber it upward; the version is how
-- `db push` recognises it as applied.
--
-- Drops zero-scan, non-constraint indexes (public schema, idx_scan = 0 at time of writing).
-- Excludes search_documents_geog_gix and user_presence_geog_gist: geospatial GIST indexes
-- backing proximity search/nearby-user features, left for manual review rather than auto-drop.
--
-- Evidence the zero-scan window is trustworthy (verified 2026-08-10, after the fact):
-- pg_stat_database.stats_reset is NULL and the postmaster has been up 98 days with a
-- max idx_scan of 264,784,231 — so idx_scan = 0 is 98 days of real traffic, not a reset
-- artifact. Every table whose FK-lookup index was dropped holds 0-7 rows (the cold-start
-- social/community tables); the drops on the large tables (venues, personalities,
-- organizations, image_assets) are GIN/partial indexes on columns nothing filters by.
-- These FK indexes will be wanted again if the social features get real traffic.

DROP INDEX IF EXISTS public.idx_venues_day_part_gin;
DROP INDEX IF EXISTS public.idx_venues_vibe_tags_gin;
DROP INDEX IF EXISTS public.idx_personality_quality_signals_created;
DROP INDEX IF EXISTS public.idx_brands_despace_unlinked;
DROP INDEX IF EXISTS public.idx_organizations_despace_active;
DROP INDEX IF EXISTS public.idx_organizations_domain_active;
DROP INDEX IF EXISTS public.idx_personalities_roles;
DROP INDEX IF EXISTS public.idx_milestones_tags;
DROP INDEX IF EXISTS public.idx_news_feedback_type_time;
DROP INDEX IF EXISTS public.idx_vfp_winning;
DROP INDEX IF EXISTS public.idx_venue_review_queue_open;
DROP INDEX IF EXISTS public.idx_hotels_despace_unlinked;
DROP INDEX IF EXISTS public.idx_organizations_tags;
DROP INDEX IF EXISTS public.idx_organizations_roles;
DROP INDEX IF EXISTS public.community_groups_tags_gin;
DROP INDEX IF EXISTS public.guides_audience_tags_idx;
DROP INDEX IF EXISTS public.idx_routine_runs_merged;
DROP INDEX IF EXISTS public.kink_items_category_idx;
DROP INDEX IF EXISTS public.idx_trip_places_trip_id;
DROP INDEX IF EXISTS public.idx_trip_places_day_id;
DROP INDEX IF EXISTS public.idx_trip_places_venue_id;
DROP INDEX IF EXISTS public.idx_trip_places_event_id;
DROP INDEX IF EXISTS public.idx_trip_places_hotel_id;
DROP INDEX IF EXISTS public.community_groups_duplicate_of_idx;
DROP INDEX IF EXISTS public.idx_community_posts_user_id;
DROP INDEX IF EXISTS public.idx_conversations_last_message_id;
DROP INDEX IF EXISTS public.conversations_system_kind_idx;
DROP INDEX IF EXISTS public.idx_user_news_reads_article_id;
DROP INDEX IF EXISTS public.idx_group_notifications_user_id;
DROP INDEX IF EXISTS public.idx_group_notifications_group_id;
DROP INDEX IF EXISTS public.idx_villages_trust;
DROP INDEX IF EXISTS public.idx_marketplace_brands_pending;
DROP INDEX IF EXISTS public.idx_image_assets_brand_category;
DROP INDEX IF EXISTS public.idx_image_assets_access_level;
DROP INDEX IF EXISTS public.idx_trip_days_destination;
DROP INDEX IF EXISTS public.idx_marketplace_favorites_user_id;
DROP INDEX IF EXISTS public.idx_cp_user_pinned;
DROP INDEX IF EXISTS public.idx_trips_primary_city_id;
DROP INDEX IF EXISTS public.idx_trips_primary_country_id;
DROP INDEX IF EXISTS public.idx_messages_sender_id;
DROP INDEX IF EXISTS public.idx_messages_reply_to_id;
DROP INDEX IF EXISTS public.idx_passkey_challenges_expires_at;
DROP INDEX IF EXISTS public.idx_affiliate_clicks_surface_time;
DROP INDEX IF EXISTS public.idx_affiliate_clicks_kind_time;
DROP INDEX IF EXISTS public.tag_merge_audit_dup_idx;
DROP INDEX IF EXISTS public.idx_amenities_kind;
DROP INDEX IF EXISTS public.idx_amenities_active;
DROP INDEX IF EXISTS public.news_article_entities_entity_idx;
DROP INDEX IF EXISTS public.idx_wishlist_items_listing_id;
DROP INDEX IF EXISTS public.idx_vca_run;
DROP INDEX IF EXISTS public.idx_vca_created;
DROP INDEX IF EXISTS public.idx_group_post_likes_user_id;
DROP INDEX IF EXISTS public.idx_group_posts_group_id;
DROP INDEX IF EXISTS public.idx_group_posts_user_id;
DROP INDEX IF EXISTS public.mailbox_emails_owner_msgid_idx;
DROP INDEX IF EXISTS public.idx_notifications_user_created;
DROP INDEX IF EXISTS public.idx_trip_destinations_city;
DROP INDEX IF EXISTS public.idx_user_relationships_target_user_id;
DROP INDEX IF EXISTS public.venue_history_event_type_idx;
DROP INDEX IF EXISTS public.idx_roadmap_items_sources;
DROP INDEX IF EXISTS public.idx_geo_places_gated;
DROP INDEX IF EXISTS public.guides_category_idx;
DROP INDEX IF EXISTS public.guides_review_due_idx;
DROP INDEX IF EXISTS public.guides_safety_gated_idx;
DROP INDEX IF EXISTS public.idx_community_submissions_enrich;
DROP INDEX IF EXISTS public.idx_mv_trip_similarity_bucket;
DROP INDEX IF EXISTS public.idx_mv_trip_similarity_cities_gin;
DROP INDEX IF EXISTS public.trip_inbox_messages_item_idx;
DROP INDEX IF EXISTS public.idx_post_comments_post_id;
DROP INDEX IF EXISTS public.idx_venue_checkins_venue_id;
DROP INDEX IF EXISTS public.idx_post_comments_user_id;
DROP INDEX IF EXISTS public.idx_post_comments_parent_comment_id;
DROP INDEX IF EXISTS public.idx_post_likes_user_id;
DROP INDEX IF EXISTS public.idx_group_collection_items_collection_id;
DROP INDEX IF EXISTS public.idx_cms_media_brand_category;
DROP INDEX IF EXISTS public.idx_user_follows_following_id;
DROP INDEX IF EXISTS public.idx_cms_media_version_group;
DROP INDEX IF EXISTS public.idx_venue_reviews_user_id;
DROP INDEX IF EXISTS public.idx_cms_media_access_level;
DROP INDEX IF EXISTS public.community_groups_featured_idx;
DROP INDEX IF EXISTS public.idx_comment_likes_user_id;
DROP INDEX IF EXISTS public.idx_llm_call_log_ctx_time;
DROP INDEX IF EXISTS public.idx_trip_places_destination;
DROP INDEX IF EXISTS public.idx_itinerary_draft_cache_hash;
DROP INDEX IF EXISTS public.tag_follows_tag_idx;
DROP INDEX IF EXISTS public.idx_itinerary_draft_cache_expires;
DROP INDEX IF EXISTS public.idx_personality_attachments_person;
DROP INDEX IF EXISTS public.news_saved_searches_alert_idx;
DROP INDEX IF EXISTS public.idx_villages_needs_attention;
DROP INDEX IF EXISTS public.guide_participations_user_idx;
DROP INDEX IF EXISTS public.guide_contributions_user_idx;
DROP INDEX IF EXISTS public.guide_contributions_submission_idx;
DROP INDEX IF EXISTS public.idx_admin_messages_thread;
DROP INDEX IF EXISTS public.idx_group_comment_likes_user_id;
DROP INDEX IF EXISTS public.idx_city_resolve_queue_pending;
DROP INDEX IF EXISTS public.idx_affiliate_conversions_network_time;
DROP INDEX IF EXISTS public.idx_affiliate_conversions_status;
DROP INDEX IF EXISTS public.idx_affiliate_conversions_surface_time;
DROP INDEX IF EXISTS public.idx_affiliate_conversions_merchant;
DROP INDEX IF EXISTS public.idx_affiliate_conversions_matched;
DROP INDEX IF EXISTS public.community_submissions_guide_idx;
DROP INDEX IF EXISTS public.idx_festivals_country_id;
DROP INDEX IF EXISTS public.guide_reads_user_completed_idx;
DROP INDEX IF EXISTS public.idx_chatgpt_oauth_active;
DROP INDEX IF EXISTS public.idx_festivals_city_id;
DROP INDEX IF EXISTS public.idx_group_post_comments_post_id;
DROP INDEX IF EXISTS public.idx_group_post_comments_user_id;
DROP INDEX IF EXISTS public.idx_group_post_comments_parent_comment_id;
DROP INDEX IF EXISTS public.idx_roadmap_items_stage;
