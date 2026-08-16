-- Venue category / non-venue REVIEW QUEUE
--
-- State before this migration
-- ---------------------------
-- `run_venue_category_reclassify` (20260810120200) is registered, enabled and
-- running nightly at 03:35. It is deliberately conservative: only bar / sauna /
-- community_center clear 85% measured agreement against independent ground
-- truth and auto-apply. Everything else is written as a SUGGESTION with
-- `needs_attention`, never to `venues.category`, because "a null category is
-- recoverable; a wrong one is not".
--
-- That conservatism is correct — sampling the held-back suggestions confirms it.
-- At the engine's own highest confidence (hotel, 0.79) the set still contains
-- "Male Massage Noida" and "Le Petit Chef - der kleinste Koch der Welt". Club
-- measured 23.8%.
--
-- The gap is that its output had nowhere to go:
--
--     844  category suggestions   status='review'   no way to accept or reject
--   1,319  non-venue candidates   status='review'   no way to disposition
--   2,289  no_signal (terminal)   correctly left as 'other'
--   9,865  not yet examined       drains at 300/night
--
-- `CategoryCoveragePanel` rendered "Venues awaiting review" as a number and
-- nothing else, so the count implied a review process that did not exist.
--
-- What this adds
-- --------------
-- A selector and four decision RPCs. No new table: `enrichment_status` already
-- IS the queue, and the engine's own selector skips any row that carries the
-- `category_backfill` key, so a decided row is never re-examined. A queue table
-- would be a second source of truth that has to be kept in sync with it.
--
-- Every decision is one row, made by a human, and reversible.
--
-- Non-venues are NEVER auto-archived. A keyword rule for "this is a street, not
-- a venue" was measured at roughly 50% precision — it flags "Lighthouse Bar &
-- Grill" and "Pecker's Bar & Grill" alongside "Carrer de Tomàs Ortuño". The
-- machine proposes; a person decides.

-- ---------------------------------------------------------------------------
-- 1. Selector
-- ---------------------------------------------------------------------------
-- Returns the evidence a reviewer needs to decide WITHOUT opening each venue:
-- the suggestion, its confidence, and crucially the raw source tags the engine
-- itself read (venue_sources.payload->'raw'->>'tags'), which is the strongest
-- signal available and the one that makes a judgement possible at a glance.
CREATE OR REPLACE FUNCTION public.venue_review_candidates(
  p_kind   text    DEFAULT 'category',   -- 'category' | 'nonvenue'
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
  -- Highest confidence first for categories (cheapest correct decisions
  -- first); for non-venues, stable by id so paging cannot skip a row.
  ORDER BY
    CASE WHEN p_kind = 'category'
         THEN (v.enrichment_status->'category_backfill'->>'confidence')::numeric
         END DESC NULLS LAST,
    v.id
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 50), 200))
  OFFSET GREATEST(0, coalesce(p_offset, 0));
$$;

ALTER FUNCTION public.venue_review_candidates(text, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.venue_review_candidates(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_review_candidates(text, integer, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Counts, so the panel can stop showing a number with no verb behind it
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venue_review_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
  FROM public.venues
  WHERE duplicate_of_id IS NULL
    AND closed_at IS NULL
    AND coalesce(review_status, '') <> 'archived';
$$;

ALTER FUNCTION public.venue_review_counts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.venue_review_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_review_counts() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Decide a category suggestion
-- ---------------------------------------------------------------------------
-- `p_category` lets the reviewer pick something OTHER than the suggestion —
-- the common case is the engine being close but wrong ("Male Massage Noida"
-- suggested as a hotel), and forcing accept-or-nothing would throw away the
-- human's actual knowledge.
CREATE OR REPLACE FUNCTION public.decide_venue_category(
  p_venue_id uuid,
  p_accept   boolean,
  p_category text DEFAULT NULL,
  p_note     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_suggested text;
  v_final     text;
  v_status    text;
BEGIN
  PERFORM public.assert_admin_or_internal();

  SELECT enrichment_status->'category_backfill'->>'suggested'
    INTO v_suggested
    FROM public.venues WHERE id = p_venue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue % not found', p_venue_id USING ERRCODE = 'P0002';
  END IF;

  IF p_accept THEN
    v_final := coalesce(nullif(btrim(coalesce(p_category, '')), ''), v_suggested);
    IF v_final IS NULL THEN
      RAISE EXCEPTION 'nothing to apply: no suggestion and no explicit category'
        USING ERRCODE = '22023';
    END IF;
    v_status := 'applied';
  ELSE
    -- Rejected rows keep the `category_backfill` key, which is what stops the
    -- nightly engine re-suggesting them: its selector skips any row that has it.
    v_final  := NULL;
    v_status := 'rejected';
  END IF;

  UPDATE public.venues v SET
    category = coalesce(v_final, v.category),
    needs_attention = CASE
      WHEN coalesce(v.enrichment_status->'nonvenue_candidate'->>'status', '') = 'review'
      THEN v.needs_attention          -- another open flag still needs a human
      ELSE false END,
    enrichment_status = jsonb_set(
      coalesce(v.enrichment_status, '{}'::jsonb), '{category_backfill}',
      coalesce(v.enrichment_status->'category_backfill', '{}'::jsonb)
        || jsonb_build_object(
             'status',      v_status,
             'applied',     v_final,
             'decided_at',  now(),
             'decided_by',  coalesce(auth.uid()::text, 'internal'),
             'note',        nullif(btrim(coalesce(p_note, '')), '')))
  WHERE v.id = p_venue_id;

  RETURN jsonb_build_object('id', p_venue_id, 'status', v_status, 'category', v_final);
END; $$;

ALTER FUNCTION public.decide_venue_category(uuid, boolean, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.decide_venue_category(uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_venue_category(uuid, boolean, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Decide a non-venue candidate (reversible both ways)
-- ---------------------------------------------------------------------------
-- Confirming does NOT delete and does NOT set duplicate_of_id — the merge cores
-- repoint content through that column, so using it here would be a different
-- and much harder-to-undo operation. This is the archive convention already in
-- use on 687 venues: review_status='archived' + seo_indexable=false, with the
-- previous values snapshotted so `restore_venue_from_nonvenue` can put them back.
CREATE OR REPLACE FUNCTION public.decide_venue_nonvenue(
  p_venue_id uuid,
  p_confirm  boolean,
  p_note     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_prev_status text;
  v_prev_seo    boolean;
BEGIN
  PERFORM public.assert_admin_or_internal();

  SELECT review_status, seo_indexable INTO v_prev_status, v_prev_seo
    FROM public.venues WHERE id = p_venue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue % not found', p_venue_id USING ERRCODE = 'P0002';
  END IF;

  IF p_confirm THEN
    UPDATE public.venues SET
      review_status   = 'archived',
      seo_indexable   = false,
      needs_attention = false,
      enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
        coalesce(enrichment_status->'nonvenue_candidate', '{}'::jsonb)
          || jsonb_build_object(
               'status',     'confirmed',
               'decided_at', now(),
               'decided_by', coalesce(auth.uid()::text, 'internal'),
               'note',       nullif(btrim(coalesce(p_note, '')), ''),
               -- The snapshot IS the undo. Without it "restore" would have to
               -- guess whether the row was approved or pending before.
               'archived',   jsonb_build_object(
                               'review_status', v_prev_status,
                               'seo_indexable', v_prev_seo)))
    WHERE id = p_venue_id;
    RETURN jsonb_build_object('id', p_venue_id, 'status', 'confirmed');
  END IF;

  UPDATE public.venues SET
    needs_attention = CASE
      WHEN coalesce(enrichment_status->'category_backfill'->>'status', '') = 'review'
      THEN needs_attention
      ELSE false END,
    enrichment_status = jsonb_set(
      coalesce(enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
      coalesce(enrichment_status->'nonvenue_candidate', '{}'::jsonb)
        || jsonb_build_object(
             'status',     'rejected',
             'decided_at', now(),
             'decided_by', coalesce(auth.uid()::text, 'internal'),
             'note',       nullif(btrim(coalesce(p_note, '')), '')))
  WHERE id = p_venue_id;

  RETURN jsonb_build_object('id', p_venue_id, 'status', 'rejected');
END; $$;

ALTER FUNCTION public.decide_venue_nonvenue(uuid, boolean, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.decide_venue_nonvenue(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_venue_nonvenue(uuid, boolean, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Undo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_venue_from_nonvenue(p_venue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_snap jsonb;
BEGIN
  PERFORM public.assert_admin_or_internal();

  SELECT enrichment_status->'nonvenue_candidate'->'archived'
    INTO v_snap FROM public.venues WHERE id = p_venue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue % not found', p_venue_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.venues SET
    -- Fall back to 'pending' rather than 'approved': a row that came back from
    -- the archive should be looked at, not silently republished.
    review_status = coalesce(v_snap->>'review_status', 'pending'),
    seo_indexable = coalesce((v_snap->>'seo_indexable')::boolean, false),
    enrichment_status = jsonb_set(
      coalesce(enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
      coalesce(enrichment_status->'nonvenue_candidate', '{}'::jsonb)
        || jsonb_build_object(
             'status',      'rejected',
             'restored_at', now(),
             'restored_by', coalesce(auth.uid()::text, 'internal')))
  WHERE id = p_venue_id;

  RETURN jsonb_build_object('id', p_venue_id, 'status', 'restored');
END; $$;

ALTER FUNCTION public.restore_venue_from_nonvenue(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.restore_venue_from_nonvenue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_venue_from_nonvenue(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.venue_review_candidates(text, integer, integer) IS
  'Pending venue category suggestions / non-venue candidates with the evidence a human needs to decide. Admin-gated.';
COMMENT ON FUNCTION public.decide_venue_category(uuid, boolean, text, text) IS
  'Accept (optionally overriding) or reject a suggested venue category. Keeps the category_backfill key so the nightly engine never re-suggests a decided row.';
COMMENT ON FUNCTION public.decide_venue_nonvenue(uuid, boolean, text) IS
  'Confirm a venue is not a venue (reversible soft-archive, previous state snapshotted) or reject the flag. Never auto-called.';
