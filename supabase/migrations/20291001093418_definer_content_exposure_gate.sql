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
-- THE ALLOWLIST IS AUDITED, NOT ASSUMED. Every entry was read as anon and the
-- outcome is noted beside it. That audit found TWO MORE live leaks, so this
-- migration closes three:
--
--   event_previous_editions     -> 1 row for Dubai (AE), Kuala Lumpur, Doha (QA)
--   location_closure_timeline   -> 1,346 of 1,346 gated venues returned a row
--   find_duplicates             -> gated venue id/slug/title/country, incl. NG
--
-- find_duplicates is an oracle rather than a dump — the caller must already know
-- the name — but it confirms existence and hands back a working slug, which is
-- the same harm one step removed.
--
-- HOW TO REPRODUCE, because the obvious way is wrong. `set local role anon` ALONE
-- IS NOT ANON: assert_admin_or_internal() returns early when
-- `request.jwt.claims` is unset ("direct DB session: no JWT context"), so every
-- admin-guarded function reads as wide open. Under that flawed setup
-- venues_due_for_description looked like a leak and was not. Both must be set:
--
--   set local role anon;
--   set local request.jwt.claims = '{"role":"anon"}';
--
-- The mirror-image error is just as easy: a probe that joins `public.venues
-- WHERE safety_gated` AS ANON matches nothing, because RLS already hid those
-- rows — so it reports a clean result having tested nothing. Capture the gated
-- ids as a privileged user FIRST, then check membership as anon, and keep a
-- positive control ("anon sees 0 gated venues in the table") in the same run.

-- ---------------------------------------------------------------------------
-- 1. Close the leaks. THREE, not one — see the audit note above.
-- ---------------------------------------------------------------------------
-- ALTER, not CREATE OR REPLACE. Only the security bit changes, so restating a
-- body I did not write is pure transcription risk for no benefit — and
-- 20260522000000 is this repo's cautionary tale about a "no-op" re-assert that
-- silently reverted a rule.
--
-- Each of these reads a safety_gated table with no gate of its own, so under
-- INVOKER the existing RLS policy answers per caller: anon sees the ungated
-- subset, a signed-in user still sees everything. None of them needs owner
-- rights for anything else.
-- (a) event_previous_editions: INVOKER. It reads only `events`, which anon may
--     select under RLS, so it degrades exactly as intended — verified as anon:
--     1 row for Dubai before, 0 after, and ungated lookups unaffected.
ALTER FUNCTION public.event_previous_editions(text, text, integer) SECURITY INVOKER;

-- (b) location_closure_timeline and find_duplicates: REVOKE, not INVOKER.
--     Measured: under INVOKER both ERROR for anon —
--       location_closure_timeline -> permission denied for table venue_closed_audit
--       find_duplicates           -> permission denied for table search_embeddings
--     They read helper tables anon cannot select, so INVOKER turns a leak into a
--     hard failure on EVERY anon call, gated or not. That is a regression, not a
--     fix. Neither has a caller anywhere in src/, supabase/functions or scripts —
--     they are admin/pipeline helpers that were anon-callable only because of the
--     stock ALTER DEFAULT PRIVILEGES grant.
--
--     `authenticated` is deliberately KEPT: a signed-in user is already permitted
--     to see gated rows by the RLS policy, so removing it would restrict beyond
--     the leak. The exposure is specifically to anon.
--
--     PUBLIC must be revoked too. Revoking `from anon` alone is a no-op while the
--     built-in PUBLIC grant stands — has_function_privilege('anon', …) stays TRUE
--     while the anon entry vanishes from proacl, which is the trap
--     check-anon-function-grants.mjs warns about in its FIX block.
REVOKE EXECUTE ON FUNCTION public.location_closure_timeline(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_duplicates(text, text, vector, uuid, real, real, integer) FROM PUBLIC, anon;

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
    -- AUDITED 2027-06-02, every one read as anon with BOTH `set role anon` and
    -- `request.jwt.claims = '{"role":"anon"}'` set — the second is load-bearing,
    -- see the header. Outcome noted per entry.
    ('assert_search_hybrid_contract'),      -- aggregate contract string, no rows
    ('cities_directory'),                   -- cities carry no safety_gated column
    ('city_markable_totals'),               -- counts only
    ('existence_blind_spots'),              -- raises 'admin only' for anon
    ('existence_recent_archives'),          -- raises 'admin only' for anon
    ('existence_review_queue'),             -- raises 'admin only' for anon
    ('find_polygon_for_point'),             -- polygon layers, not entity rows
    ('find_semantic_duplicate_candidates'), -- 10 rows, gated row absent from its OWN embedding
    ('get_homepage_stats'),                 -- aggregate counts
    ('local_supporter_score'),              -- user-scoped counters, no entity content
    ('organization_products'),              -- 0 of 437 gated orgs return products
    ('quest_progress'),                     -- counts only
    ('user_local_supporter_cities')         -- 0 rows
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
  'CI gate: SECURITY DEFINER + anon-callable functions that read a safety_gated table, never mention the gate/session/admin assertion, and return row content. Every allowlist entry was audited as anon (role + request.jwt.claims both set) with the outcome noted in the migration. Read by scripts/check-definer-content-leaks.mjs.';

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
