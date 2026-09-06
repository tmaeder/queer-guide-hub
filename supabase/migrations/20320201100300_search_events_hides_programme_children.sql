-- search_events(): a festival's programme children stop publishing as separate
-- cards in the browse feed.
--
-- Rebased BYTE-EXACTLY on 20320201100100 with ONE clause changed. Everything else
-- — the duplicate exclusion, the accent-insensitive city match, the overlap-aware
-- date window, the ordering, the venue join, the `total` envelope — is untouched.
--
-- The two collapse rules are merged into a single condition rather than added as a
-- second parallel one, because they are the same rule about the same thing: a row
-- that is a REPEAT (a series occurrence) or a PART (a festival day) is represented
-- in the browse feed by something else, and both must expand under exactly the
-- same circumstances. Two separate clauses drift; one cannot.
--
--   (e.series_next AND e.parent_event_id IS NULL)   -- the representative row
--   OR <the reader asked for particular dates>      -- so show every occurrence
--
-- WHY HIDING A CHILD DOES NOT ORPHAN IT UNDER SAFETY GATING. The obvious worry is
-- a child whose parent is safety_gated: RLS hides the parent from an anonymous
-- reader, and this clause would then hide the child too, so a visible event
-- vanishes. It cannot happen. `safety_gated` is derived by set_entity_safety_gated()
-- from country_id / city_id, and run_event_programme_link() only ever links a child
-- to a parent in the SAME city_id — so parent and child always carry the same
-- gating and are hidden or shown together.

CREATE OR REPLACE FUNCTION public.search_events(
  p_city text DEFAULT NULL::text,
  p_event_type text DEFAULT NULL::text,
  p_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_tags text[] DEFAULT NULL::text[],
  p_accessibility_attributes text[] DEFAULT NULL::text[],
  p_target_groups text[] DEFAULT NULL::text[],
  p_search text DEFAULT NULL::text,
  p_include_past boolean DEFAULT false,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0)
 RETURNS TABLE(total bigint, event jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH filtered AS (
    SELECT e.*
    FROM public.events e
    WHERE e.status = 'active'
      AND e.duplicate_of_id IS NULL
      -- One card per real-world thing: hide a series repeat and a festival
      -- day-part, but only when the caller did not ask for particular dates.
      AND ((e.series_next AND e.parent_event_id IS NULL)
           OR COALESCE(p_include_past, false)
           OR p_start IS NOT NULL
           OR p_end IS NOT NULL)
      AND (CASE WHEN p_include_past THEN e.start_date <= now()
                ELSE COALESCE(e.end_date, e.start_date) >= now() END)
      AND (p_city IS NULL
           OR public.immutable_unaccent(lower(e.city))
              ILIKE '%' || public.immutable_unaccent(lower(p_city)) || '%')
      AND (p_event_type IS NULL OR e.event_type = p_event_type)
      AND (p_end   IS NULL OR e.start_date                       <= p_end)
      AND (p_start IS NULL OR COALESCE(e.end_date, e.start_date) >= p_start)
      AND (p_tags IS NULL OR e.tags && p_tags)
      AND (p_accessibility_attributes IS NULL OR e.accessibility_attributes && p_accessibility_attributes)
      AND (p_target_groups IS NULL OR e.target_groups && p_target_groups)
      AND (p_search IS NULL
           OR e.title ILIKE '%' || p_search || '%'
           OR e.description ILIKE '%' || p_search || '%')
  ),
  counted AS (SELECT count(*)::BIGINT AS total FROM filtered),
  paged AS (
    SELECT f.* FROM filtered f
    ORDER BY f.is_featured DESC,
             CASE WHEN p_include_past THEN f.start_date END DESC,
             CASE WHEN NOT p_include_past THEN f.start_date END ASC
    LIMIT  GREATEST(COALESCE(p_limit, 24), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT
    (SELECT total FROM counted) AS total,
    to_jsonb(p) || jsonb_build_object(
      'venues',
      CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v.id, 'name', v.name, 'address', v.address, 'city', v.city,
        'state', v.state, 'country', v.country, 'phone', v.phone,
        'website', v.website, 'email', v.email) END
    ) AS event
  FROM paged p
  LEFT JOIN public.venues v ON v.id = p.venue_id;
$function$;

do $verify$
declare
  v_children bigint;
  v_browse   bigint;
  v_ranged   bigint;
begin
  -- No programme child may appear in the collapsed browse feed.
  select count(*) into v_children
  from public.search_events(p_limit => 1000000) s
  join public.events e on e.id = (s.event->>'id')::uuid
  where e.parent_event_id is not null;

  if v_children > 0 then
    raise exception 'search_events still returns % programme child/children in the browse feed', v_children;
  end if;

  select total into v_browse from public.search_events(p_limit => 1) limit 1;
  select total into v_ranged
  from public.search_events(p_start => now(), p_end => now() + interval '400 days', p_limit => 1)
  limit 1;

  -- A NULL total means no rows at all, and the comparison below would be NULL —
  -- no exception, a silent pass on a corpus that proves nothing.
  if v_browse is null or v_ranged is null then
    raise exception 'search_events: returned no rows — the collapse cannot be verified against an empty result';
  end if;

  -- Positive control: "zero children in the feed" also passes on a function that
  -- returns nothing, and on a corpus where nothing was ever linked.
  if v_ranged <= v_browse then
    raise exception
      'search_events: date-ranged result (%) is not larger than the collapsed browse result (%) — the collapse is inert or leaking into the ranged path',
      v_ranged, v_browse;
  end if;

  raise notice 'search_events: browse %, date-ranged %, 0 programme children in browse', v_browse, v_ranged;
end
$verify$;
