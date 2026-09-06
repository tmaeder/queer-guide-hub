-- The venue dedup reviewer sees two ids, two titles and a distance. That is not
-- enough to decide, and the decisions on record prove it.
--
-- All 4 venue pairs a human has ever rejected turned on the STREET ADDRESS:
--
--   Rapa Nui / Rapanui       Malabia 2014 vs Av. Pedro Goyena 1515 -- an
--                            Argentine chain, two real branches
--   ElNin-Yo / Elninyo       Phra Nakhon vs Kamphaengphet Rd, Chatuchak
--   Gay Mens Health Crisis   155 E 23rd St vs 307 W 38th St -- same organisation,
--                            two offices; a merge silently drops one
--   Jessheim / Fredrikstad Pride   two different Norwegian towns
--
-- None of those fields is in the payload. The queue row carries
-- {keep:{id,title}, drop:{id,title}, distance_m, match_type, auto_eligible} and
-- nothing else, so every one of those four decisions required leaving the inbox
-- and opening two venue records by hand. Worse, `distance_m` -- the one
-- discriminating-looking field present -- is actively misleading on this corpus:
-- Rapa Nui's real branches are 5.1 km apart and duplicate records of ONE venue
-- routinely sit 400+ km apart on placeholder coordinates.
--
-- This is the same fix 20270822093513 made for events, which added start_date to
-- the payload because all 50 event rejections hinged on it.
--
-- SECURITY INVOKER, NOT DEFINER, and that is the whole point of 20290601120731.
-- Its sibling _dedup_event_cluster_side was written SECURITY DEFINER by reflex,
-- copying the shape of the sweep that calls it, and leaked safety-gated events in
-- the UAE and Malaysia to anon: a DEFINER function runs as its owner and skips the
-- `USING (NOT safety_gated OR auth.uid() IS NOT NULL)` policy entirely. `venues`
-- carries exactly that policy for exactly the same reason, so the same mistake here
-- would expose venues in criminalizing countries -- the rows the safety layer
-- exists to hide.
--
-- It never needs DEFINER rights. Its only caller is run_dedup_truth_sweep, which
-- is itself SECURITY DEFINER, so inside that call the effective user is already
-- the sweep's owner and an INVOKER callee sees the whole corpus exactly as before.
-- What changes is a DIRECT call, which now reads under the caller's own RLS.
--
-- The key names `keep`/`drop` and `title` are load-bearing: triage_src_dedup_review
-- builds its inbox row from cluster->'keep'->>'title' and passes the whole cluster
-- through as `meta`. So renaming `title` breaks the inbox, while everything else
-- added under those objects reaches the reviewer with NO view migration -- and the
-- view cannot take one cheaply anyway, since CREATE OR REPLACE VIEW cannot change
-- a column list and it is named in two revoke lists.

CREATE OR REPLACE FUNCTION public._dedup_venue_cluster_side(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'id', v.id,
    'title', v.name,
    'slug', v.slug,
    'city', v.city,
    'address', nullif(btrim(v.address), ''),
    'website', v.website,
    'phone', v.phone,
    'category', v.category,
    'quality_score', v.quality_score,
    -- Say plainly whether the row HAS coordinates. distance_m alone cannot
    -- distinguish "no coordinates" from "coordinates that disagree", and the old
    -- reason column called both of those `no_geo`.
    'has_coords', (v.latitude is not null and v.longitude is not null),
    'source', (select s.source_slug from public.venue_sources s
               where s.venue_id = v.id
               order by s.is_primary desc nulls last, s.first_seen_at limit 1))
  from public.venues v where v.id = p_id;
$function$;

COMMENT ON FUNCTION public._dedup_venue_cluster_side(uuid) IS
  'Review payload for one side of a venue dedup pair. Carries the address, which is '
  'what all 4 venue rejections on record actually turned on, and has_coords, because '
  'distance_m cannot distinguish missing coordinates from disagreeing ones. '
  'SECURITY INVOKER deliberately -- see 20290601120731: the event twin was DEFINER '
  'and leaked safety_gated rows to anon.';

REVOKE ALL ON FUNCTION public._dedup_venue_cluster_side(uuid) FROM public;
REVOKE ALL ON FUNCTION public._dedup_venue_cluster_side(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._dedup_venue_cluster_side(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._dedup_venue_cluster_side(uuid) TO service_role;

-- Assert both halves, the way 20290601120731 does. Checking only the grant passes
-- again the moment something re-grants anon; checking only the volatility class
-- passes while anon can still call it. This project also carries
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, so test the
-- PRIVILEGE rather than reading proacl.
DO $verify$
DECLARE v_secdef boolean; v_anon boolean; v_authed boolean; v_side jsonb; v_id uuid;
BEGIN
  SELECT p.prosecdef,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    INTO v_secdef, v_anon, v_authed
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_dedup_venue_cluster_side';

  IF v_secdef THEN
    RAISE EXCEPTION '_dedup_venue_cluster_side is SECURITY DEFINER -- it would bypass the safety_gated RLS policy on venues';
  END IF;
  IF v_anon THEN RAISE EXCEPTION '_dedup_venue_cluster_side is executable by anon'; END IF;
  IF v_authed THEN RAISE EXCEPTION '_dedup_venue_cluster_side is executable by authenticated'; END IF;

  SELECT id INTO v_id FROM public.venues WHERE duplicate_of_id IS NULL AND address <> '' LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'no venue to probe -- cannot prove the payload has a shape'; END IF;

  v_side := public._dedup_venue_cluster_side(v_id);
  IF v_side IS NULL OR NOT (v_side ? 'address') OR NOT (v_side ? 'title')
     OR NOT (v_side ? 'has_coords') THEN
    RAISE EXCEPTION 'venue cluster side is missing a load-bearing key: %', v_side;
  END IF;

  RAISE NOTICE '_dedup_venue_cluster_side: SECURITY INVOKER, service_role only, payload %', v_side;
END $verify$;
