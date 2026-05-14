-- Clear existing sample data to start fresh
DELETE FROM public.cities;
DELETE FROM public.countries;
DELETE FROM public.regions;
DELETE FROM public.continents;

-- Insert all continents
INSERT INTO public.continents (name, code) VALUES
('Africa', 'AF'),
('Antarctica', 'AN'),
('Asia', 'AS'),
('Europe', 'EU'),
('North America', 'NA'),
('Oceania', 'OC'),
('South America', 'SA');

-- Insert regions for each continent
-- Africa regions
INSERT INTO public.regions (name, continent_id) 
SELECT 'Northern Africa', id FROM public.continents WHERE code = 'AF';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Western Africa', id FROM public.continents WHERE code = 'AF';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Eastern Africa', id FROM public.continents WHERE code = 'AF';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Southern Africa', id FROM public.continents WHERE code = 'AF';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Central Africa', id FROM public.continents WHERE code = 'AF';

-- Asia regions
INSERT INTO public.regions (name, continent_id) 
SELECT 'East Asia', id FROM public.continents WHERE code = 'AS';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Southeast Asia', id FROM public.continents WHERE code = 'AS';
INSERT INTO public.regions (name, continent_id) 
SELECT 'South Asia', id FROM public.continents WHERE code = 'AS';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Western Asia', id FROM public.continents WHERE code = 'AS';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Central Asia', id FROM public.continents WHERE code = 'AS';

-- Europe regions
INSERT INTO public.regions (name, continent_id) 
SELECT 'Western Europe', id FROM public.continents WHERE code = 'EU';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Eastern Europe', id FROM public.continents WHERE code = 'EU';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Southern Europe', id FROM public.continents WHERE code = 'EU';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Northern Europe', id FROM public.continents WHERE code = 'EU';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Central Europe', id FROM public.continents WHERE code = 'EU';

-- North America regions
INSERT INTO public.regions (name, continent_id) 
SELECT 'Northern America', id FROM public.continents WHERE code = 'NA';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Central America', id FROM public.continents WHERE code = 'NA';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Caribbean', id FROM public.continents WHERE code = 'NA';

-- South America regions
INSERT INTO public.regions (name, continent_id) 
SELECT 'Northern South America', id FROM public.continents WHERE code = 'SA';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Southern South America', id FROM public.continents WHERE code = 'SA';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Brazil', id FROM public.continents WHERE code = 'SA';

-- Oceania regions
INSERT INTO public.regions (name, continent_id) 
SELECT 'Australia and New Zealand', id FROM public.continents WHERE code = 'OC';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Melanesia', id FROM public.continents WHERE code = 'OC';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Micronesia', id FROM public.continents WHERE code = 'OC';
INSERT INTO public.regions (name, continent_id) 
SELECT 'Polynesia', id FROM public.continents WHERE code = 'OC';

-- Insert major countries with proper relationships
-- North America
INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'United States', 'US', c.id, r.id, 'Washington D.C.', 331900000, 'USD', ARRAY['English'], 39.8283, -98.5795
FROM public.continents c, public.regions r 
WHERE c.code = 'NA' AND r.name = 'Northern America';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Canada', 'CA', c.id, r.id, 'Ottawa', 38000000, 'CAD', ARRAY['English', 'French'], 56.1304, -106.3468
FROM public.continents c, public.regions r 
WHERE c.code = 'NA' AND r.name = 'Northern America';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Mexico', 'MX', c.id, r.id, 'Mexico City', 128900000, 'MXN', ARRAY['Spanish'], 23.6345, -102.5528
FROM public.continents c, public.regions r 
WHERE c.code = 'NA' AND r.name = 'Central America';

-- Europe
INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Germany', 'DE', c.id, r.id, 'Berlin', 83240000, 'EUR', ARRAY['German'], 51.1657, 10.4515
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Central Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'France', 'FR', c.id, r.id, 'Paris', 67390000, 'EUR', ARRAY['French'], 46.2276, 2.2137
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Western Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'United Kingdom', 'GB', c.id, r.id, 'London', 67330000, 'GBP', ARRAY['English'], 55.3781, -3.4360
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Northern Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Italy', 'IT', c.id, r.id, 'Rome', 60360000, 'EUR', ARRAY['Italian'], 41.8719, 12.5674
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Southern Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Spain', 'ES', c.id, r.id, 'Madrid', 47350000, 'EUR', ARRAY['Spanish'], 40.4637, -3.7492
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Southern Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Russia', 'RU', c.id, r.id, 'Moscow', 146170000, 'RUB', ARRAY['Russian'], 61.5240, 105.3188
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Eastern Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Poland', 'PL', c.id, r.id, 'Warsaw', 37950000, 'PLN', ARRAY['Polish'], 51.9194, 19.1451
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Eastern Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Netherlands', 'NL', c.id, r.id, 'Amsterdam', 17440000, 'EUR', ARRAY['Dutch'], 52.1326, 5.2913
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Western Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Sweden', 'SE', c.id, r.id, 'Stockholm', 10420000, 'SEK', ARRAY['Swedish'], 60.1282, 18.6435
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Northern Europe';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Norway', 'NO', c.id, r.id, 'Oslo', 5420000, 'NOK', ARRAY['Norwegian'], 60.4720, 8.4689
FROM public.continents c, public.regions r 
WHERE c.code = 'EU' AND r.name = 'Northern Europe';

-- Asia
INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'China', 'CN', c.id, r.id, 'Beijing', 1439323776, 'CNY', ARRAY['Chinese'], 35.8617, 104.1954
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'East Asia';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Japan', 'JP', c.id, r.id, 'Tokyo', 125800000, 'JPY', ARRAY['Japanese'], 36.2048, 138.2529
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'East Asia';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'South Korea', 'KR', c.id, r.id, 'Seoul', 51780000, 'KRW', ARRAY['Korean'], 35.9078, 127.7669
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'East Asia';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'India', 'IN', c.id, r.id, 'New Delhi', 1380004385, 'INR', ARRAY['Hindi', 'English'], 20.5937, 78.9629
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'South Asia';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Thailand', 'TH', c.id, r.id, 'Bangkok', 69800000, 'THB', ARRAY['Thai'], 15.8700, 100.9925
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'Southeast Asia';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Singapore', 'SG', c.id, r.id, 'Singapore', 5850000, 'SGD', ARRAY['English', 'Malay', 'Chinese', 'Tamil'], 1.3521, 103.8198
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'Southeast Asia';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Indonesia', 'ID', c.id, r.id, 'Jakarta', 273523615, 'IDR', ARRAY['Indonesian'], -0.7893, 113.9213
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'Southeast Asia';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Malaysia', 'MY', c.id, r.id, 'Kuala Lumpur', 32370000, 'MYR', ARRAY['Malay'], 4.2105, 101.9758
FROM public.continents c, public.regions r 
WHERE c.code = 'AS' AND r.name = 'Southeast Asia';

-- Africa
INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Nigeria', 'NG', c.id, r.id, 'Abuja', 218540000, 'NGN', ARRAY['English'], 9.0820, 8.6753
FROM public.continents c, public.regions r 
WHERE c.code = 'AF' AND r.name = 'Western Africa';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'South Africa', 'ZA', c.id, r.id, 'Cape Town', 59310000, 'ZAR', ARRAY['English', 'Afrikaans'], -30.5595, 22.9375
FROM public.continents c, public.regions r 
WHERE c.code = 'AF' AND r.name = 'Southern Africa';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Egypt', 'EG', c.id, r.id, 'Cairo', 102340000, 'EGP', ARRAY['Arabic'], 26.0975, 30.0444
FROM public.continents c, public.regions r 
WHERE c.code = 'AF' AND r.name = 'Northern Africa';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Kenya', 'KE', c.id, r.id, 'Nairobi', 53770000, 'KES', ARRAY['English', 'Swahili'], -0.0236, 37.9062
FROM public.continents c, public.regions r 
WHERE c.code = 'AF' AND r.name = 'Eastern Africa';

-- South America
INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Brazil', 'BR', c.id, r.id, 'Brasília', 215313498, 'BRL', ARRAY['Portuguese'], -14.2350, -51.9253
FROM public.continents c, public.regions r 
WHERE c.code = 'SA' AND r.name = 'Brazil';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Argentina', 'AR', c.id, r.id, 'Buenos Aires', 45196000, 'ARS', ARRAY['Spanish'], -38.4161, -63.6167
FROM public.continents c, public.regions r 
WHERE c.code = 'SA' AND r.name = 'Southern South America';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Colombia', 'CO', c.id, r.id, 'Bogotá', 50880000, 'COP', ARRAY['Spanish'], 4.5709, -74.2973
FROM public.continents c, public.regions r 
WHERE c.code = 'SA' AND r.name = 'Northern South America';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Chile', 'CL', c.id, r.id, 'Santiago', 19120000, 'CLP', ARRAY['Spanish'], -35.6751, -71.5430
FROM public.continents c, public.regions r 
WHERE c.code = 'SA' AND r.name = 'Southern South America';

-- Oceania
INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'Australia', 'AU', c.id, r.id, 'Canberra', 25690000, 'AUD', ARRAY['English'], -25.2744, 133.7751
FROM public.continents c, public.regions r 
WHERE c.code = 'OC' AND r.name = 'Australia and New Zealand';

INSERT INTO public.countries (name, code, continent_id, region_id, capital, population, currency, languages, latitude, longitude) 
SELECT 'New Zealand', 'NZ', c.id, r.id, 'Wellington', 5120000, 'NZD', ARRAY['English'], -40.9006, 174.8860
FROM public.continents c, public.regions r 
WHERE c.code = 'OC' AND r.name = 'Australia and New Zealand';