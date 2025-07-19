-- Add airport codes to cities table
ALTER TABLE public.cities 
ADD COLUMN IF NOT EXISTS airport_codes TEXT[],
ADD COLUMN IF NOT EXISTS major_airport_code TEXT;

-- Add airport codes to countries table  
ALTER TABLE public.countries
ADD COLUMN IF NOT EXISTS airport_codes TEXT[],
ADD COLUMN IF NOT EXISTS major_airports TEXT[];

-- Add indexes for airport code searches
CREATE INDEX IF NOT EXISTS idx_cities_airport_codes ON public.cities USING GIN(airport_codes);
CREATE INDEX IF NOT EXISTS idx_cities_major_airport ON public.cities(major_airport_code);
CREATE INDEX IF NOT EXISTS idx_countries_airport_codes ON public.countries USING GIN(airport_codes);

-- Add comments for clarity
COMMENT ON COLUMN public.cities.airport_codes IS 'Array of IATA/ICAO airport codes for airports within or serving this city';
COMMENT ON COLUMN public.cities.major_airport_code IS 'Primary airport IATA code serving this city';
COMMENT ON COLUMN public.countries.airport_codes IS 'Array of major airport IATA codes in this country';
COMMENT ON COLUMN public.countries.major_airports IS 'Array of major international airport names and codes in this country';