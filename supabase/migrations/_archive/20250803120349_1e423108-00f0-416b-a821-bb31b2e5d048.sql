-- =============================================================================
-- Supabase Schema Implementation
-- Version: SSoT Refined with SEO, UX, Analytics, API Mgmt, Automations, and Polls
-- =============================================================================

-- =============================================================================
-- 1. ENABLE EXTENSIONS
-- =============================================================================
-- Enable PostGIS for geospatial data types and functions
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Enable pgvector for AI-powered similarity search and embeddings
-- The vector size (e.g., 1536) should match your embedding model's output
-- OpenAI's text-embedding-ada-002 uses 1536
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;


-- =============================================================================
-- 2. CORE ENTITIES
-- =============================================================================

-- Profiles table linked to Supabase's built-in auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    country_id UUID REFERENCES public.countries(id),
    city_id UUID REFERENCES public.cities(id),
    date_of_birth DATE,
    public_key TEXT, -- E2EE: User's public key for encrypting messages.
    social_links JSONB,
    preferences JSONB,
    physical_attributes JSONB,
    sexual_preferences JSONB,
    preferred_language_id UUID REFERENCES public.languages(id),
    preferred_theme_id UUID REFERENCES public.ui_themes(id),
    preferred_accent_color TEXT, -- UX: User's preferred UI accent color (e.g., hex code).
    haptics_enabled BOOLEAN DEFAULT true, -- UX: User preference for haptic feedback.
    last_known_location extensions.GEOMETRY(Point, 4326), -- Geolocation: User's real-time location from GPS or IP.
    last_location_updated_at TIMESTAMPTZ, -- Geolocation: Timestamp for the last location update.
    ab_test_groups JSONB,
    recommendation_preferences JSONB, -- Personalization: Explicit user preferences, e.g., {"show_less_of_tag_id": "uuid", "show_more_of_tag_id": "uuid"}
    moderation_status TEXT NOT NULL DEFAULT 'approved',
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0,
    points BIGINT DEFAULT 0, -- Gamification: User's total accumulated points.
    embedding VECTOR(1536),
    last_embedded_at TIMESTAMPTZ
);

-- Venues / Organizations table
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    address TEXT,
    city_id UUID REFERENCES public.cities(id),
    location extensions.GEOMETRY(Point, 4326),
    owner_id UUID REFERENCES public.profiles(id),
    category_id UUID REFERENCES public.venue_categories(id),
    external_apis JSONB,
    rss_feed_url TEXT,
    apple_pass_url TEXT, -- Apple UI: Link to an Apple Wallet pass for memberships, etc.
    moderation_status TEXT NOT NULL DEFAULT 'approved',
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0,
    embedding VECTOR(1536),
    last_embedded_at TIMESTAMPTZ
);

-- Events table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'published',
    organizer_id UUID REFERENCES public.profiles(id),
    category_id UUID REFERENCES public.event_categories(id),
    type_id UUID REFERENCES public.event_types(id),
    is_featured BOOLEAN DEFAULT false,
    venue_id UUID REFERENCES public.venues(id),
    address TEXT,
    city_id UUID REFERENCES public.cities(id),
    location extensions.GEOMETRY(Point, 4326),
    apple_pass_url TEXT, -- Apple UI: Link to an Apple Wallet pass for event tickets.
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0,
    reaction_count BIGINT DEFAULT 0,
    embedding VECTOR(1536),
    last_embedded_at TIMESTAMPTZ,
    CONSTRAINT location_check CHECK ((venue_id IS NOT NULL) OR (city_id IS NOT NULL AND location IS NOT NULL))
);

-- News Articles table
CREATE TABLE IF NOT EXISTS public.news_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    source_url TEXT UNIQUE,
    image_url TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    source_id UUID REFERENCES public.venues(id),
    moderation_status TEXT NOT NULL DEFAULT 'approved',
    view_count BIGINT DEFAULT 0,
    embedding VECTOR(1536),
    last_embedded_at TIMESTAMPTZ
);

-- Blog Posts table
CREATE TABLE IF NOT EXISTS public.blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT,
    author_id UUID REFERENCES public.profiles(id),
    published_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft',
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0,
    reaction_count BIGINT DEFAULT 0,
    embedding VECTOR(1536),
    last_embedded_at TIMESTAMPTZ
);

-- Site Pages table
CREATE TABLE IF NOT EXISTS public.site_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    embedding VECTOR(1536),
    last_embedded_at TIMESTAMPTZ
);

-- Media Assets table
CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID REFERENCES public.profiles(id),
    file_url TEXT NOT NULL,
    file_type TEXT,
    alt_text TEXT,
    caption TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. MARKETPLACE ENTITIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    price NUMERIC(10, 2),
    currency CHAR(3),
    seller_id UUID NOT NULL,
    seller_type TEXT NOT NULL,
    is_featured BOOLEAN DEFAULT false,
    affiliate_data JSONB,
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    seller_id UUID NOT NULL,
    seller_type TEXT NOT NULL,
    is_featured BOOLEAN DEFAULT false,
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0
);


-- =============================================================================
-- 4. COMMUNITY ENTITIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES public.profiles(id),
    name TEXT NOT NULL,
    description TEXT,
    moderation_status TEXT NOT NULL DEFAULT 'approved'
);

CREATE TABLE IF NOT EXISTS public.group_members (
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    content TEXT,
    poll_options JSONB, -- For polls, e.g., [{"option_text": "Yes"}, {"option_text": "No"}]
    poll_ends_at TIMESTAMPTZ, -- Optional expiry for the poll
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    moderation_status TEXT NOT NULL DEFAULT 'approved',
    reaction_count BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    selected_option INT NOT NULL, -- Index of the chosen option from poll_options
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.user_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_one_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_two_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_one_id, user_two_id, type)
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_notification_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_token TEXT NOT NULL,
    device_type TEXT NOT NULL, -- e.g., 'ios', 'android', 'web'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    location extensions.GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_presences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    status_id UUID REFERENCES public.presence_statuses(id),
    custom_message TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- E2EE Messaging Tables
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL, -- This will store the encrypted ciphertext.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Collections & Lists
CREATE TABLE IF NOT EXISTS public.lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID REFERENCES public.lists(id) ON DELETE CASCADE,
    item_id UUID NOT NULL,
    item_type TEXT NOT NULL, -- e.g., 'venue', 'event', 'post'
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (list_id, item_id, item_type)
);


-- =============================================================================
-- 5. ATTRIBUTE & MANAGEMENT TABLES (LOOKUPS & JOINS)
-- =============================================================================

-- Universal Attribute Systems
CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES public.tags(id),
    meta_title TEXT,
    meta_description TEXT,
    embedding VECTOR(1536),
    last_embedded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.tag_relationships (
    source_tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    target_tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    PRIMARY KEY (source_tag_id, target_tag_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS public.taggings (
    tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    tagged_item_id UUID NOT NULL,
    tagged_item_type TEXT NOT NULL,
    PRIMARY KEY (tag_id, tagged_item_id, tagged_item_type)
);

CREATE TABLE IF NOT EXISTS public.target_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.target_group_assignments (
    target_group_id UUID REFERENCES public.target_groups(id) ON DELETE CASCADE,
    assigned_item_id UUID NOT NULL,
    assigned_item_type TEXT NOT NULL,
    PRIMARY KEY (target_group_id, assigned_item_id, assigned_item_type)
);

-- Location & Language Lookups
CREATE TABLE IF NOT EXISTS public.continents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    continent_id UUID REFERENCES public.continents(id),
    iso_3166_codes JSONB,
    tld TEXT,
    calling_codes JSONB,
    timezones JSONB,
    population BIGINT,
    gdp BIGINT,
    hdi NUMERIC,
    gini NUMERIC,
    flag_url TEXT
);

CREATE TABLE IF NOT EXISTS public.cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    country_id UUID REFERENCES public.countries(id),
    location extensions.GEOMETRY(Point, 4326),
    population BIGINT,
    nearest_iata_code TEXT,
    weather_forecast JSONB
);

CREATE TABLE IF NOT EXISTS public.languages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    iso_639_1_code TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS public.currencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL,
    symbol TEXT
);

-- Other Lookups
CREATE TABLE IF NOT EXISTS public.amenities ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL, icon_name TEXT );
CREATE TABLE IF NOT EXISTS public.event_categories ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL );
CREATE TABLE IF NOT EXISTS public.venue_categories ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL );
CREATE TABLE IF NOT EXISTS public.event_types ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL );
CREATE TABLE IF NOT EXISTS public.accessibility_attributes ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL, description TEXT, icon_name TEXT );
CREATE TABLE IF NOT EXISTS public.ui_themes ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL, is_dark BOOLEAN );
CREATE TABLE IF NOT EXISTS public.presence_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_selectable BOOLEAN DEFAULT true
);


-- Join Tables
CREATE TABLE IF NOT EXISTS public.country_languages ( country_id UUID REFERENCES public.countries(id), language_id UUID REFERENCES public.languages(id), PRIMARY KEY (country_id, language_id) );
CREATE TABLE IF NOT EXISTS public.country_currencies ( country_id UUID REFERENCES public.countries(id), currency_id UUID REFERENCES public.currencies(id), PRIMARY KEY (country_id, currency_id) );
CREATE TABLE IF NOT EXISTS public.event_amenities ( event_id UUID REFERENCES public.events(id), amenity_id UUID REFERENCES public.amenities(id), PRIMARY KEY (event_id, amenity_id) );
CREATE TABLE IF NOT EXISTS public.venue_amenities ( venue_id UUID REFERENCES public.venues(id), amenity_id UUID REFERENCES public.amenities(id), PRIMARY KEY (venue_id, amenity_id) );
CREATE TABLE IF NOT EXISTS public.event_services ( event_id UUID REFERENCES public.events(id), service_id UUID REFERENCES public.services(id), PRIMARY KEY (event_id, service_id) );
CREATE TABLE IF NOT EXISTS public.venue_services ( venue_id UUID REFERENCES public.venues(id), service_id UUID REFERENCES public.services(id), PRIMARY KEY (venue_id, service_id) );
CREATE TABLE IF NOT EXISTS public.event_accessibility ( event_id UUID REFERENCES public.events(id), attribute_id UUID REFERENCES public.accessibility_attributes(id), PRIMARY KEY (event_id, attribute_id) );
CREATE TABLE IF NOT EXISTS public.venue_accessibility ( venue_id UUID REFERENCES public.venues(id), attribute_id UUID REFERENCES public.accessibility_attributes(id), PRIMARY KEY (venue_id, attribute_id) );
CREATE TABLE IF NOT EXISTS public.profile_accessibility_needs ( profile_id UUID REFERENCES public.profiles(id), attribute_id UUID REFERENCES public.accessibility_attributes(id), PRIMARY KEY (profile_id, attribute_id) );
CREATE TABLE IF NOT EXISTS public.media_attachments ( media_asset_id UUID REFERENCES public.media_assets(id), attached_item_id UUID NOT NULL, attached_item_type TEXT NOT NULL, PRIMARY KEY (media_asset_id, attached_item_id, attached_item_type) );
CREATE TABLE IF NOT EXISTS public.news_article_venues ( news_article_id UUID REFERENCES public.news_articles(id), venue_id UUID REFERENCES public.venues(id), PRIMARY KEY (news_article_id, venue_id) );
CREATE TABLE IF NOT EXISTS public.news_article_cities ( news_article_id UUID REFERENCES public.news_articles(id), city_id UUID REFERENCES public.cities(id), PRIMARY KEY (news_article_id, city_id) );
CREATE TABLE IF NOT EXISTS public.news_article_countries ( news_article_id UUID REFERENCES public.news_articles(id), country_id UUID REFERENCES public.countries(id), PRIMARY KEY (news_article_id, country_id) );
CREATE TABLE IF NOT EXISTS public.news_article_continents ( news_article_id UUID REFERENCES public.news_articles(id), continent_id UUID REFERENCES public.continents(id), PRIMARY KEY (news_article_id, continent_id) );


-- =============================================================================
-- 6. COMMUNITY MODERATION & ADVANCED FEATURES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id UUID NOT NULL,
    item_type TEXT NOT NULL,
    reaction_type TEXT NOT NULL,
    UNIQUE (user_id, item_id, item_type)
);

CREATE TABLE IF NOT EXISTS public.flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    item_id UUID NOT NULL,
    item_type TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_page_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES public.site_pages(id) ON DELETE CASCADE,
    editor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_restrictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL,
    content_type TEXT NOT NULL, -- e.g., 'event', 'venue', 'tag'
    location_id UUID NOT NULL,
    location_type TEXT NOT NULL, -- e.g., 'city', 'country', 'continent'
    restriction_type TEXT NOT NULL, -- e.g., 'restrict', 'recommend'
    priority INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================================
-- 7. USER ANALYTICS & TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    start_date DATE,
    end_date DATE
);

CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    ip_address INET,
    ip_derived_city TEXT,
    ip_derived_country TEXT,
    user_agent TEXT
);

CREATE TABLE IF NOT EXISTS public.user_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id),
    session_id UUID REFERENCES public.user_sessions(id),
    event_name TEXT NOT NULL,
    properties JSONB,
    context JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_interest_scores (
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    score FLOAT NOT NULL DEFAULT 0,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, tag_id)
);


-- =============================================================================
-- 8. API, SYSTEM MANAGEMENT & AUTOMATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.external_identifiers (
    item_id UUID NOT NULL,
    item_type TEXT NOT NULL,
    api_name TEXT NOT NULL,
    external_id TEXT NOT NULL,
    PRIMARY KEY (item_id, item_type, api_name),
    UNIQUE (api_name, external_id)
);

CREATE TABLE IF NOT EXISTS public.api_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT NOT NULL,
    request_url TEXT,
    status_code INT,
    response_body JSONB,
    called_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    payload JSONB,
    status TEXT NOT NULL DEFAULT 'queued',
    priority INT DEFAULT 0,
    attempts INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL, -- e.g., 'schedule', 'event'
    trigger_config JSONB, -- e.g., '{"cron": "0 2 * * *"}' or '{"event_name": "user_registered"}'
    action_type TEXT NOT NULL, -- e.g., 'call_edge_function', 'enqueue_job'
    action_config JSONB, -- e.g., '{"function_name": "archive-old-events"}'
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID REFERENCES public.automations(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL, -- e.g., 'success', 'failure'
    log_output TEXT
);


-- =============================================================================
-- 9. GAMIFICATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    icon_name TEXT
);

CREATE TABLE IF NOT EXISTS public.user_badges (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_id UUID REFERENCES public.badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS public.points_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    points_awarded INT NOT NULL,
    reason TEXT, -- e.g., 'created_post', 'daily_login'
    related_item_id UUID,
    related_item_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leaderboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    metric TEXT NOT NULL, -- e.g., 'total_points', 'check_ins_monthly'
    reset_schedule TEXT -- e.g., 'weekly', 'monthly', 'never'
);


-- =============================================================================
-- 10. INDEXES FOR PERFORMANCE
-- =============================================================================

-- Indexes for Foreign Keys and common lookups
CREATE INDEX IF NOT EXISTS idx_profiles_city_id ON public.profiles(city_id);
CREATE INDEX IF NOT EXISTS idx_venues_city_id ON public.venues(city_id);
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON public.events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_city_id ON public.events(city_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_group_id ON public.posts(group_id);
CREATE INDEX IF NOT EXISTS idx_taggings_item ON public.taggings(tagged_item_id, tagged_item_type);
CREATE INDEX IF NOT EXISTS idx_job_queue_status ON public.job_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_content_restrictions_content ON public.content_restrictions(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_notification_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_interest_scores_score ON public.profile_interest_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_points_log_user_id ON public.points_log(user_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_post_id ON public.poll_votes(post_id);

-- Geospatial index for fast location queries
CREATE INDEX IF NOT EXISTS idx_venues_location ON public.venues USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_events_location ON public.events USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_cities_location ON public.cities USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_profiles_last_known_location ON public.profiles USING GIST (last_known_location);

-- Vector indexes for fast similarity search (HNSW is a good general-purpose choice)
-- NOTE: You must choose the dimensions of your vector model (e.g., 1536)
CREATE INDEX IF NOT EXISTS idx_profiles_embedding ON public.profiles USING HNSW (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_events_embedding ON public.events USING HNSW (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_venues_embedding ON public.venues USING HNSW (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_blog_posts_embedding ON public.blog_posts USING HNSW (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_tags_embedding ON public.tags USING HNSW (embedding extensions.vector_cosine_ops);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taggings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (can be expanded)
CREATE POLICY "Public read access" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public read access" ON public.venues FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.events FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.news_articles FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.blog_posts FOR SELECT USING (published_at IS NOT NULL);
CREATE POLICY "Public read access" ON public.tags FOR SELECT USING (true);

CREATE POLICY "Users can manage own groups" ON public.groups FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage own posts" ON public.posts FOR ALL USING (auth.uid() = author_id);
CREATE POLICY "Users can vote on polls" ON public.poll_votes FOR ALL USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_site_pages_updated_at BEFORE UPDATE ON public.site_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();