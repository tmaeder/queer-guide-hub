-- Now create the main tables that depend on the lookup tables
-- First, create profiles table with proper references
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
    public_key TEXT,
    social_links JSONB,
    preferences JSONB,
    physical_attributes JSONB,
    sexual_preferences JSONB,
    preferred_language_id UUID REFERENCES public.languages(id),
    preferred_theme_id UUID REFERENCES public.ui_themes(id),
    preferred_accent_color TEXT,
    haptics_enabled BOOLEAN DEFAULT true,
    last_known_location extensions.GEOMETRY(Point, 4326),
    last_location_updated_at TIMESTAMPTZ,
    ab_test_groups JSONB,
    recommendation_preferences JSONB,
    moderation_status TEXT NOT NULL DEFAULT 'approved',
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0,
    points BIGINT DEFAULT 0,
    embedding extensions.VECTOR(1536),
    last_embedded_at TIMESTAMPTZ
);

-- Venues table
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
    apple_pass_url TEXT,
    moderation_status TEXT NOT NULL DEFAULT 'approved',
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0,
    embedding extensions.VECTOR(1536),
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
    apple_pass_url TEXT,
    meta_title TEXT,
    meta_description TEXT,
    structured_data JSONB,
    view_count BIGINT DEFAULT 0,
    reaction_count BIGINT DEFAULT 0,
    embedding extensions.VECTOR(1536),
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
    embedding extensions.VECTOR(1536),
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
    embedding extensions.VECTOR(1536),
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
    embedding extensions.VECTOR(1536),
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

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies
CREATE POLICY "Public read access" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public read access" ON public.venues FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.events FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.news_articles FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.blog_posts FOR SELECT USING (published_at IS NOT NULL);
CREATE POLICY "Public read access" ON public.media_assets FOR SELECT USING (true);