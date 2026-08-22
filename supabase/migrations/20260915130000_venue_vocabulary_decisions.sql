-- Venue vocabulary decisions — closing section 5 of the 2026-08-21 Bestandsaufnahme.
--
-- Decision 1: the category list is 17 values, not 18. 'organization' is retired:
-- a category answers "what kind of place is this", and an organization is not a
-- kind of place — the organizations table and the nonvenue_candidate flow own that
-- distinction. The value had exactly 3 rows, all of them LA lighting companies
-- ("Renecom Lights", "Light It Up Display", "Fiatlux Light Co") — import junk, not
-- even queer orgs. They are confirm-archived below via the nonvenue convention.
-- salon (9), gym (7), gallery (87) and event-venue (50) STAY: semantically distinct
-- venue kinds, and the last three grew real membership in the 2026-08-21 triage.
--
-- Decision (section 3): venue_subtype becomes ONE vocabulary. It held Title Case
-- from nude-places ("Nude Beach" 451, "Naturist Resort" 392, "Hot Spring" 29,
-- "Other" 501) beside lowercase 'bnb' 311 from misterb&b. Normalized to slugs:
-- nude-beach / naturist-resort / hot-spring / bnb; "Other" -> NULL (a subtype of
-- "Other" carries no information). No ingest path writes venues.venue_subtype
-- anymore (pipeline-normalize only reads raw payload fields), so this cannot regrow.
--
-- Decision 5: hotels.hotel_type is the canonical accommodation vocabulary — the
-- typed detail table owns typed detail (Business Spine rule). Measured: the 318
-- name+city pairs agree on ALL rows, zero contradictions, so no data change.
-- venues.accommodation_type stays as an INGEST signal only: pipeline-deduplicate
-- branches on it as its hotel marker and entityClassifier scores it; it is not a
-- presentation vocabulary.

-- ---------------------------------------------------------------------------
-- 1. Retire 'organization': disposition the 3 rows, then swap the CHECK.
UPDATE public.venues v SET
  category        = 'other',
  review_status   = 'archived',
  seo_indexable   = false,
  needs_attention = false,
  enrichment_status =
    jsonb_set(
      jsonb_set(coalesce(v.enrichment_status,'{}'::jsonb), '{category_backfill}',
        coalesce(v.enrichment_status->'category_backfill','{}'::jsonb)
          || jsonb_build_object('retracted_category','organization',
               'note','organization retired from the category vocabulary 2026-08-21')),
      '{nonvenue_candidate}',
      jsonb_build_object('reason','looks_like_organization','status','confirmed',
        'source','manual_triage','decided_at', now(), 'decided_by','internal',
        'note','vocabulary decision 2026-08-21: lighting company, not a queer venue',
        'archived', jsonb_build_object('review_status', v.review_status,
                                       'seo_indexable', v.seo_indexable)))
WHERE v.duplicate_of_id IS NULL AND v.category = 'organization';

ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_category_check;

ALTER TABLE public.venues ADD CONSTRAINT venues_category_check CHECK (
  category = ANY (ARRAY[
    'bar','club','cafe','restaurant','hotel','sauna','cruising','outdoor','shop',
    'community_center','event-venue','theater','gallery','salon','gym',
    'toilet','other'
  ])
);

-- ---------------------------------------------------------------------------
-- 2. venue_subtype -> one slug vocabulary. Batched at 300: the search trigger
--    enqueues on every venue UPDATE and this database is disk-constrained.
DO $$
DECLARE
  v_rows int;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id FROM public.venues
      WHERE venue_subtype IN ('Nude Beach','Naturist Resort','Hot Spring','Other')
      LIMIT 300
    )
    UPDATE public.venues v
    SET venue_subtype = CASE v.venue_subtype
          WHEN 'Nude Beach'      THEN 'nude-beach'
          WHEN 'Naturist Resort' THEN 'naturist-resort'
          WHEN 'Hot Spring'      THEN 'hot-spring'
          WHEN 'Other'           THEN NULL
        END
    FROM batch b WHERE v.id = b.id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXIT WHEN v_rows = 0;
    RAISE NOTICE 'venue_subtype normalize: % rows', v_rows;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The inference engine reads venue_subtype into its context; keep the
--    outdoor branch matching the new slug spelling ('nude.beach' matches both
--    "nude beach" in raw source tags and "nude-beach" in the column).
CREATE OR REPLACE FUNCTION public.infer_venue_category(
  p_name         text,
  p_subtype      text  DEFAULT NULL,
  p_tags         text[] DEFAULT NULL,
  p_source_tags  text  DEFAULT NULL,
  p_description  text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH sig AS (
    SELECT
      lower(coalesce(p_name, '')) AS nm,
      lower(
        coalesce(p_subtype, '') || ' | ' ||
        coalesce(array_to_string(p_tags, ' '), '') || ' | ' ||
        coalesce(p_source_tags, '') || ' | ' ||
        left(coalesce(p_description, ''), 300)
      ) AS ctx
  ),
  hit AS (
    SELECT CASE
      -- Tier 1 -- the name states the primary function.
      WHEN nm ~ '\m(sauna|bathhouse|badehaus)\M'                              THEN 'sauna'
      WHEN nm ~ '\m(cafe|café|caffe|kaffee|coffee|koffie)\M'                  THEN 'cafe'
      WHEN nm ~ '\m(restaurant|ristorante|trattoria|bistro|steakhouse|pizzeria)\M' THEN 'restaurant'
      WHEN nm ~ '\m(hotel|hostel|guesthouse|pension|motel)\M'                 THEN 'hotel'
      WHEN nm ~ '\m(bar|pub|tavern|taproom|kneipe|saloon)\M'                  THEN 'bar'
      WHEN nm ~ '\m(club|disco|discotheque)\M'                                THEN 'club'
      -- Tier 2 -- subtype / tags / description. Ordered by primary function, so an
      -- amenity mention never outranks what the venue actually is.
      WHEN ctx ~ '\m(sauna|bathhouse|bath house|steam room)\M'                THEN 'sauna'
      WHEN ctx ~ '(nude.beach|naturist|nudist|clothing.optional)'             THEN 'outdoor'
      WHEN ctx ~ '\m(night ?club|nightclub|discotheque|disco bar)\M'          THEN 'club'
      WHEN ctx ~ '\m(gay bar|hotel bar|sports bar|dive bar|leather bar|lounge bar|bars? & clubs?|\mbar\M|\mpub\M|tavern|taproom|kneipe|lounge)\M' THEN 'bar'
      WHEN ctx ~ '\m(cafe|café|coffee|kaffee|bakery)\M'                       THEN 'cafe'
      WHEN ctx ~ '\m(restaurant|ristorante|trattoria|bistro|dining|diner|steakhouse)\M' THEN 'restaurant'
      WHEN ctx ~ '\m(sex shop|sexshop|bookshop|bookstore|boutique|erotica|\mshop\M|\mstore\M)\M' THEN 'shop'
      WHEN ctx ~ '\m(cruising|cruise club|darkroom|dark room|gloryhole|glory hole|sex club|sexclub)\M' THEN 'cruising'
      WHEN ctx ~ '\m(beach|beaches|dunes|\mpark\M|lake|forest)\M'             THEN 'outdoor'
      WHEN ctx ~ '\m(club)\M'                                                 THEN 'club'
      WHEN ctx ~ '\m(hotel|hostel|guesthouse|guest house|b&b|bnb|pension|accommodation)\M' THEN 'hotel'
      WHEN ctx ~ '\m(community cent(er|re)|lgbt cent(er|re)|pride cent(er|re)|organi[sz]ation|association|advocacy|foundation)\M' THEN 'community_center'
      WHEN ctx ~ '\m(gallery|museum)\M'                                       THEN 'gallery'
      WHEN ctx ~ '\m(theatre|theater|cinema)\M'                               THEN 'theater'
      ELSE NULL
    END AS cat
    FROM sig
  )
  SELECT jsonb_build_object(
    'category', cat,
    'confidence', CASE cat
      WHEN 'bar'              THEN 0.92
      WHEN 'sauna'            THEN 0.89
      WHEN 'community_center' THEN 0.87
      WHEN 'theater'          THEN 0.82
      WHEN 'hotel'            THEN 0.79
      WHEN 'restaurant'       THEN 0.60
      WHEN 'club'             THEN 0.24
      WHEN 'cafe'             THEN 0.50
      WHEN 'outdoor'          THEN 0.50
      WHEN 'shop'             THEN 0.50
      WHEN 'gallery'          THEN 0.50
      WHEN 'cruising'         THEN 0.21
      ELSE 0
    END
  )
  FROM hit;
$$;

COMMENT ON COLUMN public.venues.accommodation_type IS
  'INGEST signal only (pipeline-deduplicate hotel branch, entityClassifier). The '
  'canonical accommodation vocabulary is hotels.hotel_type — the typed detail table '
  'owns typed detail. Measured 2026-08-21: all 318 name+city pairs agree.';

COMMENT ON COLUMN public.venues.venue_subtype IS
  'Slug vocabulary: nude-beach | naturist-resort | hot-spring | bnb. Normalized '
  '2026-08-21 from mixed Title Case (nude-places) + lowercase (misterb&b); "Other" '
  'became NULL. No ingest path writes this column.';
