-- The venue review RPCs were anon-executable, and two of them leaked past RLS.
--
-- 20260910153000 created five functions with the usual footer:
--
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;
--
-- That is not sufficient in this database, and the resulting ACL proves it:
--
--     postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- `public` carries a DEFAULT ACL for functions that grants EXECUTE to anon on
-- every function created in the schema:
--
--     objtype 'f' → postgres=X | anon=X | authenticated=X | service_role=X
--
-- Default privileges are applied at CREATE time as an EXPLICIT grant to anon.
-- `REVOKE ... FROM PUBLIC` removes the PUBLIC grant, which was never the one
-- doing the work — the anon grant survives it untouched. Every migration in
-- this repo that ends with that two-line footer and nothing else has shipped an
-- anon-executable function.
--
-- Why it matters here rather than being merely untidy: the two selectors are
-- SECURITY DEFINER and, being LANGUAGE sql, carried no internal gate. Under
-- SECURITY DEFINER, RLS on `venues` does not apply — including the
-- `safety_gated` policy, which exists so that venues in criminalising countries
-- are invisible to anonymous callers. An unauthenticated request to
-- `venue_review_candidates` could therefore enumerate gated venues, complete
-- with name, website and city.
--
-- Two fixes, because either alone is one mistake from regressing:
--   1. REVOKE from anon explicitly.
--   2. Gate the selectors internally, so a future default-privilege re-arm (or
--      a `CREATE OR REPLACE` that resets the ACL) cannot silently re-expose
--      them. The three write functions already call assert_admin_or_internal().

-- ---------------------------------------------------------------------------
-- 1. Gate the selectors from the inside
-- ---------------------------------------------------------------------------
-- Recreated as plpgsql purely to make room for the assertion; the query body
-- is unchanged from 20260910153000.
CREATE OR REPLACE FUNCTION public.venue_review_candidates(
  p_kind   text    DEFAULT 'category',
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  name         text,
  city         text,
  country      text,
  website      text,
  description  text,
  suggested    text,
  confidence   numeric,
  reason       text,
  source_tags  text,
  data_source  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.assert_admin_or_internal();

  RETURN QUERY
  SELECT
    v.id,
    v.name,
    v.city,
    v.country,
    v.website,
    left(coalesce(v.description, ''), 300),
    CASE WHEN p_kind = 'category'
         THEN v.enrichment_status->'category_backfill'->>'suggested' END,
    CASE WHEN p_kind = 'category'
         THEN (v.enrichment_status->'category_backfill'->>'confidence')::numeric END,
    CASE WHEN p_kind = 'nonvenue'
         THEN v.enrichment_status->'nonvenue_candidate'->>'reason' END,
    (SELECT string_agg(DISTINCT s.payload->'raw'->>'tags', ' · ')
       FROM public.venue_sources s WHERE s.venue_id = v.id),
    v.data_source
  FROM public.venues v
  WHERE v.duplicate_of_id IS NULL
    AND v.closed_at IS NULL
    AND coalesce(v.review_status, '') <> 'archived'
    AND (
      (p_kind = 'category'
        AND v.enrichment_status->'category_backfill'->>'status' = 'review')
      OR
      (p_kind = 'nonvenue'
        AND v.enrichment_status->'nonvenue_candidate'->>'status' = 'review')
    )
  ORDER BY
    CASE WHEN p_kind = 'category'
         THEN (v.enrichment_status->'category_backfill'->>'confidence')::numeric
         END DESC NULLS LAST,
    v.id
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 50), 200))
  OFFSET GREATEST(0, coalesce(p_offset, 0));
END; $$;

CREATE OR REPLACE FUNCTION public.venue_review_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_out jsonb;
BEGIN
  PERFORM public.assert_admin_or_internal();

  SELECT jsonb_build_object(
    'category_pending', count(*) FILTER (
      WHERE enrichment_status->'category_backfill'->>'status' = 'review'),
    'nonvenue_pending', count(*) FILTER (
      WHERE enrichment_status->'nonvenue_candidate'->>'status' = 'review'),
    'no_signal', count(*) FILTER (
      WHERE enrichment_status->'category_backfill'->>'status' = 'no_signal'),
    'unexamined', count(*) FILTER (
      WHERE category = 'other' AND NOT (coalesce(enrichment_status,'{}'::jsonb) ? 'category_backfill')),
    'other_total', count(*) FILTER (WHERE category = 'other')
  )
  INTO v_out
  FROM public.venues
  WHERE duplicate_of_id IS NULL
    AND closed_at IS NULL
    AND coalesce(review_status, '') <> 'archived';

  RETURN v_out;
END; $$;

-- ---------------------------------------------------------------------------
-- 2. Take the grant away — from anon AND from PUBLIC, in that order
-- ---------------------------------------------------------------------------
-- `CREATE OR REPLACE` above re-applied the default ACL, so this must run after
-- it, not before.
DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.venue_review_candidates(text, integer, integer)',
    'public.venue_review_counts()',
    'public.decide_venue_category(uuid, boolean, text, text)',
    'public.decide_venue_nonvenue(uuid, boolean, text)',
    'public.restore_venue_from_nonvenue(uuid)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Assert it, so this cannot regress silently
-- ---------------------------------------------------------------------------
-- The ACL is the thing that was wrong, so the ACL is the thing to check. A
-- migration that "revokes" without verifying is exactly how the original got
-- through.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('venue_review_candidates','venue_review_counts',
                       'decide_venue_category','decide_venue_nonvenue',
                       'restore_venue_from_nonvenue')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'anon can still EXECUTE: %', bad;
  END IF;
END $$;
