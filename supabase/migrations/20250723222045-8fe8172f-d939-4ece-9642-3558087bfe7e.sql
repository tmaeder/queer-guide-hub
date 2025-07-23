-- Security Hardening Migration Part 1: Core Authentication Restrictions

-- 1. Restrict anonymous access to sensitive tables
-- Most RLS policies should require authentication for a queer guide app

-- Update accessibility attributes to require authentication for public data
DROP POLICY IF EXISTS "Accessibility attributes are viewable by everyone" ON public.accessibility_attributes;
CREATE POLICY "Accessibility attributes are viewable by authenticated users"
ON public.accessibility_attributes
FOR SELECT
TO authenticated
USING (true);

-- Update cities to require authentication 
DROP POLICY IF EXISTS "Cities are viewable by everyone" ON public.cities;
CREATE POLICY "Cities are viewable by authenticated users"
ON public.cities
FOR SELECT
TO authenticated
USING (true);

-- Update countries to require authentication
DROP POLICY IF EXISTS "Countries are viewable by everyone" ON public.countries;
CREATE POLICY "Countries are viewable by authenticated users"
ON public.countries
FOR SELECT
TO authenticated
USING (true);

-- Update continents to require authentication
DROP POLICY IF EXISTS "Continents are viewable by everyone" ON public.continents;
CREATE POLICY "Continents are viewable by authenticated users"
ON public.continents
FOR SELECT
TO authenticated
USING (true);

-- Update regions to require authentication
DROP POLICY IF EXISTS "Regions are viewable by everyone" ON public.regions;
CREATE POLICY "Regions are viewable by authenticated users"
ON public.regions
FOR SELECT
TO authenticated
USING (true);

-- Update events to require authentication
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
CREATE POLICY "Events are viewable by authenticated users"
ON public.events
FOR SELECT
TO authenticated
USING (true);

-- Update venues to require authentication
DROP POLICY IF EXISTS "Venues are viewable by everyone" ON public.venues;
CREATE POLICY "Venues are viewable by authenticated users"
ON public.venues
FOR SELECT
TO authenticated
USING (true);

-- Update marketplace listings to require authentication
DROP POLICY IF EXISTS "Active listings are viewable by everyone" ON public.marketplace_listings;
CREATE POLICY "Active listings are viewable by authenticated users"
ON public.marketplace_listings
FOR SELECT
TO authenticated
USING (status = 'active' AND created_by IS NOT NULL);

-- Update news articles to require authentication
DROP POLICY IF EXISTS "News articles are viewable by everyone" ON public.news_articles;
CREATE POLICY "News articles are viewable by authenticated users"
ON public.news_articles
FOR SELECT
TO authenticated
USING (true);

-- Update profiles to require authentication for viewing
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Update venue reviews to require authentication
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.venue_reviews;
CREATE POLICY "Venue reviews are viewable by authenticated users"
ON public.venue_reviews
FOR SELECT
TO authenticated
USING (true);

-- Update marketplace reviews to require authentication
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.marketplace_reviews;
CREATE POLICY "Marketplace reviews are viewable by authenticated users"
ON public.marketplace_reviews
FOR SELECT
TO authenticated
USING (true);