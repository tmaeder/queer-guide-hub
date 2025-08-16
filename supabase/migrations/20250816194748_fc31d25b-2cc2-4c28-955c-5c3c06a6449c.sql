-- Create essential database indexes for scalability

-- Countries table indexes
CREATE INDEX IF NOT EXISTS idx_countries_name ON countries USING btree (name);
CREATE INDEX IF NOT EXISTS idx_countries_continent ON countries USING btree (continent_id);
CREATE INDEX IF NOT EXISTS idx_countries_population ON countries USING btree (population);
CREATE INDEX IF NOT EXISTS idx_countries_coordinates ON countries USING btree (latitude, longitude);

-- Cities table indexes
CREATE INDEX IF NOT EXISTS idx_cities_name ON cities USING btree (name);
CREATE INDEX IF NOT EXISTS idx_cities_country ON cities USING btree (country_id);
CREATE INDEX IF NOT EXISTS idx_cities_population ON cities USING btree (population DESC);
CREATE INDEX IF NOT EXISTS idx_cities_coordinates ON cities USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_cities_capital ON cities USING btree (is_capital) WHERE is_capital = true;

-- Venues table indexes
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues USING btree (city);
CREATE INDEX IF NOT EXISTS idx_venues_category ON venues USING btree (category);
CREATE INDEX IF NOT EXISTS idx_venues_coordinates ON venues USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_venues_featured ON venues USING btree (featured DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venues_tags ON venues USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_venues_amenities ON venues USING gin (amenities);

-- Events table indexes
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events USING btree (start_date);
CREATE INDEX IF NOT EXISTS idx_events_city ON events USING btree (city);
CREATE INDEX IF NOT EXISTS idx_events_type ON events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_events_status ON events USING btree (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_events_featured ON events USING btree (featured DESC, start_date ASC);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events USING btree (venue_id);

-- Community posts indexes
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_visibility ON community_posts USING btree (visibility) WHERE visibility = 'public';

-- Profiles table indexes
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles USING btree (display_name);
CREATE INDEX IF NOT EXISTS idx_profiles_created ON profiles USING btree (created_at DESC);

-- Messages and conversations indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages USING btree (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants USING btree (user_id);

-- Favorites and user interaction indexes
CREATE INDEX IF NOT EXISTS idx_venue_favorites_user ON venue_favorites USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_event_favorites_user ON event_favorites USING btree (user_id);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications USING btree (read) WHERE read = false;

-- User roles indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles USING btree (role);

-- Compound indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_venues_city_category ON venues USING btree (city, category);
CREATE INDEX IF NOT EXISTS idx_events_city_date ON events USING btree (city, start_date);

-- Partial indexes for common filtered queries
CREATE INDEX IF NOT EXISTS idx_events_active_upcoming ON events USING btree (start_date) 
WHERE status = 'active' AND start_date >= CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_venues_active_featured ON venues USING btree (featured DESC, created_at DESC);