-- Phase 3: restore hot-path FK indexes dropped in phase 2.
-- These cover columns used in user-facing joins / cascades that scale with traffic.
-- Cold tables (admin/audit/created_by/updated_by) intentionally remain unindexed —
-- the unused_index lint is the right read for those.

-- Messaging hot paths
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON public.conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_id    ON public.conversations (last_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id         ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id               ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id             ON public.messages (reply_to_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id        ON public.message_reactions (user_id);

-- Posts / comments / likes
CREATE INDEX IF NOT EXISTS idx_community_posts_user_id          ON public.community_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id            ON public.post_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user_id            ON public.post_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent_comment_id  ON public.post_comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id               ON public.post_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id            ON public.comment_likes (user_id);

-- Group surfaces
CREATE INDEX IF NOT EXISTS idx_group_posts_group_id             ON public.group_posts (group_id);
CREATE INDEX IF NOT EXISTS idx_group_posts_user_id              ON public.group_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_group_post_comments_post_id      ON public.group_post_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_group_post_comments_user_id      ON public.group_post_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_group_post_comments_parent_comment_id ON public.group_post_comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_group_post_likes_user_id         ON public.group_post_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_group_comment_likes_user_id      ON public.group_comment_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_group_notifications_user_id      ON public.group_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_group_notifications_group_id     ON public.group_notifications (group_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_sender_id    ON public.group_chat_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_group_collection_items_collection_id ON public.group_collection_items (collection_id);

-- Trips (heavy joins per trip view)
CREATE INDEX IF NOT EXISTS idx_trips_owner_id                   ON public.trips (owner_id);
CREATE INDEX IF NOT EXISTS idx_trips_primary_city_id            ON public.trips (primary_city_id);
CREATE INDEX IF NOT EXISTS idx_trips_primary_country_id         ON public.trips (primary_country_id);
CREATE INDEX IF NOT EXISTS idx_trip_places_trip_id              ON public.trip_places (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_places_day_id               ON public.trip_places (day_id);
CREATE INDEX IF NOT EXISTS idx_trip_places_venue_id             ON public.trip_places (venue_id);
CREATE INDEX IF NOT EXISTS idx_trip_places_event_id             ON public.trip_places (event_id);
CREATE INDEX IF NOT EXISTS idx_trip_places_hotel_id             ON public.trip_places (hotel_id);
CREATE INDEX IF NOT EXISTS idx_trip_messages_trip_id            ON public.trip_messages (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_messages_sender_id          ON public.trip_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_trip_polls_trip_id               ON public.trip_polls (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_share_views_trip_id         ON public.trip_share_views (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_share_views_viewer_user_id  ON public.trip_share_views (viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_trip_share_reactions_trip_id     ON public.trip_share_reactions (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_share_comments_trip_id      ON public.trip_share_comments (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_shares_trip_id              ON public.trip_shares (trip_id);
CREATE INDEX IF NOT EXISTS idx_reservations_trip_id             ON public.reservations (trip_id);

-- Entity page reads (venue/event detail)
CREATE INDEX IF NOT EXISTS idx_venue_checkins_venue_id          ON public.venue_checkins (venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_user_id            ON public.venue_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_venue_personal_visits_venue_id   ON public.venue_personal_visits (venue_id);
CREATE INDEX IF NOT EXISTS idx_events_venue_id                  ON public.events (venue_id);
CREATE INDEX IF NOT EXISTS idx_personalities_city_id            ON public.personalities (city_id);
CREATE INDEX IF NOT EXISTS idx_festivals_city_id                ON public.festivals (city_id);
CREATE INDEX IF NOT EXISTS idx_festivals_country_id             ON public.festivals (country_id);

-- Social graph + marketplace
CREATE INDEX IF NOT EXISTS idx_user_follows_following_id        ON public.user_follows (following_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_target_user_id ON public.user_relationships (target_user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_favorites_user_id    ON public.marketplace_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_listing_id        ON public.wishlist_items (listing_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id          ON public.event_attendees (user_id);
