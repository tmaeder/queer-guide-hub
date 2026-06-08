-- Amenity Truth Engine — Phase 0: controlled vocabulary foundation
-- Makes public.amenities the SINGLE category-aware vocabulary for amenities,
-- accessibility, and queer markers. `kind` discriminates; the normalizer routes
-- amenity-kind slugs -> venues.amenities[], accessibility-kind -> accessibility_attributes[],
-- queer-kind -> tags[]. Replaces the hotel-only hardcoded CANONICAL_AMENITIES const.
-- Idempotent; safe to re-apply. No CONCURRENTLY (runs in a txn).
--
-- The legacy lookups venue_amenities / event_amenities / attributes / accessibility_attributes
-- are now superseded by this table for amenity/accessibility/queer vocabulary. They are NOT
-- dropped here (verify no live reads first) — see DECLUTTER follow-up.

-- ===== 1. amenities: vocabulary columns =====
ALTER TABLE public.amenities
  ADD COLUMN IF NOT EXISTS slug           text,
  ADD COLUMN IF NOT EXISTS kind           text NOT NULL DEFAULT 'amenity',
  ADD COLUMN IF NOT EXISTS category_scope text[] NOT NULL DEFAULT ARRAY['all']::text[],
  ADD COLUMN IF NOT EXISTS is_active      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amenities_kind_check') THEN
    ALTER TABLE public.amenities ADD CONSTRAINT amenities_kind_check
      CHECK (kind IN ('amenity','accessibility','queer'));
  END IF;
END $$;

-- slug is the canonical key the normalizer + entity arrays use.
UPDATE public.amenities SET slug = lower(regexp_replace(coalesce(slug, name), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amenities_slug_key') THEN
    ALTER TABLE public.amenities ADD CONSTRAINT amenities_slug_key UNIQUE (slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_amenities_kind   ON public.amenities(kind) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_amenities_active ON public.amenities(is_active);

COMMENT ON TABLE  public.amenities IS
  'Unified controlled vocabulary for amenity / accessibility / queer markers (kind discriminates). Single source of truth for _shared/amenity-normalize.ts and the frontend. Supersedes venue_amenities / attributes / accessibility_attributes lookups.';
COMMENT ON COLUMN public.amenities.slug IS 'Canonical slug stored in venues.amenities[] / accessibility_attributes[] / tags[].';
COMMENT ON COLUMN public.amenities.kind IS 'amenity -> amenities[] · accessibility -> accessibility_attributes[] · queer -> tags[].';
COMMENT ON COLUMN public.amenities.category_scope IS 'Venue categories this term applies to (bar/club/sauna/restaurant/cafe/hotel/gym/shop) or {all}.';
COMMENT ON COLUMN public.amenities.icon_name IS 'lucide-react icon name for frontend display.';

COMMENT ON TABLE public.venue_amenities IS 'DEPRECATED — superseded by public.amenities (kind=amenity). Do not write. Declutter pending.';
COMMENT ON TABLE public.attributes IS 'DEPRECATED — superseded by public.amenities. Do not write. Declutter pending.';

-- ===== 2. seed vocabulary =====
-- (slug, name, icon_name, kind, category_scope, sort_order)
INSERT INTO public.amenities (slug, name, icon_name, kind, category_scope, sort_order) VALUES
  -- amenities — connectivity / comfort (all)
  ('wifi',                'Wi-Fi',                'Wifi',          'amenity', ARRAY['all'],                                10),
  ('parking',             'Parking',              'SquareParking', 'amenity', ARRAY['all'],                                20),
  ('air-conditioning',    'Air conditioning',     'AirVent',       'amenity', ARRAY['all'],                                30),
  ('heating',             'Heating',              'Thermometer',   'amenity', ARRAY['all'],                                40),
  ('smoke-free',          'Smoke-free',           'CigaretteOff',  'amenity', ARRAY['all'],                                50),
  ('ev-charging',         'EV charging',          'PlugZap',       'amenity', ARRAY['all'],                                60),
  ('pets-allowed',        'Pets allowed',         'PawPrint',      'amenity', ARRAY['all'],                                70),
  ('family-friendly',     'Family-friendly',      'Baby',          'amenity', ARRAY['all'],                                80),
  ('adults-only',         'Adults only',          'CircleAlert',   'amenity', ARRAY['all'],                                90),
  ('outdoor-seating',     'Outdoor seating',      'Sun',           'amenity', ARRAY['bar','club','restaurant','cafe'],     100),
  ('garden-terrace',      'Garden / terrace',     'Trees',         'amenity', ARRAY['bar','restaurant','cafe','hotel'],    110),
  ('tv-screens',          'TV / sports screens',  'Tv',            'amenity', ARRAY['bar','club','restaurant'],            120),
  -- amenities — food & drink
  ('full-bar',            'Full bar',             'Martini',       'amenity', ARRAY['bar','club','restaurant','hotel'],    200),
  ('cocktails',           'Cocktails',            'Martini',       'amenity', ARRAY['bar','club','restaurant'],            210),
  ('beer',                'Beer on tap',          'Beer',          'amenity', ARRAY['bar','club','restaurant'],            220),
  ('coffee',              'Coffee',               'Coffee',        'amenity', ARRAY['cafe','restaurant'],                  230),
  ('food-service',        'Food service',         'Utensils',      'amenity', ARRAY['bar','club','restaurant','cafe'],     240),
  ('restaurant',          'Restaurant',           'Utensils',      'amenity', ARRAY['hotel','restaurant'],                 250),
  ('breakfast',           'Breakfast',            'Croissant',     'amenity', ARRAY['hotel','cafe','restaurant'],          260),
  ('kitchen',             'Kitchen',              'ChefHat',       'amenity', ARRAY['hotel'],                              270),
  ('happy-hour',          'Happy hour',           'PartyPopper',   'amenity', ARRAY['bar','club','restaurant'],            280),
  -- amenities — entertainment (nightlife)
  ('dance-floor',         'Dance floor',          'Disc3',         'amenity', ARRAY['bar','club'],                        300),
  ('live-music',          'Live music',           'Music',         'amenity', ARRAY['bar','club','restaurant'],            310),
  ('drag-shows',          'Drag shows',           'Crown',         'amenity', ARRAY['bar','club'],                        320),
  ('karaoke',             'Karaoke',              'Mic2',          'amenity', ARRAY['bar','club'],                        330),
  ('pool-table',          'Pool table',           'Dice5',         'amenity', ARRAY['bar','club'],                        340),
  -- amenities — sauna / sex-positive venue features
  ('sauna',               'Sauna',                'Flame',         'amenity', ARRAY['sauna','gym','hotel'],               400),
  ('hot-tub',             'Hot tub',              'Bath',          'amenity', ARRAY['sauna','hotel'],                     410),
  ('pool',                'Pool',                 'Waves',         'amenity', ARRAY['sauna','gym','hotel'],               420),
  ('steam-room',          'Steam room',           'CloudFog',      'amenity', ARRAY['sauna','gym'],                      430),
  ('darkroom',            'Darkroom',             'Moon',          'amenity', ARRAY['sauna','club','bar'],               440),
  ('cruising-area',       'Cruising area',        'Footprints',    'amenity', ARRAY['sauna','club'],                     450),
  ('private-cabins',      'Private cabins',       'DoorClosed',    'amenity', ARRAY['sauna'],                            460),
  ('lockers',             'Lockers',              'Lock',          'amenity', ARRAY['sauna','gym'],                      470),
  -- amenities — wellness / lodging
  ('gym',                 'Gym',                  'Dumbbell',      'amenity', ARRAY['gym','hotel','sauna'],              500),
  ('spa',                 'Spa',                  'Flower2',       'amenity', ARRAY['hotel','sauna'],                     510),
  ('room-service',        'Room service',         'ConciergeBell', 'amenity', ARRAY['hotel'],                            520),
  ('laundry',             'Laundry',              'WashingMachine','amenity', ARRAY['hotel'],                            530),
  ('private-bathroom',    'Private bathroom',     'ShowerHead',    'amenity', ARRAY['hotel'],                            540),
  ('beach-access',        'Beach access',         'Palmtree',      'amenity', ARRAY['hotel'],                            550),
  ('airport-shuttle',     'Airport shuttle',      'BusFront',      'amenity', ARRAY['hotel'],                            560),
  -- accessibility — first-class track
  ('wheelchair-accessible',  'Wheelchair accessible',   'Accessibility', 'accessibility', ARRAY['all'], 600),
  ('step-free-entrance',     'Step-free entrance',      'DoorOpen',      'accessibility', ARRAY['all'], 610),
  ('accessible-restroom',    'Accessible restroom',     'Accessibility', 'accessibility', ARRAY['all'], 620),
  ('gender-neutral-restroom','Gender-neutral restroom', 'Toilet',        'accessibility', ARRAY['all'], 630),
  ('accessible-parking',     'Accessible parking',      'SquareParking', 'accessibility', ARRAY['all'], 640),
  ('wide-doorways',          'Wide doorways',           'DoorOpen',      'accessibility', ARRAY['all'], 650),
  ('braille-menu',           'Braille menu',            'BookOpen',      'accessibility', ARRAY['all'], 660),
  ('hearing-loop',           'Hearing loop',            'Ear',           'accessibility', ARRAY['all'], 670),
  ('service-animals-welcome','Service animals welcome', 'Dog',           'accessibility', ARRAY['all'], 680),
  -- queer markers — routed to tags[], surfaced in their own display group
  ('lgbtq-owned',         'LGBTQ+ owned',         'Rainbow',  'queer', ARRAY['all'], 700),
  ('gay-owned',           'Gay owned',            'Rainbow',  'queer', ARRAY['all'], 710),
  ('lesbian-owned',       'Lesbian owned',        'Rainbow',  'queer', ARRAY['all'], 720),
  ('trans-owned',         'Trans owned',          'Rainbow',  'queer', ARRAY['all'], 730),
  ('queer-friendly',      'Queer-friendly',       'Heart',    'queer', ARRAY['all'], 740),
  ('trans-friendly',      'Trans-friendly',       'Heart',    'queer', ARRAY['all'], 750),
  ('lgbtq-staff',         'LGBTQ+ staff',         'Users',    'queer', ARRAY['all'], 760),
  ('clothing-optional',   'Clothing optional',    'Shirt',    'queer', ARRAY['sauna','club','hotel'], 770),
  ('cruising',            'Cruising',             'Footprints','queer', ARRAY['sauna','club','bar'], 780),
  ('men-only',            'Men only',             'Users',    'queer', ARRAY['sauna','club','bar'], 790),
  ('women-only',          'Women only',           'Users',    'queer', ARRAY['sauna','club','bar'], 800)
ON CONFLICT (slug) DO UPDATE SET
  name           = EXCLUDED.name,
  icon_name      = EXCLUDED.icon_name,
  kind           = EXCLUDED.kind,
  category_scope = EXCLUDED.category_scope,
  sort_order     = EXCLUDED.sort_order,
  is_active      = true,
  updated_at     = now();
