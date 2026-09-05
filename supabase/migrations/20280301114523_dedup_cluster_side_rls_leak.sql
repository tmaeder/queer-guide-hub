-- _dedup_event_cluster_side leaked safety-gated events to anon.
--
-- I introduced this function in 20270822093513 to give the dedup reviewer the
-- fields the decision turns on. I wrote it SECURITY DEFINER by reflex — copying
-- the shape of the sweep that calls it — and that was wrong twice over.
--
-- MEASURED ON PROD before this migration:
--
--   select has_function_privilege('anon','public._dedup_event_cluster_side(uuid)','EXECUTE')
--   -> true
--
--   select public._dedup_event_cluster_side(id) from events where safety_gated
--   -> {"city":"Dubai","title":"AM Nights Goes International", ...}
--      {"city":"Kuala Lumpur","title":"Gerai OA @ Art for Grabs March 2014", ...}
--
-- Those are exactly the rows the safety layer exists to hide. `venues`, `events`
-- and `organizations` in criminalizing countries carry `safety_gated = true` and
-- their RLS policy is `USING (NOT safety_gated OR auth.uid() IS NOT NULL)` — a
-- signed-out visitor must not be able to enumerate them. A SECURITY DEFINER
-- function runs as its owner and therefore skips that policy entirely, so one
-- anon RPC call returned the title, city, slug, start time and source of a gated
-- event in the UAE and in Malaysia.
--
-- THE FUNCTION NEVER NEEDED DEFINER RIGHTS. Its only caller is
-- run_dedup_truth_sweep, which is itself SECURITY DEFINER: inside that call the
-- effective user is already the sweep's owner, so a SECURITY INVOKER callee sees
-- the whole corpus exactly as before. The nightly merge behaviour is unchanged.
-- What changes is the direct call: anon now reads it under anon's own RLS, which
-- is the correct answer to "may this caller see this row".
--
-- Both halves are applied deliberately:
--
--   1. SECURITY INVOKER — the durable fix. Even if some later blanket
--      `GRANT EXECUTE ... TO anon` re-grants this function (something did grant
--      it: the ACL reads `anon=X/postgres`, an explicit grant, not the PUBLIC
--      default my original REVOKE removed), the function still cannot bypass RLS.
--   2. Grants narrowed to service_role — matching what 20280301100000 (#3490)
--      did to event_dup_signals, the sibling function from the same PR whose
--      `authenticated` grant failed `Critical data-quality gates` on every open
--      PR in the repo until someone else revoked it.
--
-- Revoking alone would not be enough, and INVOKER alone would leave a
-- write-capable-looking DEFINER in the gate's sights. The pair is the fix.
--
-- WHY NO GATE CAUGHT THIS, which is the part worth carrying forward.
-- scripts/check-anon-function-grants.mjs is scoped, deliberately and in writing,
-- to "VOLATILE (can write) + SECURITY DEFINER". Both functions from that PR were
-- DEFINER and anon-callable; only event_dup_signals is VOLATILE, so only it
-- tripped the gate — loudly, on every open PR in the repo, which is how it got
-- fixed within the hour. This one is STABLE, so the gate is structurally unable
-- to see it, and it leaked quietly instead.
--
-- The gate is not wrong: widening it to every STABLE definer would flag
-- gated_entity_exists and gated_count_for_location, which are DEFINER + anon BY
-- DESIGN (they answer "does a gated thing exist here" with a count and never
-- with content). The missing rule is narrower and harder — a definer function
-- that returns row CONTENT from a safety_gated table to anon — and it is left
-- as a deliberate follow-up rather than bolted on here, because a security gate
-- that cries wolf is one people learn to route around. Recorded so the next
-- reader knows the blind spot exists and is not merely undiscovered.

CREATE OR REPLACE FUNCTION public._dedup_event_cluster_side(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'slug', e.slug,
    'start_date', e.start_date, 'city', e.city, 'venue_name', e.venue_name,
    'source', (select s.source_slug from public.event_sources s
               where s.event_id = e.id
               order by s.is_primary desc nulls last, s.first_seen_at limit 1))
  from public.events e where e.id = p_id;
$function$;

REVOKE ALL ON FUNCTION public._dedup_event_cluster_side(uuid) FROM public;
REVOKE ALL ON FUNCTION public._dedup_event_cluster_side(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._dedup_event_cluster_side(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._dedup_event_cluster_side(uuid) TO service_role;

-- Assert the exposure is actually closed, both ways. Checking only the grant
-- would pass again the moment something re-grants anon; checking only the
-- volatility class would pass while anon could still call it.
DO $verify$
DECLARE v_secdef boolean; v_anon boolean; v_authed boolean;
BEGIN
  SELECT p.prosecdef,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    INTO v_secdef, v_anon, v_authed
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_dedup_event_cluster_side';

  IF v_secdef THEN
    RAISE EXCEPTION '_dedup_event_cluster_side is still SECURITY DEFINER — it would keep bypassing the safety_gated RLS policy';
  END IF;
  IF v_anon THEN
    RAISE EXCEPTION '_dedup_event_cluster_side is still executable by anon';
  END IF;
  IF v_authed THEN
    RAISE EXCEPTION '_dedup_event_cluster_side is still executable by authenticated';
  END IF;

  RAISE NOTICE '_dedup_event_cluster_side: SECURITY INVOKER, service_role only';
END $verify$;

-- The sweep must still be able to build a review payload. A dedup queue row
-- whose cluster lost its start_date would put the reviewer back where they were
-- before 20270822093513 — deciding a showtime-vs-duplicate question without the
-- field it turns on.
DO $sweep_still_works$
DECLARE v_side jsonb; v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.events WHERE duplicate_of_id IS NULL LIMIT 1;
  IF v_id IS NULL THEN RAISE NOTICE 'no events to probe'; RETURN; END IF;

  v_side := public._dedup_event_cluster_side(v_id);
  IF v_side IS NULL OR NOT (v_side ? 'start_date') THEN
    RAISE EXCEPTION 'cluster side lost its shape: %', v_side;
  END IF;
  RAISE NOTICE 'cluster payload intact for the sweep';
END $sweep_still_works$;
