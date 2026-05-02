-- Add comprehensive attributes to cities table
ALTER TABLE public.cities 
ADD COLUMN IF NOT EXISTS elevation_m INTEGER,
ADD COLUMN IF NOT EXISTS climate_type TEXT,
ADD COLUMN IF NOT EXISTS founded_year INTEGER,
ADD COLUMN IF NOT EXISTS area_km2 NUMERIC,
ADD COLUMN IF NOT EXISTS local_language TEXT,
ADD COLUMN IF NOT EXISTS official_website TEXT,
ADD COLUMN IF NOT EXISTS mayor TEXT,
ADD COLUMN IF NOT EXISTS postal_codes TEXT[],
ADD COLUMN IF NOT EXISTS area_codes TEXT[],
ADD COLUMN IF NOT EXISTS sister_cities TEXT[],
ADD COLUMN IF NOT EXISTS notable_landmarks TEXT[],
ADD COLUMN IF NOT EXISTS economy_sectors TEXT[],
ADD COLUMN IF NOT EXISTS universities TEXT[],
ADD COLUMN IF NOT EXISTS transportation_info JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS demographics JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS cost_of_living JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbt_friendly_rating INTEGER CHECK (lgbt_friendly_rating >= 1 AND lgbt_friendly_rating <= 5),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS best_time_to_visit TEXT,
ADD COLUMN IF NOT EXISTS local_customs TEXT;

-- Add comprehensive attributes to countries table  
ALTER TABLE public.countries
ADD COLUMN IF NOT EXISTS government_type TEXT,
ADD COLUMN IF NOT EXISTS capital_coordinates JSONB,
ADD COLUMN IF NOT EXISTS national_anthem TEXT,
ADD COLUMN IF NOT EXISTS national_day DATE,
ADD COLUMN IF NOT EXISTS calling_code TEXT,
ADD COLUMN IF NOT EXISTS internet_tld TEXT,
ADD COLUMN IF NOT EXISTS driving_side TEXT CHECK (driving_side IN ('left', 'right')),
ADD COLUMN IF NOT EXISTS major_religions TEXT[],
ADD COLUMN IF NOT EXISTS gdp_usd BIGINT,
ADD COLUMN IF NOT EXISTS gdp_per_capita_usd INTEGER,
ADD COLUMN IF NOT EXISTS human_development_index NUMERIC(3,3),
ADD COLUMN IF NOT EXISTS life_expectancy NUMERIC(4,1),
ADD COLUMN IF NOT EXISTS literacy_rate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS climate_zones TEXT[],
ADD COLUMN IF NOT EXISTS natural_resources TEXT[],
ADD COLUMN IF NOT EXISTS unesco_sites TEXT[],
ADD COLUMN IF NOT EXISTS major_industries TEXT[],
ADD COLUMN IF NOT EXISTS exports TEXT[],
ADD COLUMN IF NOT EXISTS imports TEXT[],
ADD COLUMN IF NOT EXISTS visa_requirements JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS lgbt_rights_status TEXT,
ADD COLUMN IF NOT EXISTS lgbt_legal_status TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS flag_emoji TEXT,
ADD COLUMN IF NOT EXISTS national_symbols JSONB DEFAULT '{}';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cities_lgbt_rating ON public.cities(lgbt_friendly_rating);
CREATE INDEX IF NOT EXISTS idx_cities_population ON public.cities(population);
CREATE INDEX IF NOT EXISTS idx_cities_founded_year ON public.cities(founded_year);
CREATE INDEX IF NOT EXISTS idx_countries_gdp ON public.countries(gdp_usd);
CREATE INDEX IF NOT EXISTS idx_countries_population ON public.countries(population);
CREATE INDEX IF NOT EXISTS idx_countries_lgbt_status ON public.countries(lgbt_rights_status);