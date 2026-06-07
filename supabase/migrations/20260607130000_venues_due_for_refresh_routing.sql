-- Extend venues_due_for_refresh with per-field routing flags so the enrichment driver can
-- route each venue (website-agentic vs LLM-only) and target the right fields without an extra
-- per-row read. Adding OUT columns changes the return type → DROP + recreate. Priority order
-- and exclusions are unchanged from 20260528000000.

DROP FUNCTION IF EXISTS public.venues_due_for_refresh(int);

CREATE OR REPLACE FUNCTION public.venues_due_for_refresh(p_limit int DEFAULT 25)
RETURNS TABLE (
  id              uuid,
  name            text,
  slug            text,
  city            text,
  country         text,
  category        text,
  description     text,
  latitude        numeric,
  longitude       numeric,
  website         text,
  foursquare_id   text,
  tomtom_id       text,
  external_id     text,
  platform_ids    jsonb,
  quality_score   smallint,
  completeness    smallint,
  url_status      varchar,
  last_refreshed_at timestamptz,
  refresh_reason  text,
  has_website     boolean,
  needs_description boolean,
  needs_category  boolean,
  needs_tags      boolean,
  needs_hours     boolean,
  needs_contact   boolean,
  needs_images    boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id, v.name, v.slug, v.city, v.country, v.category, v.description,
    v.latitude, v.longitude, v.website,
    v.foursquare_id, v.tomtom_id, v.external_id, v.platform_ids,
    v.quality_score,
    public.venue_completeness(v.description, v.latitude, v.longitude, v.category, v.tags,
                              v.hours, v.website, v.phone, v.email, v.images, v.lgbti_relevance_score) AS completeness,
    v.url_status, v.last_refreshed_at,
    CASE
      WHEN v.last_refreshed_at IS NULL THEN 'never_refreshed'
      WHEN v.url_status IS NOT NULL AND v.url_status NOT IN ('200','') THEN 'broken_url'
      WHEN v.quality_score < 50 THEN 'low_quality'
      ELSE 'stale'
    END AS refresh_reason,
    coalesce(v.website,'') <> ''                                AS has_website,
    length(coalesce(v.description,'')) < 20                     AS needs_description,
    coalesce(lower(v.category),'') IN ('','other','unknown')    AS needs_category,
    coalesce(array_length(v.tags,1),0) = 0                      AS needs_tags,
    (v.hours IS NULL OR v.hours = '{}'::jsonb OR v.hours = 'null'::jsonb) AS needs_hours,
    (coalesce(v.phone,'')='' AND coalesce(v.email,'')='')       AS needs_contact,
    coalesce(array_length(v.images,1),0) = 0                    AS needs_images
  FROM public.venues v
  WHERE v.closed_at IS NULL
    AND v.duplicate_of_id IS NULL
  ORDER BY
    (v.last_refreshed_at IS NOT NULL),
    (v.url_status IS NULL OR v.url_status IN ('200','')),
    v.quality_score ASC NULLS FIRST,
    v.last_refreshed_at ASC NULLS FIRST
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

COMMENT ON FUNCTION public.venues_due_for_refresh(int) IS
  'Budgeted, prioritized batch for the continuous venue refresh loop, with per-field routing flags (has_website + needs_* + live completeness). Excludes closed and duplicate venues.';

GRANT EXECUTE ON FUNCTION public.venues_due_for_refresh(int) TO authenticated, service_role;
