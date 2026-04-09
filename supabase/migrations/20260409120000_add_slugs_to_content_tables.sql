-- Add slug columns to all major content tables for human-readable URLs
-- Reference: queer_villages and hotels already have slug columns

-- Helper function to generate URL-safe slugs
CREATE OR REPLACE FUNCTION public.generate_slug(input_text text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  slug text;
BEGIN
  slug := lower(trim(input_text));
  -- Replace common special characters
  slug := replace(slug, 'ä', 'ae');
  slug := replace(slug, 'ö', 'oe');
  slug := replace(slug, 'ü', 'ue');
  slug := replace(slug, 'ß', 'ss');
  slug := replace(slug, 'é', 'e');
  slug := replace(slug, 'è', 'e');
  slug := replace(slug, 'ê', 'e');
  slug := replace(slug, 'ë', 'e');
  slug := replace(slug, 'à', 'a');
  slug := replace(slug, 'â', 'a');
  slug := replace(slug, 'á', 'a');
  slug := replace(slug, 'ô', 'o');
  slug := replace(slug, 'ó', 'o');
  slug := replace(slug, 'ò', 'o');
  slug := replace(slug, 'ù', 'u');
  slug := replace(slug, 'ú', 'u');
  slug := replace(slug, 'û', 'u');
  slug := replace(slug, 'ñ', 'n');
  slug := replace(slug, 'ç', 'c');
  slug := replace(slug, 'ø', 'o');
  slug := replace(slug, 'å', 'a');
  slug := replace(slug, 'æ', 'ae');
  slug := replace(slug, '&', 'and');
  slug := replace(slug, '@', 'at');
  -- Replace non-alphanumeric with hyphens
  slug := regexp_replace(slug, '[^a-z0-9-]', '-', 'g');
  -- Collapse multiple hyphens
  slug := regexp_replace(slug, '-+', '-', 'g');
  -- Trim leading/trailing hyphens
  slug := trim(both '-' from slug);
  -- Ensure non-empty
  IF slug = '' THEN
    slug := 'untitled';
  END IF;
  RETURN slug;
END;
$$;

-- Helper: generate unique slug for a table
CREATE OR REPLACE FUNCTION public.generate_unique_slug(
  p_table_name text,
  p_base_slug text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  counter int := 0;
  exists_already boolean;
BEGIN
  candidate := p_base_slug;
  LOOP
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM %I WHERE slug = $1 AND ($2 IS NULL OR id != $2))',
      p_table_name
    ) INTO exists_already USING candidate, p_exclude_id;

    EXIT WHEN NOT exists_already;
    counter := counter + 1;
    candidate := p_base_slug || '-' || counter;
  END LOOP;
  RETURN candidate;
END;
$$;

-- 1. Add slug columns (nullable first for backfill)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE personalities ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS slug text;

-- 2. Backfill slugs from name/title fields
-- Venues (name)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, name FROM venues WHERE slug IS NULL AND name IS NOT NULL ORDER BY created_at LOOP
    UPDATE venues SET slug = public.generate_unique_slug('venues', public.generate_slug(r.name), r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- Events (title)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, title FROM events WHERE slug IS NULL AND title IS NOT NULL ORDER BY created_at LOOP
    UPDATE events SET slug = public.generate_unique_slug('events', public.generate_slug(r.title), r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- News articles (title)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, title FROM news_articles WHERE slug IS NULL AND title IS NOT NULL ORDER BY created_at LOOP
    UPDATE news_articles SET slug = public.generate_unique_slug('news_articles', public.generate_slug(r.title), r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- Marketplace listings (title)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, title FROM marketplace_listings WHERE slug IS NULL AND title IS NOT NULL ORDER BY created_at LOOP
    UPDATE marketplace_listings SET slug = public.generate_unique_slug('marketplace_listings', public.generate_slug(r.title), r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- Personalities (name)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, name FROM personalities WHERE slug IS NULL AND name IS NOT NULL ORDER BY created_at LOOP
    UPDATE personalities SET slug = public.generate_unique_slug('personalities', public.generate_slug(r.name), r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- Cities (name)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, name FROM cities WHERE slug IS NULL AND name IS NOT NULL ORDER BY created_at LOOP
    UPDATE cities SET slug = public.generate_unique_slug('cities', public.generate_slug(r.name), r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- Countries (name)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, name FROM countries WHERE slug IS NULL AND name IS NOT NULL ORDER BY created_at LOOP
    UPDATE countries SET slug = public.generate_unique_slug('countries', public.generate_slug(r.name), r.id) WHERE id = r.id;
  END LOOP;
END $$;

-- 3. Fallback: set slug from id for any rows that still have NULL slug
UPDATE venues SET slug = id::text WHERE slug IS NULL;
UPDATE events SET slug = id::text WHERE slug IS NULL;
UPDATE news_articles SET slug = id::text WHERE slug IS NULL;
UPDATE marketplace_listings SET slug = id::text WHERE slug IS NULL;
UPDATE personalities SET slug = id::text WHERE slug IS NULL;
UPDATE cities SET slug = id::text WHERE slug IS NULL;
UPDATE countries SET slug = id::text WHERE slug IS NULL;

-- 4. Add NOT NULL + UNIQUE constraints
ALTER TABLE venues ALTER COLUMN slug SET NOT NULL;
ALTER TABLE venues ADD CONSTRAINT venues_slug_unique UNIQUE (slug);

ALTER TABLE events ALTER COLUMN slug SET NOT NULL;
ALTER TABLE events ADD CONSTRAINT events_slug_unique UNIQUE (slug);

ALTER TABLE news_articles ALTER COLUMN slug SET NOT NULL;
ALTER TABLE news_articles ADD CONSTRAINT news_articles_slug_unique UNIQUE (slug);

ALTER TABLE marketplace_listings ALTER COLUMN slug SET NOT NULL;
ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_slug_unique UNIQUE (slug);

ALTER TABLE personalities ALTER COLUMN slug SET NOT NULL;
ALTER TABLE personalities ADD CONSTRAINT personalities_slug_unique UNIQUE (slug);

ALTER TABLE cities ALTER COLUMN slug SET NOT NULL;
ALTER TABLE cities ADD CONSTRAINT cities_slug_unique UNIQUE (slug);

ALTER TABLE countries ALTER COLUMN slug SET NOT NULL;
ALTER TABLE countries ADD CONSTRAINT countries_slug_unique UNIQUE (slug);

-- 5. Indexes for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_news_articles_slug ON news_articles(slug);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_slug ON marketplace_listings(slug);
CREATE INDEX IF NOT EXISTS idx_personalities_slug ON personalities(slug);
CREATE INDEX IF NOT EXISTS idx_cities_slug ON cities(slug);
CREATE INDEX IF NOT EXISTS idx_countries_slug ON countries(slug);

-- 6. Triggers to auto-generate slugs on INSERT/UPDATE
-- Per-table trigger functions (needed because plpgsql can't dynamically access record fields)

CREATE OR REPLACE FUNCTION public.auto_slug_from_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_unique_slug(TG_TABLE_NAME, public.generate_slug(NEW.name), NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_slug_from_title()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_unique_slug(TG_TABLE_NAME, public.generate_slug(NEW.title), NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Tables with 'name' field
CREATE OR REPLACE TRIGGER trg_venues_slug BEFORE INSERT OR UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_from_name();

CREATE OR REPLACE TRIGGER trg_personalities_slug BEFORE INSERT OR UPDATE ON personalities
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_from_name();

CREATE OR REPLACE TRIGGER trg_cities_slug BEFORE INSERT OR UPDATE ON cities
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_from_name();

CREATE OR REPLACE TRIGGER trg_countries_slug BEFORE INSERT OR UPDATE ON countries
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_from_name();

-- Tables with 'title' field
CREATE OR REPLACE TRIGGER trg_events_slug BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_from_title();

CREATE OR REPLACE TRIGGER trg_news_articles_slug BEFORE INSERT OR UPDATE ON news_articles
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_from_title();

CREATE OR REPLACE TRIGGER trg_marketplace_listings_slug BEFORE INSERT OR UPDATE ON marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_from_title();
