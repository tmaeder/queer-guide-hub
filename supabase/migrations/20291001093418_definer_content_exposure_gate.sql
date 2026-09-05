-- A SECURITY DEFINER function may not hand safety-gated row CONTENT to anon.
--
-- 20290601120731 closed one instance (_dedup_event_cluster_side, which I had
-- introduced) and its header recorded the missing rule as a follow-up. This is
-- that follow-up — and writing the detector immediately found a SECOND live
-- instance that predates my work.
--
-- WHAT LEAKED. `event_previous_editions(title, city, limit)` is STABLE SECURITY
-- DEFINER, anon-callable, and reads public.events with no reference to
-- safety_gated. Measured on prod before this migration:
--
--   select event_previous_editions('AM Nights Goes International','Dubai',3)
--   -> [{"id":"0536628b…","city":"Dubai","title":"AM Nights Goes International",
--        "country":"AE","venue_name":…,"address":…,"latitude":…, …}]
--
--   same shape for Kuala Lumpur and for Doha (QA).
--
-- 61 events, 1,346 venues and 437 organizations carry safety_gated = true. Their
-- RLS is `USING (NOT safety_gated OR auth.uid() IS NOT NULL)`; definer rights
-- skip it, so a signed-out visitor could read them.
--
-- THE FIX IS SECURITY INVOKER, NOT A safety_gated FILTER. Adding
-- `and not safety_gated` would hide gated editions from SIGNED-IN users too,
-- who are explicitly allowed to see them — it would trade a leak for a
-- regression. Under INVOKER the existing policy answers per caller: anon sees
-- the ungated subset, an authenticated user sees everything, and nothing else
-- about the function changes.
--
-- WHY THE DETECTOR IS NOT ZERO-TOLERANCE. The obvious rule — "definer + anon +
-- reads a gated table" — flags 57 functions. Narrowing to "and never mentions
-- safety_gated or auth.uid or an admin assertion, and returns a content-shaped
-- type" gets it to 18, which is still not a gate; it is a list. And the
-- heuristic has proven false positives: `get_entity_detail` matches every clause
-- yet returns NULL for a gated event, because it filters through an indirection
-- a regex cannot see (verified on prod). So this ships as an ALLOWLIST gate in
-- the shape of check-anon-function-grants.mjs: the current population is
-- recorded, anything NEW fails.
--
-- THE ALLOWLIST IS A RECORD, NOT AN ENDORSEMENT, and it says which is which.
-- Two entries are verified safe against prod. The rest are UNAUDITED: they match
-- the heuristic and nobody has checked them. Writing them down as "unaudited" is
-- the honest state — the alternative is either a gate that cries wolf on 18
-- functions until someone disables it, or a silent baseline that reads as
-- approval. The value of the gate is the NEXT one, not these.

-- ---------------------------------------------------------------------------
-- 1. Close the leak.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_previous_editions(p_title text, p_city text DEFAULT NULL::text, p_limit integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with norm as (
    select lower(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g')) as t,
           lower(trim(coalesce(p_city, ''))) as c
  ),
  seed_fests as (
    select distinct e.festival_id
    from public.events e, norm n
    where n.t <> '' and e.festival_id is not null
      and similarity(lower(e.title), n.t) > 0.45
  ),
  cand_ids as (
    select e.id from public.events e join seed_fests f on e.festival_id = f.festival_id
    union
    select e.id from public.events e, norm n
    where n.t <> '' and similarity(lower(e.title), n.t) > 0.45
      and (n.c = '' or lower(coalesce(e.city, '')) = n.c)
  ),
  picked as (
    select e.id, e.title, e.edition, e.start_date, e.festival_id, e.description,
           e.event_type, e.venue_id, e.venue_name, e.address, e.city, e.city_id,
           e.country, e.country_id, e.latitude, e.longitude, e.website, e.ticket_url,
           e.is_free, e.price_min, e.price_max
    from public.events e
    where e.id in (select id from cand_ids)
      and e.start_date < now()
      and coalesce(e.status, 'active') <> 'rejected'
      and e.duplicate_of_id is null
    order by e.start_date desc
    limit greatest(p_limit, 0)
  )
  select coalesce(jsonb_agg(to_jsonb(picked) order by picked.start_date desc), '[]'::jsonb)
  from picked;
$function$;

-- ---------------------------------------------------------------------------
-- 2. The detector.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.definer_content_exposure()
 RETURNS TABLE(function_name text, returns text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  with gated(t) as (
    -- Tables carrying the safety gate. Derived, not hardcoded, so a new gated
    -- table is covered the day it gains the column.
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'safety_gated' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  allowed(name) as (values
    -- VERIFIED SAFE against prod (returns nothing for a gated row):
    ('get_entity_detail'),          -- returns NULL for a safety_gated event
    ('related_by_tags'),            -- returns [] from a safety_gated event
    -- UNAUDITED — matches the heuristic, nobody has checked it. Recorded so the
    -- gate can fail on anything NEW; each of these still wants a look.
    ('assert_search_hybrid_contract'),
    ('cities_directory'),
    ('city_markable_totals'),
    ('existence_blind_spots'),
    ('existence_recent_archives'),
    ('existence_review_queue'),
    ('find_duplicates'),
    ('find_hotel_duplicate_clusters'),
    ('find_polygon_for_point'),
    ('find_semantic_duplicate_candidates'),
    ('get_homepage_stats'),
    ('link_event_venues'),
    ('link_org_merchant_domain_matches'),
    ('local_supporter_score'),
    ('location_closure_timeline'),
    ('organization_products'),
    ('quest_progress'),
    ('user_local_supporter_cities'),
    ('venues_due_for_description')
  )
  select p.proname::text, pg_get_function_result(p.oid)::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    -- reads a gated table…
    and exists (select 1 from gated g where pg_get_functiondef(p.oid) ~* ('\m' || g.t || '\M'))
    -- …without ever naming the gate, the session, or an admin assertion
    and pg_get_functiondef(p.oid) !~* 'safety_gated'
    and pg_get_functiondef(p.oid) !~* 'auth\.uid'
    and pg_get_functiondef(p.oid) !~* 'assert_admin|assert_service|assert_internal|is_admin'
    -- …and hands back row content rather than a count or an existence answer.
    -- gated_entity_exists (boolean) and gated_count_for_location (integer) are
    -- definer + anon BY DESIGN and must never be flagged.
    and pg_get_function_result(p.oid) !~* '^(boolean|integer|bigint|smallint|numeric|void|uuid|trigger)$'
    and p.proname not in (select name from allowed)
  order by 1;
$function$;

REVOKE ALL ON FUNCTION public.definer_content_exposure() FROM public;
REVOKE ALL ON FUNCTION public.definer_content_exposure() FROM anon;
REVOKE ALL ON FUNCTION public.definer_content_exposure() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.definer_content_exposure() TO service_role;

COMMENT ON FUNCTION public.definer_content_exposure() IS
  'CI gate: SECURITY DEFINER + anon-callable functions that read a safety_gated table, never mention the gate/session/admin assertion, and return row content. Allowlist is a RECORD, not an endorsement — entries marked UNAUDITED in the migration have not been checked. Read by scripts/check-definer-content-leaks.mjs.';

-- ---------------------------------------------------------------------------
-- 3. Assert both halves.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE v_secdef boolean; v_leaked jsonb; v_new int;
BEGIN
  SELECT p.prosecdef INTO v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'event_previous_editions';
  IF v_secdef THEN
    RAISE EXCEPTION 'event_previous_editions is still SECURITY DEFINER';
  END IF;

  -- The detector must be self-consistent: with the leak fixed and the current
  -- population allowlisted, it returns nothing. A non-empty result here means
  -- the allowlist and the live corpus disagree, which is the state the gate
  -- exists to report — so fail rather than ship a gate that is already red.
  SELECT count(*) INTO v_new FROM public.definer_content_exposure();
  IF v_new <> 0 THEN
    RAISE EXCEPTION 'definer_content_exposure() returns % unallowlisted function(s) at install time: %',
      v_new, (select string_agg(function_name, ', ') from public.definer_content_exposure());
  END IF;

  RAISE NOTICE 'event_previous_editions is INVOKER; definer_content_exposure clean at install';
END $verify$;
