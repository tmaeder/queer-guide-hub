-- First, create the lookup tables that are referenced by other tables
CREATE TABLE IF NOT EXISTS public.presence_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_selectable BOOLEAN DEFAULT true
);

-- Add the missing lookup tables
CREATE TABLE IF NOT EXISTS public.amenities ( 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name TEXT UNIQUE NOT NULL, 
    icon_name TEXT 
);

CREATE TABLE IF NOT EXISTS public.event_categories ( 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name TEXT UNIQUE NOT NULL 
);

CREATE TABLE IF NOT EXISTS public.venue_categories ( 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name TEXT UNIQUE NOT NULL 
);

CREATE TABLE IF NOT EXISTS public.event_types ( 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name TEXT UNIQUE NOT NULL 
);

CREATE TABLE IF NOT EXISTS public.accessibility_attributes ( 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name TEXT UNIQUE NOT NULL, 
    description TEXT, 
    icon_name TEXT 
);

CREATE TABLE IF NOT EXISTS public.ui_themes ( 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name TEXT UNIQUE NOT NULL, 
    is_dark BOOLEAN 
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

-- Enable RLS on lookup tables
ALTER TABLE public.presence_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessibility_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- Basic read policies for lookup tables
CREATE POLICY "Public read access" ON public.presence_statuses FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.amenities FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.event_categories FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.venue_categories FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.event_types FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.accessibility_attributes FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.ui_themes FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.languages FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.currencies FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.continents FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.countries FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.cities FOR SELECT USING (true);