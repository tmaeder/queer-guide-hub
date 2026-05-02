-- Create comprehensive database indexes for scalability

-- Countries table indexes
CREATE INDEX IF NOT EXISTS idx_countries_name ON countries USING btree (name);
CREATE INDEX IF NOT EXISTS idx_countries_continent ON countries USING btree (continent_id);
CREATE INDEX IF NOT EXISTS idx_countries_population ON countries USING btree (population);
CREATE INDEX IF NOT EXISTS idx_countries_area ON countries USING btree (area_km2);
CREATE INDEX IF NOT EXISTS idx_countries_coordinates ON countries USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_countries_search ON countries USING gin ((name || ' ' || COALESCE(capital, '')));

-- Cities table indexes
CREATE INDEX IF NOT EXISTS idx_cities_name ON cities USING btree (name);
CREATE INDEX IF NOT EXISTS idx_cities_country ON cities USING btree (country_id);
CREATE INDEX IF NOT EXISTS idx_cities_population ON cities USING btree (population DESC);
CREATE INDEX IF NOT EXISTS idx_cities_coordinates ON cities USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_cities_search ON cities USING gin ((name || ' ' || COALESCE(region_name, '')));
CREATE INDEX IF NOT EXISTS idx_cities_capital ON cities USING btree (is_capital) WHERE is_capital = true;
CREATE INDEX IF NOT EXISTS idx_cities_major ON cities USING btree (is_major_city) WHERE is_major_city = true;

-- Venues table indexes
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues USING btree (city);
CREATE INDEX IF NOT EXISTS idx_venues_category ON venues USING btree (category);
CREATE INDEX IF NOT EXISTS idx_venues_coordinates ON venues USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_venues_featured ON venues USING btree (featured DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venues_tags ON venues USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_venues_amenities ON venues USING gin (amenities);
CREATE INDEX IF NOT EXISTS idx_venues_services ON venues USING gin (services);
CREATE INDEX IF NOT EXISTS idx_venues_accessibility ON venues USING gin (accessibility_attributes);
CREATE INDEX IF NOT EXISTS idx_venues_target_groups ON venues USING gin (target_groups);
CREATE INDEX IF NOT EXISTS idx_venues_search ON venues USING gin ((name || ' ' || COALESCE(description, '') || ' ' || COALESCE(address, '')));
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues USING btree (is_active) WHERE is_active = true;

-- Events table indexes
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events USING btree (start_date);
CREATE INDEX IF NOT EXISTS idx_events_city ON events USING btree (city);
CREATE INDEX IF NOT EXISTS idx_events_type ON events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_events_status ON events USING btree (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_events_featured ON events USING btree (featured DESC, start_date ASC);
CREATE INDEX IF NOT EXISTS idx_events_coordinates ON events USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events USING btree (venue_id);
CREATE INDEX IF NOT EXISTS idx_events_accessibility ON events USING gin (accessibility_attributes);
CREATE INDEX IF NOT EXISTS idx_events_target_groups ON events USING gin (target_groups);
CREATE INDEX IF NOT EXISTS idx_events_search ON events USING gin ((title || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_events_date_range ON events USING btree (start_date, end_date);

-- Community posts indexes
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_visibility ON community_posts USING btree (visibility) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_community_posts_type ON community_posts USING btree (post_type);
CREATE INDEX IF NOT EXISTS idx_community_posts_tags ON community_posts USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_community_posts_pinned ON community_posts USING btree (pinned DESC, created_at DESC);

-- Profiles table indexes
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles USING btree (display_name);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles USING btree (city);
CREATE INDEX IF NOT EXISTS idx_profiles_created ON profiles USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_verification ON profiles USING btree (verified_identity) WHERE verified_identity = true;

-- Messages and conversations indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages USING btree (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages USING btree (sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conv ON conversation_participants USING btree (conversation_id);

-- Groups and group-related indexes
CREATE INDEX IF NOT EXISTS idx_community_groups_created_by ON community_groups USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_community_groups_private ON community_groups USING btree (is_private);
CREATE INDEX IF NOT EXISTS idx_community_groups_tags ON community_groups USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members USING btree (group_id);

-- Favorites and user interaction indexes
CREATE INDEX IF NOT EXISTS idx_venue_favorites_user ON venue_favorites USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_event_favorites_user ON event_favorites USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_city_favorites_user ON city_favorites USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_country_favorites_user ON country_favorites USING btree (user_id);

-- Checkins and activity indexes
CREATE INDEX IF NOT EXISTS idx_venue_checkins_user ON venue_checkins USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_venue ON venue_checkins USING btree (venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_date ON venue_checkins USING btree (checked_in_at DESC);

-- CMS and content indexes
CREATE INDEX IF NOT EXISTS idx_cms_content_type ON cms_content USING btree (content_type);
CREATE INDEX IF NOT EXISTS idx_cms_content_workflow ON cms_content USING btree (workflow_state);
CREATE INDEX IF NOT EXISTS idx_cms_content_visibility ON cms_content USING btree (visibility_level);
CREATE INDEX IF NOT EXISTS idx_cms_content_published ON cms_content USING btree (published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_content_tags ON cms_content USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_cms_content_deleted ON cms_content USING btree (deleted_at) WHERE deleted_at IS NULL;

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications USING btree (read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications USING btree (type);

-- Import and audit indexes
CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs_enhanced USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs_enhanced USING btree (status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created ON import_jobs_enhanced USING btree (created_at DESC);

-- Security and access indexes
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON access_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_ip ON access_logs USING btree (ip_address);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs USING btree (created_at DESC);

-- User roles indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles USING btree (role);

-- Create compound indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_venues_city_category ON venues USING btree (city, category);
CREATE INDEX IF NOT EXISTS idx_events_city_date ON events USING btree (city, start_date);
CREATE INDEX IF NOT EXISTS idx_profiles_city_verified ON profiles USING btree (city, verified_identity);

-- Full-text search indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_venues_fts ON venues USING gin (to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(address, '')));
CREATE INDEX IF NOT EXISTS idx_events_fts ON events USING gin (to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_countries_fts ON countries USING gin (to_tsvector('english', name || ' ' || COALESCE(capital, '')));
CREATE INDEX IF NOT EXISTS idx_cities_fts ON cities USING gin (to_tsvector('english', name || ' ' || COALESCE(region_name, '')));

-- Partial indexes for common filtered queries
CREATE INDEX IF NOT EXISTS idx_events_active_upcoming ON events USING btree (start_date) 
WHERE status = 'active' AND start_date >= CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_venues_active_featured ON venues USING btree (featured DESC, created_at DESC) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cms_public_published ON cms_content USING btree (published_at DESC) 
WHERE visibility_level = 'public' AND workflow_state = 'published' AND deleted_at IS NULL;