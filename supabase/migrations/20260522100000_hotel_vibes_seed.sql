-- D2: Seed hotel vibe tags + heuristic assignments.
--
-- The Hotels page exposes 8 vibe chips (src/components/hotels/hotelVibes.ts).
-- Each chip filters via unified_tag_assignments × unified_tags(slug).
-- Without seed rows, every chip dead-ends to "No hotels match your filters".
--
-- This migration creates the 8 tag rows and applies a conservative keyword
-- heuristic over hotels.name / description / amenities. Misclassifications
-- expected — an editorial pass is the long-term fix.

-- 1. Seed the 8 vibe tags. category='hotel_vibe' lets editors find them later.
INSERT INTO public.unified_tags (slug, name, category, status, description)
VALUES
  ('beach',        'Beach',        'hotel_vibe', 'active', 'Hotels with beach access or seafront views.'),
  ('design',       'Design',       'hotel_vibe', 'active', 'Architecturally distinctive stays with strong visual identity.'),
  ('boutique',     'Boutique',     'hotel_vibe', 'active', 'Small, independent hotels with character.'),
  ('party',        'Party',        'hotel_vibe', 'active', 'Hotels close to nightlife or with on-site bars and clubs.'),
  ('wellness',     'Wellness',     'hotel_vibe', 'active', 'Spas, saunas, retreats, and recovery-focused stays.'),
  ('romantic',     'Romantic',     'hotel_vibe', 'active', 'Couples-oriented stays — honeymoons, anniversaries.'),
  ('family',       'Family',       'hotel_vibe', 'active', 'Family-friendly stays welcoming all configurations.'),
  ('adults-only',  'Adults-only',  'hotel_vibe', 'active', 'Adults-only properties (18+ or 21+).')
ON CONFLICT (slug) DO UPDATE
  SET category = EXCLUDED.category,
      status = EXCLUDED.status,
      description = COALESCE(public.unified_tags.description, EXCLUDED.description);

-- 2. Heuristic assignments. Each block: tag_id from slug, hotels matched by
-- ILIKE / array containment, ON CONFLICT skip dupes.

-- beach
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h
CROSS JOIN public.unified_tags t
WHERE t.slug = 'beach'
  AND (
    h.name ILIKE '%beach%' OR h.name ILIKE '%seafront%' OR h.name ILIKE '%seaside%'
    OR h.description ILIKE '%beach%' OR h.description ILIKE '%coast%'
    OR h.description ILIKE '%seafront%' OR h.description ILIKE '%seaside%'
    OR h.address ILIKE '%beach%'
  )
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- design
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h
CROSS JOIN public.unified_tags t
WHERE t.slug = 'design'
  AND (
    h.description ILIKE '%design hotel%' OR h.description ILIKE '%architect%'
    OR h.description ILIKE '%designer%' OR h.description ILIKE '%mid-century%'
    OR 'design' = ANY (h.tags) OR 'design-hotel' = ANY (h.tags)
  )
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- boutique
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h
CROSS JOIN public.unified_tags t
WHERE t.slug = 'boutique'
  AND (
    h.name ILIKE '%boutique%' OR h.description ILIKE '%boutique%'
    OR 'boutique' = ANY (h.tags)
  )
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- party
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h
CROSS JOIN public.unified_tags t
WHERE t.slug = 'party'
  AND (
    h.description ILIKE '%nightlife%' OR h.description ILIKE '%party%'
    OR h.description ILIKE '%club%' OR h.description ILIKE '%dance floor%'
    OR h.description ILIKE '%rooftop bar%'
    OR 'nightlife' = ANY (h.amenities) OR 'club' = ANY (h.amenities)
  )
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- wellness
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h
CROSS JOIN public.unified_tags t
WHERE t.slug = 'wellness'
  AND (
    h.description ILIKE '%spa%' OR h.description ILIKE '%sauna%'
    OR h.description ILIKE '%wellness%' OR h.description ILIKE '%retreat%'
    OR h.description ILIKE '%thermal%' OR h.description ILIKE '%massage%'
    OR 'spa' = ANY (h.amenities) OR 'sauna' = ANY (h.amenities)
    OR 'wellness' = ANY (h.amenities)
  )
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- romantic
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h
CROSS JOIN public.unified_tags t
WHERE t.slug = 'romantic'
  AND (
    h.description ILIKE '%romantic%' OR h.description ILIKE '%couples%'
    OR h.description ILIKE '%honeymoon%' OR h.description ILIKE '%intimate%'
  )
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- family
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h
CROSS JOIN public.unified_tags t
WHERE t.slug = 'family'
  AND (
    h.description ILIKE '%family%' OR h.description ILIKE '%kid%'
    OR h.description ILIKE '%children%'
    OR 'family-friendly' = ANY (h.amenities) OR 'kids-club' = ANY (h.amenities)
  )
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- adults-only
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h
CROSS JOIN public.unified_tags t
WHERE t.slug = 'adults-only'
  AND (
    h.description ILIKE '%adults only%' OR h.description ILIKE '%adults-only%'
    OR h.description ILIKE '%18+%' OR h.description ILIKE '%21+%'
    OR h.description ILIKE '%no children%'
    OR 'adults-only' = ANY (h.amenities) OR 'adults-only' = ANY (h.tags)
  )
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- 2b. Data-shape-aware heuristics. The current hotels table is dominated by
-- misterbandb B&Bs whose descriptions are sparse but whose amenities/tags
-- arrays are rich. These rules use those arrays directly.

-- party (extra): proxy by nightlife proximity
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h CROSS JOIN public.unified_tags t
WHERE t.slug = 'party'
  AND ('gay-district' = ANY (h.amenities)
       OR 'lgbtq-venues-nearby' = ANY (h.amenities)
       OR 'gay-district' = ANY (h.tags))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- adults-only (extra): clothing-optional amenity is an adult-stay signal
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h CROSS JOIN public.unified_tags t
WHERE t.slug = 'adults-only'
  AND ('clothing-optional-accepted' = ANY (h.amenities)
       OR 'clothing-optional' = ANY (h.tags))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- family (extra): kitchen-equipped stays without adult-only signals
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h CROSS JOIN public.unified_tags t
WHERE t.slug = 'family'
  AND 'kitchen' = ANY (h.amenities)
  AND NOT ('clothing-optional-accepted' = ANY (h.amenities))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- boutique (extra): host-led B&Bs read as boutique in the misterbandb dataset
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h CROSS JOIN public.unified_tags t
WHERE t.slug = 'boutique'
  AND h.hotel_type = 'bnb'
  AND ('host-shares-gay-local-tips' = ANY (h.amenities) OR 'power-host' = ANY (h.tags))
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- design (extra): stays with breakfast + dedicated workspace as a curated-experience proxy
INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
SELECT t.id, h.id, 'hotel'
FROM public.hotels h CROSS JOIN public.unified_tags t
WHERE t.slug = 'design'
  AND 'breakfast-included' = ANY (h.amenities)
  AND 'dedicated-workspace' = ANY (h.amenities)
ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;

-- 3. Backfill usage_count so the tag inspector shows accurate totals.
UPDATE public.unified_tags t
SET usage_count = sub.cnt
FROM (
  SELECT tag_id, COUNT(*)::int AS cnt
  FROM public.unified_tag_assignments
  WHERE entity_type = 'hotel'
  GROUP BY tag_id
) sub
WHERE t.id = sub.tag_id
  AND t.slug IN ('beach','design','boutique','party','wellness','romantic','family','adults-only');
