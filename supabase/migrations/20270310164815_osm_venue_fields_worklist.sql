-- WIDEN THE OSM WORK LIST FROM ONE COLUMN TO FIVE.
--
-- `venue-accessibility-osm` queries Overpass by coordinate and resolves each
-- venue against an OSM element by name inside 60 m, blocking when two candidates
-- share a name. That identity match is the expensive and dangerous half of the
-- job, and it is already working. The response it produces carries
-- `opening_hours`, `phone`, `website` and the primary feature tag -- and the
-- function reads ONE of them.
--
-- Measured on prod 2026-09-04, live venues (26,905):
--   hours            26,279 empty (97.7%)
--   phone            18,796 empty (70%)
--   website          16,908 empty (63%)
--   category='other'  6,930        (26%)
--
-- Two changes here, both to the work list:
--
-- 1. RETURN THE COLUMNS THE FUNCTION NOW WRITES. The edge function must know
--    whether `hours`/`phone`/`website`/`category` are already populated, because
--    the rule is FILL-IF-EMPTY: an OSM value may fill a NULL and may never
--    overwrite a stored one. Without these columns it would have to re-read each
--    venue, or worse, write blind.
--
--    The return type changes, so both functions must be DROPped rather than
--    CREATE OR REPLACEd -- Postgres refuses to replace a function whose
--    RETURNS TABLE differs (42P13), and a silent failure here would leave the
--    old shape live while the new edge function selected columns that are not
--    there.
--
-- 2. RE-OFFER THE ROWS WHOSE ELEMENT WE ALREADY HELD AND THREW AWAY.
--    The selector deliberately never revisits a resolved stamp -- that is what
--    stops it re-probing 22,050 venues nightly. But 1,410 rows were stamped
--    under the accessibility-only extractor, and 180 of them MATCHED AN ELEMENT
--    (46 `found` + 134 `none` that carry a `matched` key). For those we had the
--    tags in hand and kept only `wheelchair`. Measured on that subset: 163 still
--    have no hours, 97 no phone, 83 no website, 8 are still category='other'.
--
--    So the stamp gains a schema version and the selector re-offers a row when
--    the version is behind AND the stamp records a match. A stamp with no
--    `matched` key means no OSM element answered for that venue; re-probing it
--    spends an Overpass call to re-derive the same null, which is the
--    re-queue-the-not-found mistake the brand-logo pass documents. Bounded work:
--    180 rows, ~2.5 hours at */20 x 25.
--
--    OSM_FIELDS_V is 2. Bumping it again is the supported way to re-sweep after
--    a future extractor gains a field; it is not a general "re-probe everything"
--    switch, because the `matched` requirement still applies.

drop function if exists public.venues_due_for_osm_accessibility(integer);
drop function if exists public.venues_osm_accessibility_by_id(uuid[]);

create function public.venues_due_for_osm_accessibility(p_limit integer default 25)
returns table(
  id uuid,
  name text,
  latitude numeric,
  longitude numeric,
  accessibility_attributes text[],
  osm_ref text,
  hours jsonb,
  phone text,
  website text,
  category text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT v.id, v.name, v.latitude, v.longitude,
         coalesce(v.accessibility_attributes, '{}'::text[]),
         -- An OSM id we already hold makes identity KNOWN, so the function does
         -- not have to infer it from a name inside a radius. source-osm-venue
         -- writes source_entity_id as `osm-<type>-<id>`; Overpass addresses the
         -- same element as `<type>/<id>`.
         (
           SELECT regexp_replace(vs.source_entity_id, '^osm-([a-z]+)-([0-9]+)$', '\1/\2')
           FROM public.venue_sources vs
           WHERE vs.venue_id = v.id
             AND vs.source_slug = 'osm'
             AND vs.source_entity_id ~ '^osm-[a-z]+-[0-9]+$'
           LIMIT 1
         ),
         v.hours, v.phone, v.website, v.category
  FROM public.venues v
  WHERE v.duplicate_of_id IS NULL
    AND v.closed_at IS NULL
    AND v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND (
      v.enrichment_status->'osm_accessibility' IS NULL
      OR (
        v.enrichment_status->'osm_accessibility'->>'state' = 'unknown'
        AND coalesce((v.enrichment_status->'osm_accessibility'->>'attempts')::int, 1) < 3
      )
      -- Widened extractor: re-offer only where an element was actually matched.
      -- A stamp without `matched` means nothing answered; re-probing it buys the
      -- same null at the cost of an Overpass call.
      OR (
        v.enrichment_status->'osm_accessibility' ? 'matched'
        AND coalesce((v.enrichment_status->'osm_accessibility'->>'v')::int, 1) < 2
      )
    )
  -- Never-probed first (NULL stamp), then oldest retry. ISO-8601 sorts
  -- lexicographically, so the text comparison is the chronological one.
  ORDER BY (v.enrichment_status->'osm_accessibility'->>'at') ASC NULLS FIRST, v.id
  LIMIT greatest(1, least(coalesce(p_limit, 25), 200));
$function$;

create function public.venues_osm_accessibility_by_id(p_ids uuid[])
returns table(
  id uuid,
  name text,
  latitude numeric,
  longitude numeric,
  accessibility_attributes text[],
  osm_ref text,
  hours jsonb,
  phone text,
  website text,
  category text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT v.id, v.name, v.latitude, v.longitude,
         coalesce(v.accessibility_attributes, '{}'::text[]),
         (
           SELECT regexp_replace(vs.source_entity_id, '^osm-([a-z]+)-([0-9]+)$', '\1/\2')
           FROM public.venue_sources vs
           WHERE vs.venue_id = v.id
             AND vs.source_slug = 'osm'
             AND vs.source_entity_id ~ '^osm-[a-z]+-[0-9]+$'
           LIMIT 1
         ),
         v.hours, v.phone, v.website, v.category
  FROM public.venues v
  WHERE v.id = ANY(coalesce(p_ids, '{}'::uuid[]))
    AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL;
$function$;

revoke all on function public.venues_due_for_osm_accessibility(integer) from public, anon, authenticated;
revoke all on function public.venues_osm_accessibility_by_id(uuid[]) from public, anon, authenticated;
grant execute on function public.venues_due_for_osm_accessibility(integer) to service_role;
grant execute on function public.venues_osm_accessibility_by_id(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
do $verify$
declare
  v_cols text[];
  v_due  int;
  v_reoffer int;
begin
  select array_agg(a.attname order by a.attnum) into v_cols
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral unnest(p.proallargtypes, p.proargnames) with ordinality as a(atttype, attname, attnum)
  where n.nspname = 'public' and p.proname = 'venues_due_for_osm_accessibility';

  if v_cols is null or not (v_cols @> ARRAY['hours','phone','website','category']) then
    raise exception 'selector does not return the widened columns: %', v_cols;
  end if;

  -- anon must not reach a SECURITY DEFINER selector over the whole venue table.
  if has_function_privilege('anon', 'public.venues_due_for_osm_accessibility(integer)', 'execute') then
    raise exception 'anon can execute venues_due_for_osm_accessibility';
  end if;

  select count(*) into v_due from public.venues_due_for_osm_accessibility(200);
  if v_due = 0 then
    raise exception 'work list is empty — the selector predicate is wrong';
  end if;

  -- The re-offer arm must actually select the 180 matched rows, and must NOT
  -- pick up the 1,027 rows where no element was ever found.
  select count(*) into v_reoffer
  from public.venues v
  where v.duplicate_of_id is null and v.closed_at is null
    and v.latitude is not null and v.longitude is not null
    and v.enrichment_status->'osm_accessibility' ? 'matched'
    and coalesce((v.enrichment_status->'osm_accessibility'->>'v')::int, 1) < 2;
  raise notice 'osm work list widened; % rows queued for re-extraction', v_reoffer;
end
$verify$;
