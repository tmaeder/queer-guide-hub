-- Restore FK-covering indexes that were dropped as "unused" but still cover
-- foreign keys (linter 0001 > 0005 — FK coverage wins). Plus
-- admin_automation_runs.automation_id, which had no prior index.
CREATE INDEX IF NOT EXISTS idx_admin_automation_runs_automation_id ON public.admin_automation_runs (automation_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id ON public.event_attendees (user_id);
CREATE INDEX IF NOT EXISTS idx_events_festival_id ON public.events (festival_id);
CREATE INDEX IF NOT EXISTS idx_feedback_retest_runs_routine_run_id ON public.feedback_retest_runs (routine_run_id);
CREATE INDEX IF NOT EXISTS idx_feedback_votes_user_id ON public.feedback_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_hotels_country_id ON public.hotels (country_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_user_id ON public.marketplace_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON public.message_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_personalities_death_country_id ON public.personalities (death_country_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_health_alerts_escalated_submission_id ON public.pipeline_health_alerts (escalated_submission_id);
CREATE INDEX IF NOT EXISTS idx_topic_cluster_tags_tag_id ON public.topic_cluster_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_topic_clusters_parent_cluster_id ON public.topic_clusters (parent_cluster_id);
CREATE INDEX IF NOT EXISTS idx_trip_collection_items_trip_id ON public.trip_collection_items (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user_id ON public.trip_members (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_places_reservation_id ON public.trip_places (reservation_id);
CREATE INDEX IF NOT EXISTS idx_user_place_marks_trip_id ON public.user_place_marks (trip_id);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_user_id ON public.venue_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_listing_id ON public.wishlist_items (listing_id);
