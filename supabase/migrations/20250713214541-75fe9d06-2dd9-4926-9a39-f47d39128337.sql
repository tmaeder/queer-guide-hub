-- Create geographic directory tables
CREATE TABLE public.continents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.regions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  continent_id UUID NOT NULL REFERENCES public.continents(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  continent_id UUID NOT NULL REFERENCES public.continents(id) ON DELETE CASCADE,
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  capital TEXT,
  population BIGINT,
  area_km2 NUMERIC,
  currency TEXT,
  languages TEXT[],
  timezone TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.cities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  region_name TEXT,
  population BIGINT,
  is_capital BOOLEAN DEFAULT false,
  is_major_city BOOLEAN DEFAULT false,
  latitude NUMERIC,
  longitude NUMERIC,
  timezone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.continents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Continents are viewable by everyone" 
ON public.continents FOR SELECT USING (true);

CREATE POLICY "Regions are viewable by everyone" 
ON public.regions FOR SELECT USING (true);

CREATE POLICY "Countries are viewable by everyone" 
ON public.countries FOR SELECT USING (true);

CREATE POLICY "Cities are viewable by everyone" 
ON public.cities FOR SELECT USING (true);

-- Create indexes for better performance
CREATE INDEX idx_regions_continent_id ON public.regions(continent_id);
CREATE INDEX idx_countries_continent_id ON public.countries(continent_id);
CREATE INDEX idx_countries_region_id ON public.countries(region_id);
CREATE INDEX idx_cities_country_id ON public.cities(country_id);
CREATE INDEX idx_cities_major ON public.cities(is_major_city) WHERE is_major_city = true;
CREATE INDEX idx_cities_capital ON public.cities(is_capital) WHERE is_capital = true;

-- Create triggers for updated_at
CREATE TRIGGER update_continents_updated_at
BEFORE UPDATE ON public.continents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_regions_updated_at
BEFORE UPDATE ON public.regions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_countries_updated_at
BEFORE UPDATE ON public.countries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cities_updated_at
BEFORE UPDATE ON public.cities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample data
INSERT INTO public.continents (name, code) VALUES
('Africa', 'AF'),
('Antarctica', 'AN'),
('Asia', 'AS'),
('Europe', 'EU'),
('North America', 'NA'),
('Oceania', 'OC'),
('South America', 'SA');

-- Insert sample regions
INSERT INTO public.regions (name, continent_id) SELECT 'Western Europe', id FROM public.continents WHERE code = 'EU';
INSERT INTO public.regions (name, continent_id) SELECT 'Eastern Europe', id FROM public.continents WHERE code = 'EU';
INSERT INTO public.regions (name, continent_id) SELECT 'Southern Europe', id FROM public.continents WHERE code = 'EU';
INSERT INTO public.regions (name, continent_id) SELECT 'Northern Europe', id FROM public.continents WHERE code = 'EU';
INSERT INTO public.regions (name, continent_id) SELECT 'Central Europe', id FROM public.continents WHERE code = 'EU';

INSERT INTO public.regions (name, continent_id) SELECT 'East Asia', id FROM public.continents WHERE code = 'AS';
INSERT INTO public.regions (name, continent_id) SELECT 'Southeast Asia', id FROM public.continents WHERE code = 'AS';
INSERT INTO public.regions (name, continent_id) SELECT 'South Asia', id FROM public.continents WHERE code = 'AS';
INSERT INTO public.regions (name, continent_id) SELECT 'Western Asia', id FROM public.continents WHERE code = 'AS';
INSERT INTO public.regions (name, continent_id) SELECT 'Central Asia', id FROM public.continents WHERE code = 'AS';

-- Insert sample countries with regions
INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages) 
SELECT 'United States', 'US', c.id, NULL, 'Washington D.C.', 331900000, 'USD', ARRAY['English']
FROM public.continents c WHERE c.code = 'NA';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages)
SELECT 'France', 'FR', c.id, r.id, 'Paris', 67390000, 'EUR', ARRAY['French']
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Western Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages)
SELECT 'Germany', 'DE', c.id, r.id, 'Berlin', 83240000, 'EUR', ARRAY['German']
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Central Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages)
SELECT 'Japan', 'JP', c.id, r.id, 'Tokyo', 125800000, 'JPY', ARRAY['Japanese']
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'East Asia';

-- Insert sample cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city)
SELECT 'New York', id, 8336000, false, true FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city)
SELECT 'Los Angeles', id, 3979000, false, true FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city)
SELECT 'Paris', id, 2161000, true, true FROM public.countries WHERE code = 'FR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city)
SELECT 'Berlin', id, 3669000, true, true FROM public.countries WHERE code = 'DE';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city)
SELECT 'Tokyo', id, 9273000, true, true FROM public.countries WHERE code = 'JP';