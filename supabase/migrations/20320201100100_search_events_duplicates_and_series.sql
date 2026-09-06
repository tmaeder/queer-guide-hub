-- search_events(): stop serving merged-away duplicates, and collapse recurring
-- series in the browse feed.
--
-- Rebased BYTE-EXACTLY on the live definition (last written by the RPC's own
-- migration; read back with pg_get_functiondef before editing) with exactly two
-- conditions added. Everything else — the accent-insensitive city match, the
-- overlap-aware date window, the ordering, the venue join, the `total` envelope —
-- is unchanged.
--
-- CHANGE 1: `AND e.duplicate_of_id IS NULL`. This RPC filtered `status = 'active'`
-- and nothing else, so **598 upcoming events that had been merged into another
-- row were still being served**. useEvents.tsx's OTHER path — the direct
-- PostgREST query — has always had `.is('duplicate_of_id', null)`, so the two
-- code paths for the same feed disagreed, and which one you got depended on
-- whether a city filter was active. The effect is that the entire event dedup
-- engine's output was invisible on the city-filtered feed: every pair it merged
-- kept showing both sides. This is the same divergence class as search_facets vs
-- search_hybrid — two readers of one corpus, one of them missing a filter.
--
-- A merged row is not merely redundant here: `_event_merge_core` reparents its
-- children and points its slug at the survivor, so what was being served was a
-- husk that redirects on click.
--
-- CHANGE 2: `AND (e.series_next OR ...)`. Collapses a recurring series to its next
-- occurrence — see 20320201100000 for why the series is grouped rather than
-- merged (per-date descriptions and per-date ticket URLs make a merge lossy).
--
-- The collapse is DERIVED from parameters this function already takes rather than
-- added as a new one, deliberately: PostgREST resolves overloads by argument name
-- and answers a mismatch with a silent PGRST202 404, so a new parameter would
-- mean dropping and recreating the signature and updating every caller. The
-- condition it needs — "the reader did not ask for particular dates" — is exactly
-- `p_start IS NULL AND p_end IS NULL AND NOT p_include_past`, all of which are
-- already in scope.
--
-- Collapsing ONLY in that undifferentiated case is the load-bearing half. When a
-- reader asks for a date range they want the occurrences inside it; hiding all
-- but one would silently drop dates they explicitly asked to see. `p_include_past`
-- is coalesced to false to match how the existing CASE treats a NULL.

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
      -- CHANGE 1: a merged duplicate is a husk whose slug redirects to the
      -- survivor. The sibling PostgREST path has always excluded these.
      AND e.duplicate_of_id IS NULL
      -- CHANGE 2: one card per recurring series, but only when the caller did
      -- not ask for specific dates or for past events.
      AND (e.series_next
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
  v_dupes   bigint;
  v_browse  bigint;
  v_ranged  bigint;
begin
  -- A merged duplicate must no longer be reachable. The limit is deliberately far
  -- above the corpus size: `p_limit => 1000` would check only the first page and
  -- report clean while duplicates sat past the cut.
  select count(*) into v_dupes
  from public.search_events(p_limit => 1000000) s
  join public.events e on e.id = (s.event->>'id')::uuid
  where e.duplicate_of_id is not null;

  if v_dupes > 0 then
    raise exception 'search_events still returns % merged duplicate(s)', v_dupes;
  end if;

  -- The collapse must actually collapse...
  select total into v_browse from public.search_events(p_limit => 1) limit 1;
  -- ...and must NOT collapse once the reader asks for a date window. Positive
  -- control: without this, a function that hid everything would pass the check
  -- above by returning nothing at all.
  select total into v_ranged
  from public.search_events(p_start => now(), p_end => now() + interval '400 days', p_limit => 1)
  limit 1;

  -- A NULL total means the function returned no rows at all, and `v_ranged <=
  -- v_browse` would then be NULL — no exception, a silent pass on a corpus that
  -- proves nothing. Absence of evidence is not evidence of correctness.
  if v_browse is null or v_ranged is null then
    raise exception 'search_events: returned no rows — the collapse cannot be verified against an empty result';
  end if;

  if v_ranged <= v_browse then
    raise exception
      'search_events: date-ranged result (%) is not larger than the collapsed browse result (%) — the collapse is either inert or leaking into the ranged path',
      v_ranged, v_browse;
  end if;

  raise notice 'search_events: browse total %, date-ranged total % (series expanded), 0 merged duplicates served', v_browse, v_ranged;
end
$verify$;
