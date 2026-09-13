-- Two SECURITY DEFINER trip RPCs are executable by `anon` and apply NO visibility rule at all.
-- SECURITY DEFINER bypasses RLS, so a function that reads trip data has to re-apply the rule that
-- `trips_select` enforces -- and these never did:
--
--   detect_trip_gaps(p_trip_id)              returns trip_day_id, DATE, day_part, reason
--                                            -> the day-by-day shape of ANY trip, dates included
--   get_similar_trip_suggestions(p_trip_id)  returns aggregate recommendations for ANY trip
--
-- detect_trip_gaps is the sharper of the two because it returns actual DATES. Together with
-- mv_trip_similarity_inputs (closed separately) this is the same "when is this person travelling"
-- exposure that the safety-gating layer exists to prevent, reachable without signing in.
--
-- Exploitability is bounded by needing a trip UUID, which is not enumerable in practice. That is
-- why this is a correctness fix rather than an incident: the gate is missing, not the secret.
--
-- THE RULE IS COPIED, NOT INVENTED. It is the `trips_select` policy verbatim:
--     (is_public = true) OR (owner_id = auth.uid()) OR is_trip_member(id, auth.uid())
-- Anonymous callers therefore keep working for PUBLIC trips, which is why EXECUTE stays granted to
-- anon rather than being revoked -- revoking would break public trip sharing, a real feature
-- (`trips.is_public`).
--
-- can_view_trip() is added alongside the existing can_edit_trip()/is_trip_member() so the two
-- call sites share one definition instead of two inline copies. The `trips_select` policy is
-- deliberately NOT rewritten to call it: changing a live RLS policy to refactor is a bigger risk
-- than the duplication it removes. If the rule ever changes, both must move together.
--
-- search_path is set on all four SECURITY DEFINER functions in public that lacked it. Measured:
-- `anon` and `authenticated` have NO CREATE on schema public, so the search-path hijack is not
-- reachable by an API role today -- this is defense-in-depth, and it stops the advisor flagging
-- them. The other 85 mutable-search_path functions are SECURITY INVOKER, where the setting grants
-- no escalation (the caller already has their own privileges), and are deliberately untouched.

create or replace function public.can_view_trip(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Mirrors the trips_select RLS policy.
  select exists (
    select 1 from public.trips t
     where t.id = p_trip_id
       and (t.is_public = true
            or t.owner_id = p_user_id
            or public.is_trip_member(t.id, p_user_id))
  );
$function$;

revoke all on function public.can_view_trip(uuid, uuid) from public;
grant execute on function public.can_view_trip(uuid, uuid) to anon, authenticated, service_role;

create or replace function public.detect_trip_gaps(p_trip_id uuid)
 returns table(trip_day_id uuid, date date, day_part text, reason text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  WITH parts(part) AS (VALUES ('morning'),('afternoon'),('evening'),('night')),
  filled AS (
    SELECT td.id AS trip_day_id, td.date,
      CASE WHEN tp.start_time IS NULL THEN NULL
           WHEN tp.start_time < TIME '11:00' THEN 'morning'
           WHEN tp.start_time < TIME '17:00' THEN 'afternoon'
           WHEN tp.start_time < TIME '21:00' THEN 'evening'
           ELSE 'night' END AS slot
      FROM public.trip_days td LEFT JOIN public.trip_places tp ON tp.day_id = td.id
     WHERE td.trip_id = p_trip_id
       AND public.can_view_trip(p_trip_id, auth.uid())),
  occupancy AS (SELECT trip_day_id, date, slot FROM filled WHERE slot IS NOT NULL GROUP BY trip_day_id, date, slot)
  SELECT td.id, td.date, p.part,
    CASE p.part WHEN 'morning' THEN 'No morning plan' WHEN 'afternoon' THEN 'Afternoon is open'
                WHEN 'evening' THEN 'Evening is open' ELSE 'Nothing scheduled for the night' END
    FROM public.trip_days td CROSS JOIN parts p
   WHERE td.trip_id = p_trip_id
     AND public.can_view_trip(p_trip_id, auth.uid())
     AND NOT EXISTS (SELECT 1 FROM occupancy o WHERE o.trip_day_id = td.id AND o.slot = p.part)
   ORDER BY td.date, array_position(ARRAY['morning','afternoon','evening','night'], p.part);
$function$;

create or replace function public.get_similar_trip_suggestions(p_trip_id uuid, p_limit integer default 10)
 returns table(entity_type text, entity_id uuid, weight bigint, trips_count bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  WITH me AS (SELECT trip_id, primary_country_code, season, duration_days, city_ids
                FROM public.mv_trip_similarity_inputs
               WHERE trip_id = p_trip_id
                 AND public.can_view_trip(p_trip_id, auth.uid())),
  peers AS (
    SELECT s.trip_id FROM public.mv_trip_similarity_inputs s, me
     WHERE s.trip_id <> me.trip_id
       AND ((s.primary_country_code = me.primary_country_code AND s.season = me.season
             AND abs(COALESCE(s.duration_days,0) - COALESCE(me.duration_days,0)) <= 2)
            OR (s.city_ids && me.city_ids
                AND cardinality(s.city_ids) BETWEEN GREATEST(1, cardinality(me.city_ids)-2) AND cardinality(me.city_ids)+2))),
  my_places AS (SELECT venue_id, event_id, hotel_id FROM public.trip_places WHERE trip_id = p_trip_id),
  agg AS (
    SELECT 'venue'::TEXT AS entity_type, tp.venue_id AS entity_id, count(*)::BIGINT AS weight, count(DISTINCT tp.trip_id)::BIGINT AS trips_count
      FROM public.trip_places tp JOIN peers ON peers.trip_id = tp.trip_id
     WHERE tp.venue_id IS NOT NULL AND tp.venue_id NOT IN (SELECT venue_id FROM my_places WHERE venue_id IS NOT NULL)
     GROUP BY tp.venue_id
    UNION ALL
    SELECT 'event'::TEXT, tp.event_id, count(*)::BIGINT, count(DISTINCT tp.trip_id)::BIGINT
      FROM public.trip_places tp JOIN peers ON peers.trip_id = tp.trip_id
     WHERE tp.event_id IS NOT NULL AND tp.event_id NOT IN (SELECT event_id FROM my_places WHERE event_id IS NOT NULL)
     GROUP BY tp.event_id
    UNION ALL
    SELECT 'hotel'::TEXT, tp.hotel_id, count(*)::BIGINT, count(DISTINCT tp.trip_id)::BIGINT
      FROM public.trip_places tp JOIN peers ON peers.trip_id = tp.trip_id
     WHERE tp.hotel_id IS NOT NULL AND tp.hotel_id NOT IN (SELECT hotel_id FROM my_places WHERE hotel_id IS NOT NULL)
     GROUP BY tp.hotel_id)
  SELECT entity_type, entity_id, weight, trips_count FROM agg ORDER BY weight DESC, trips_count DESC LIMIT p_limit;
$function$;

-- Body unchanged; it already gates on can_edit_trip(). Only search_path is added.
alter function public.assign_days_to_destination(uuid, date, date) set search_path to 'public';
alter function public.insert_event_reminder_notifications() set search_path to 'public';

do $$
declare v_unset integer;
begin
  select count(*) into v_unset
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');

  if v_unset > 0 then
    raise exception '% SECURITY DEFINER function(s) in public still have a mutable search_path', v_unset;
  end if;

  -- The gate must actually be in the shipped bodies, not just intended.
  if position('can_view_trip' in pg_get_functiondef('public.detect_trip_gaps(uuid)'::regprocedure)) = 0
     or position('can_view_trip' in pg_get_functiondef('public.get_similar_trip_suggestions(uuid,integer)'::regprocedure)) = 0 then
    raise exception 'a trip RPC shipped without the visibility gate';
  end if;
end $$;
