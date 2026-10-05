-- cities: the region becomes part of a city's identity.
--
-- WHY
-- public.cities could hold at most ONE row per (name, country): three unique
-- keys enforced it — idx_cities_name_country_unique (lower(name), country_id),
-- cities_country_canonical_key_uniq (country_id, canonical_key) and
-- uk_cities_country_name_active (country_id, name_normalized). So Portland,
-- Maine and Portland, Oregon could not both exist, and every event or venue
-- in the missing one was either linked to the wrong city (116 events in
-- 20260802090844) or left unlinked and blocked. cities.region_code (ISO
-- 3166-2, 99991790994947) now exists; this migration puts it into the key.
--
-- WHAT THIS DOES
-- 1. Recreates the three unique keys with coalesce(region_code, '') in them,
--    under the SAME names (scripts and comments refer to them by name).
--    cities_country_canonical_key_uniq was a CONSTRAINT; it becomes a unique
--    INDEX because a constraint cannot carry an expression. Nothing targets it
--    with ON CONFLICT ON CONSTRAINT (checked against every live function).
--
-- 2. city_region_pick(ids, region_code, lat, lng, allow_twin) — the one rule
--    for choosing among same-name cities in one country:
--      * one candidate, no region given            -> that city
--      * several candidates, no region given       -> AMBIGUOUS (never the
--        biggest: population was how Springfield MO became Springfield VT)
--      * a candidate with the given region         -> that city
--      * else one candidate with NO region code    -> that city (an uncoded
--        row is compatible, not contradicting)
--      * else every candidate is in another region -> a TWIN may be created,
--        but only with corroboration (allow_twin): an admin actor, or the
--        caller's coordinates are > 50 km from every candidate and every
--        candidate has coordinates. Without it, a single candidate is still
--        returned. venues.state is near-random on this corpus (99991789823216),
--        so a region hint alone must never mint a second city.
--    Today there is at most one row per (name, country), so for every
--    existing input this returns exactly what the old lookups returned —
--    except that a corroborated hint can now create a twin.
--
-- 3. city_resolve_or_create: name arms (canonical_key, lower(name),
--    name_normalized, alias) go through city_region_pick. New refusal
--    reason 'ambiguous_region'. Signature unchanged.
--
-- 4. city_pick_in_country(country, name, region_hint, exclude_tmp) for the
--    lookup-only paths, and the three population-DESC tie-breaks that
--    picked a same-country city by name are routed through it:
--    commit_venue_staging_item (arms a + b), commit_event_staging_item and
--    resolve_city_and_country. They are PATCHED via pg_get_functiondef with
--    exact-text replacement that RAISEs when the text is not found once —
--    never restated, because their live bodies differ from every repo file.
--
-- NOT DONE, NAMED
-- * The cross-country fallbacks in commit_event/venue_staging_item and
--   resolve_city_and_country (no country -> any city of that name, biggest
--   first) are untouched. They predate this and are their own defect.
-- * Creating the blocked twins (Portland ME, Charleston SC, ...) and the
--   "City, Region · Country" label are the next change.
-- * ~1,700 cities still have no region_code; city-region-backfill fills
--   them. An uncoded row is compatible with any hint, so the gap degrades
--   to the old behaviour, never to a wrong twin.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. Unique keys
-- ---------------------------------------------------------------------------
drop index if exists public.idx_cities_name_country_unique;
create unique index idx_cities_name_country_unique
  on public.cities (lower(name), country_id, coalesce(region_code, ''));

alter table public.cities drop constraint if exists cities_country_canonical_key_uniq;
drop index if exists public.cities_country_canonical_key_uniq;
create unique index cities_country_canonical_key_uniq
  on public.cities (country_id, coalesce(region_code, ''), canonical_key);

drop index if exists public.uk_cities_country_name_active;
create unique index uk_cities_country_name_active
  on public.cities (country_id, coalesce(region_code, ''), name_normalized)
  where duplicate_of_id is null;

-- ---------------------------------------------------------------------------
-- 2. The pick rule
-- ---------------------------------------------------------------------------
create or replace function public.city_region_pick(
  p_ids         uuid[],
  p_region_code text,
  p_lat         numeric default null,
  p_lng         numeric default null,
  p_allow_twin  boolean default false
) returns table (city_id uuid, outcome text)
language plpgsql
stable
set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_n        int;
  v_one      uuid;
  v_exact_n  int;
  v_exact    uuid;
  v_unc_n    int;
  v_unc      uuid;
  v_far      boolean;
begin
  select count(*), (array_agg(s.id))[1]
    into v_n, v_one
    from (select distinct unnest(p_ids) as id) x
    join public.cities s on s.id = x.id;

  if coalesce(v_n, 0) = 0 then
    return query select null::uuid, 'none'::text; return;
  end if;

  if p_region_code is null then
    if v_n = 1 then
      return query select v_one, 'match'::text;
    else
      return query select null::uuid, 'ambiguous'::text;
    end if;
    return;
  end if;

  select count(*) filter (where s.region_code = p_region_code),
         (array_agg(s.id) filter (where s.region_code = p_region_code))[1],
         count(*) filter (where s.region_code is null),
         (array_agg(s.id) filter (where s.region_code is null))[1]
    into v_exact_n, v_exact, v_unc_n, v_unc
    from (select distinct unnest(p_ids) as id) x
    join public.cities s on s.id = x.id;

  if v_exact_n = 1 then
    return query select v_exact, 'match'::text; return;
  elsif v_exact_n > 1 then
    return query select null::uuid, 'ambiguous'::text; return;
  end if;

  if v_unc_n = 1 then
    return query select v_unc, 'match'::text; return;
  elsif v_unc_n > 1 then
    return query select null::uuid, 'ambiguous'::text; return;
  end if;

  -- Every candidate sits in a different, known region.
  if p_allow_twin then
    return query select null::uuid, 'twin'::text; return;
  end if;

  if p_lat is not null and p_lng is not null then
    select bool_and(s.latitude is not null and s.longitude is not null
                    and public.haversine_m(p_lat, p_lng, s.latitude, s.longitude) > 50000)
      into v_far
      from (select distinct unnest(p_ids) as id) x
      join public.cities s on s.id = x.id;
    if coalesce(v_far, false) then
      return query select null::uuid, 'twin'::text; return;
    end if;
  end if;

  if v_n = 1 then
    return query select v_one, 'match'::text;
  else
    return query select null::uuid, 'ambiguous'::text;
  end if;
end;
$fn$;

revoke all on function public.city_region_pick(uuid[], text, numeric, numeric, boolean) from public, anon, authenticated;
grant execute on function public.city_region_pick(uuid[], text, numeric, numeric, boolean) to service_role;

comment on function public.city_region_pick(uuid[], text, numeric, numeric, boolean) is
  'Chooses among same-name cities in one country by region_code. Never breaks a tie by population. outcome: match | none | ambiguous | twin (a new city in another region may be created). See 99991791231955.';

-- ---------------------------------------------------------------------------
-- 4a. Lookup-only helper
-- ---------------------------------------------------------------------------
create or replace function public.city_pick_in_country(
  p_country_id  uuid,
  p_name        text,
  p_region_hint text default null,
  p_exclude_tmp boolean default true
) returns uuid
language plpgsql
stable
set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_name text := nullif(btrim(p_name), '');
  v_ids  uuid[];
  v_code text;
  v_hit  uuid;
  v_out  text;
begin
  if v_name is null or p_country_id is null then
    return null;
  end if;

  select array_agg(c.id) into v_ids
    from public.cities c
   where c.country_id = p_country_id
     and c.duplicate_of_id is null
     and (not p_exclude_tmp or c.slug is null or c.slug not like 'tmp-%')
     and (lower(c.name) = lower(v_name)
          or c.canonical_key = public.city_canonical_key(v_name));

  if v_ids is null then
    return null;
  end if;

  if nullif(btrim(p_region_hint), '') is not null then
    select public.resolve_region_code(co.code, p_region_hint) into v_code
      from public.countries co where co.id = p_country_id;
  end if;

  -- No twin creation from a lookup: a 'twin' outcome falls back to the
  -- single-candidate answer, i.e. exactly the old behaviour.
  select r.city_id, r.outcome into v_hit, v_out
    from public.city_region_pick(v_ids, v_code, null, null, false) r;
  return v_hit;
end;
$fn$;

revoke all on function public.city_pick_in_country(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.city_pick_in_country(uuid, text, text, boolean) to service_role;

comment on function public.city_pick_in_country(uuid, text, text, boolean) is
  'Same-country city lookup by name (lower(name) or canonical_key), disambiguated by region hint via city_region_pick. NULL when ambiguous. Replaces ORDER BY population DESC tie-breaks. See 99991791231955.';

-- ---------------------------------------------------------------------------
-- 3. city_resolve_or_create — name arms go through city_region_pick
-- ---------------------------------------------------------------------------
create or replace function public.city_resolve_or_create(
  p_name text,
  p_country_id uuid default null,
  p_country_code text default null,
  p_region_hint text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_wikidata_qid text default null,
  p_source_slug text default 'unknown',
  p_source_entity_id text default null,
  p_allow_create boolean default true,
  p_actor text default 'resolver',
  p_requester text default null,
  p_requester_ref uuid default null,
  p_postal_code text default null
)
returns table(city_id uuid, action text, match_type text, confidence numeric, reason text, candidates jsonb)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
DECLARE
  v_split       record;
  v_base        text;
  v_region      text;
  v_region_code text;
  v_country_id  uuid := p_country_id;
  v_country_cc  text;
  v_key         text;
  v_nn          text;
  v_lock        bigint;
  v_hit         uuid;
  v_mt          text;
  v_conf        numeric;
  v_cands       jsonb;
  v_cand_count  int := 0;
  v_new_id      uuid;
  v_has_evidence boolean;
  v_postal      text;
  v_postal_hit  uuid;
  v_postal_n    int := 0;
  v_ids         uuid[];
  v_out         text;
  v_twin        boolean := false;
  v_admin       boolean := (p_actor = 'admin');
BEGIN
  p_name := nullif(btrim(p_name), '');
  IF p_name IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'empty_name', NULL::jsonb; RETURN;
  END IF;

  IF v_country_id IS NULL AND nullif(btrim(p_country_code),'') IS NOT NULL THEN
    SELECT c.id INTO v_country_id FROM public.countries c
     WHERE c.code = upper(btrim(p_country_code)) AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  IF v_country_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'no_country', NULL::jsonb; RETURN;
  END IF;
  SELECT c.code INTO v_country_cc FROM public.countries c WHERE c.id = v_country_id;

  v_base   := p_name;
  v_region := nullif(btrim(p_region_hint), '');
  IF position(',' IN p_name) > 0 THEN
    SELECT * INTO v_split FROM public.geo_split_place_name(p_name);
    IF v_split.did_split THEN
      IF v_split.country_id IS NOT NULL AND v_split.country_id <> v_country_id THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'country_contradiction',
          jsonb_build_object('stated_country', v_split.country_id, 'given_country', v_country_id);
        RETURN;
      END IF;
      v_base := v_split.base;
      IF v_region IS NULL AND v_split.qualifier_kind <> 'ambiguous' THEN
        v_region := v_split.region_name;
      END IF;
    END IF;
  END IF;

  -- The region as a code. Unresolvable hint text is NOT an error: it simply
  -- carries no identity, and an uncoded hint behaves exactly as before.
  IF v_region IS NOT NULL THEN
    v_region_code := public.resolve_region_code(v_country_cc, v_region);
  END IF;

  v_key := public.city_canonical_key(v_base);
  v_nn  := public.normalize_name(v_base);

  v_lock := hashtextextended(v_country_id::text || '|' || v_nn, 0);
  PERFORM pg_advisory_xact_lock(v_lock);

  -- (a) QID. Deliberately NOT scoped to the country or region.
  IF v_hit IS NULL AND nullif(btrim(p_wikidata_qid),'') IS NOT NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.wikidata_qid = btrim(p_wikidata_qid) LIMIT 1;
    IF v_hit IS NOT NULL THEN
      v_mt := 'qid'; v_conf := 1.0;
      IF NOT EXISTS (SELECT 1 FROM public.cities c WHERE c.id = v_hit AND c.country_id = v_country_id) THEN
        RETURN QUERY SELECT v_hit, 'matched', v_mt, v_conf, 'qid_country_mismatch', NULL::jsonb; RETURN;
      END IF;
    END IF;
  END IF;

  -- (b) The source's own id for this city.
  IF v_hit IS NULL AND nullif(btrim(p_source_entity_id),'') IS NOT NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit
      FROM public.geo_sources gs JOIN public.cities c ON c.id = gs.city_id
     WHERE gs.entity_type = 'city' AND gs.source_slug = p_source_slug
       AND gs.source_entity_id = btrim(p_source_entity_id) LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'source_key'; v_conf := 0.99; END IF;
  END IF;

  -- (c)-(f) Name arms. Each collects EVERY same-name survivor in the country
  -- and lets city_region_pick decide; LIMIT 1 here is what used to let the
  -- planner choose between Portland, Maine and Portland, Oregon.

  -- (c) canonical key (TOTAL, merged rows included)
  IF v_hit IS NULL AND NOT v_twin THEN
    SELECT array_agg(DISTINCT coalesce(c.duplicate_of_id, c.id)) INTO v_ids FROM public.cities c
     WHERE c.country_id = v_country_id AND c.canonical_key = v_key;
    IF v_ids IS NOT NULL THEN
      SELECT r.city_id, r.outcome INTO v_hit, v_out
        FROM public.city_region_pick(v_ids, v_region_code, p_lat, p_lng, v_admin) r;
      IF v_out = 'ambiguous' THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'canonical_key', 0::numeric, 'ambiguous_region',
          (SELECT jsonb_agg(jsonb_build_object('city_id', s.id, 'name', s.name, 'region_code', s.region_code))
             FROM public.cities s WHERE s.id = ANY (v_ids));
        RETURN;
      END IF;
      v_twin := (v_out = 'twin');
      IF v_hit IS NOT NULL THEN v_mt := 'canonical_key'; v_conf := 0.99; END IF;
    END IF;
  END IF;

  -- (d) lower(name)
  IF v_hit IS NULL AND NOT v_twin THEN
    SELECT array_agg(DISTINCT coalesce(c.duplicate_of_id, c.id)) INTO v_ids FROM public.cities c
     WHERE c.country_id = v_country_id AND lower(c.name) = lower(v_base);
    IF v_ids IS NOT NULL THEN
      SELECT r.city_id, r.outcome INTO v_hit, v_out
        FROM public.city_region_pick(v_ids, v_region_code, p_lat, p_lng, v_admin) r;
      IF v_out = 'ambiguous' THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'name_country', 0::numeric, 'ambiguous_region',
          (SELECT jsonb_agg(jsonb_build_object('city_id', s.id, 'name', s.name, 'region_code', s.region_code))
             FROM public.cities s WHERE s.id = ANY (v_ids));
        RETURN;
      END IF;
      v_twin := (v_out = 'twin');
      IF v_hit IS NOT NULL THEN v_mt := 'name_country'; v_conf := 0.98; END IF;
    END IF;
  END IF;

  -- (e) name_normalized, only when it is a real key (non-Latin scripts
  -- normalize to '' and must never match each other).
  IF v_hit IS NULL AND NOT v_twin AND length(v_nn) >= 3 THEN
    SELECT array_agg(DISTINCT coalesce(c.duplicate_of_id, c.id)) INTO v_ids FROM public.cities c
     WHERE c.country_id = v_country_id AND c.name_normalized = v_nn;
    IF v_ids IS NOT NULL THEN
      SELECT r.city_id, r.outcome INTO v_hit, v_out
        FROM public.city_region_pick(v_ids, v_region_code, p_lat, p_lng, v_admin) r;
      IF v_out = 'ambiguous' THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'name_normalized', 0::numeric, 'ambiguous_region',
          (SELECT jsonb_agg(jsonb_build_object('city_id', s.id, 'name', s.name, 'region_code', s.region_code))
             FROM public.cities s WHERE s.id = ANY (v_ids));
        RETURN;
      END IF;
      v_twin := (v_out = 'twin');
      IF v_hit IS NOT NULL THEN v_mt := 'name_normalized'; v_conf := 0.98; END IF;
    END IF;
  END IF;

  -- (f) Alias (exonyms: Kapstadt -> Cape Town).
  IF v_hit IS NULL AND NOT v_twin AND length(v_key) >= 3 THEN
    SELECT array_agg(DISTINCT coalesce(c.duplicate_of_id, c.id)) INTO v_ids
      FROM public.city_aliases a JOIN public.cities c ON c.id = a.city_id
     WHERE a.alias_key = v_key AND c.country_id = v_country_id;
    IF v_ids IS NOT NULL THEN
      SELECT r.city_id, r.outcome INTO v_hit, v_out
        FROM public.city_region_pick(v_ids, v_region_code, p_lat, p_lng, v_admin) r;
      IF v_out = 'ambiguous' THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'alias', 0::numeric, 'ambiguous_region',
          (SELECT jsonb_agg(jsonb_build_object('city_id', s.id, 'name', s.name, 'region_code', s.region_code))
             FROM public.cities s WHERE s.id = ANY (v_ids));
        RETURN;
      END IF;
      v_twin := (v_out = 'twin');
      IF v_hit IS NOT NULL THEN v_mt := 'alias'; v_conf := 0.95; END IF;
    END IF;
  END IF;

  -- (g) Postal code, opt-in; exactly one city must claim it.
  v_postal := nullif(btrim(p_postal_code), '');
  IF v_postal IS NOT NULL THEN
    SELECT count(DISTINCT coalesce(c.duplicate_of_id, c.id)),
           (array_agg(DISTINCT coalesce(c.duplicate_of_id, c.id)))[1]
      INTO v_postal_n, v_postal_hit
      FROM public.cities c
     WHERE c.country_id = v_country_id
       AND c.postal_codes @> ARRAY[v_postal];

    IF v_hit IS NOT NULL AND v_postal_n = 1 AND v_postal_hit IS DISTINCT FROM v_hit THEN
      RETURN QUERY SELECT NULL::uuid, 'refused', 'postal_conflict', 0::numeric,
        'name_and_postal_disagree',
        jsonb_build_object('by_name', v_hit, 'by_postal', v_postal_hit, 'postal_code', v_postal);
      RETURN;
    END IF;

    IF v_hit IS NULL AND v_postal_n = 1 THEN
      v_hit := v_postal_hit; v_mt := 'postal_code'; v_conf := 0.95;
    END IF;
  END IF;

  IF v_hit IS NOT NULL THEN
    RETURN QUERY SELECT v_hit, 'matched', v_mt, v_conf, NULL::text, NULL::jsonb; RETURN;
  END IF;

  -- No identity hit. Refuse near a different city (< 2 km).
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
             'city_id', x.id, 'name', x.name, 'distance_m', round(x.dm)::int,
             'wikidata_qid', x.wikidata_qid)), count(*)
      INTO v_cands, v_cand_count
      FROM (
        SELECT c.id, c.name, c.wikidata_qid,
               public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) AS dm
          FROM public.cities c
         WHERE c.country_id = v_country_id AND c.duplicate_of_id IS NULL
           AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
           AND abs(c.latitude - p_lat) < 0.03 AND abs(c.longitude - p_lng) < 0.05
           AND public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) < 2000
           AND NOT (c.wikidata_qid IS NOT NULL AND nullif(btrim(p_wikidata_qid),'') IS NOT NULL
                    AND c.wikidata_qid <> btrim(p_wikidata_qid))
         ORDER BY dm LIMIT 5
      ) x;
  END IF;

  IF v_cand_count > 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'geo_proximity', 0.85::numeric, 'ambiguous', v_cands;
    RETURN;
  END IF;

  IF NOT p_allow_create THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'create_not_allowed', NULL::jsonb; RETURN;
  END IF;

  v_has_evidence := (p_lat IS NOT NULL AND p_lng IS NOT NULL)
                 OR nullif(btrim(p_wikidata_qid),'') IS NOT NULL
                 OR nullif(btrim(p_source_entity_id),'') IS NOT NULL
                 OR p_actor = 'admin';

  IF NOT v_has_evidence THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'insufficient_evidence', NULL::jsonb; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.cities
      (name, country_id, region_name, latitude, longitude, wikidata_qid,
       data_source, last_synced_at, last_refreshed_at, created_at, updated_at,
       field_provenance)
    VALUES
      (v_base, v_country_id, v_region, p_lat, p_lng, nullif(btrim(p_wikidata_qid),''),
       p_source_slug, now(), now(), now(), now(),
       jsonb_build_object('city_resolve', jsonb_build_object(
         'action', CASE WHEN v_twin THEN 'created_region_twin' ELSE 'created' END,
         'source', p_source_slug, 'actor', p_actor, 'at', now())))
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    -- Someone won the race, or the split trigger rewrote the name into one
    -- that already exists. Re-probe in the SAME region, still under the lock.
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND c.canonical_key = v_key
       AND coalesce(c.region_code, '') = coalesce(v_region_code, '') LIMIT 1;
    IF v_hit IS NULL THEN
      SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
       WHERE c.country_id = v_country_id AND lower(c.name) = lower(v_base)
         AND coalesce(c.region_code, '') = coalesce(v_region_code, '') LIMIT 1;
    END IF;
    IF v_hit IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'unique_violation_unresolved', NULL::jsonb; RETURN;
    END IF;
    RETURN QUERY SELECT v_hit, 'raced', 'canonical_key', 0.99::numeric, NULL::text, NULL::jsonb; RETURN;
  END;

  IF nullif(btrim(p_source_entity_id),'') IS NOT NULL THEN
    INSERT INTO public.geo_sources
      (entity_type, city_id, source_slug, source_entity_id, confidence, is_primary, first_seen_at, last_seen_at)
    VALUES ('city', v_new_id, p_source_slug, btrim(p_source_entity_id), 1.0, true, now(), now())
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET last_seen_at = now();
  END IF;

  RETURN QUERY SELECT v_new_id, 'created',
    CASE WHEN v_twin THEN 'region_twin' ELSE 'none' END, 1.0::numeric, NULL::text, NULL::jsonb;
END; $function$;

REVOKE ALL ON FUNCTION public.city_resolve_or_create(text, uuid, text, text, numeric, numeric, text, text, text, boolean, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.city_resolve_or_create(text, uuid, text, text, numeric, numeric, text, text, text, boolean, text, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4b. Patch the population-DESC tie-breaks (exact text, must occur once)
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_def text;
  v_new text;
  v_old text;
  v_rep text;
  r     record;
begin
  for r in
    select * from (values
      -- commit_venue_staging_item, arm (a)
      ('public.commit_venue_staging_item(uuid,text)',
$o1$      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(btrim(v_loc->>'city'))
        AND c.country_id = v_country_id
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;$o1$,
$n1$      -- Same-name cities in one country are disambiguated by region, never
      -- by population (99991791231955). Covers lower(name) and canonical_key.
      v_city_id := public.city_pick_in_country(v_country_id, btrim(v_loc->>'city'), v_state, true);$n1$),
      -- commit_venue_staging_item, arm (b): folded into (a)
      ('public.commit_venue_staging_item(uuid,text)',
$o2$      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE c.country_id = v_country_id
        AND c.canonical_key = public.city_canonical_key(btrim(v_loc->>'city'))
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      LIMIT 1;$o2$,
$n2$      NULL; -- canonical_key arm folded into city_pick_in_country (99991791231955)$n2$),
      -- commit_event_staging_item, same-country arm
      ('public.commit_event_staging_item(uuid,text)',
$o3$      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(v_city)
        AND c.country_id = v_country_id
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;$o3$,
$n3$      -- Region-disambiguated, never population (99991791231955).
      v_city_id := public.city_pick_in_country(v_country_id, v_city, v_state, true);$n3$),
      -- resolve_city_and_country, same-country arm
      ('public.resolve_city_and_country(text,text)',
$o4$      SELECT ci.id, ci.name INTO v_city_id, v_city_name
      FROM cities ci
      WHERE lower(ci.name) = lower(p_city_name)
        AND ci.country_id = v_country_id
        AND ci.duplicate_of_id IS NULL
      ORDER BY ci.population DESC NULLS LAST
      LIMIT 1;$o4$,
$n4$      -- Region-disambiguated, never population (99991791231955).
      SELECT ci.id, ci.name INTO v_city_id, v_city_name
      FROM cities ci
      WHERE ci.id = public.city_pick_in_country(v_country_id, p_city_name, NULL, false);$n4$)
    ) t(fn, old_txt, new_txt)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if (length(v_def) - length(replace(v_def, r.old_txt, ''))) / length(r.old_txt) <> 1 then
      raise exception 'patch target not found exactly once in %: %', r.fn, left(r.old_txt, 80);
    end if;
    execute replace(v_def, r.old_txt, r.new_txt);
  end loop;
end
$patch$;

-- ---------------------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad   int;
  v_or    uuid;
  v_me    uuid;
  v_j     jsonb;
  v_res   jsonb := '{}'::jsonb;
begin
  -- P1: all three keys carry region_code.
  select count(*) into v_bad from pg_indexes
   where schemaname = 'public' and tablename = 'cities'
     and indexname in ('idx_cities_name_country_unique', 'cities_country_canonical_key_uniq', 'uk_cities_country_name_active')
     and indexdef ilike '%region_code%' and indexdef ilike '%unique%';
  if v_bad <> 3 then
    raise exception 'P1 failed: % of 3 unique keys carry region_code', v_bad;
  end if;

  -- P2: no population tie-break left in the same-country arms we patched.
  select count(*) into v_bad from pg_proc
   where proname in ('commit_venue_staging_item', 'commit_event_staging_item', 'resolve_city_and_country')
     and prosrc ilike '%city_pick_in_country%';
  if v_bad <> 3 then
    raise exception 'P2 failed: % of 3 functions route through city_pick_in_country', v_bad;
  end if;

  -- P3: behaviour, on live data, rolled back. Runs only while the corpus
  -- holds exactly one Portland in the US (Oregon) — the shape it tests.
  select c.id into v_or from public.cities c
   join public.countries co on co.id = c.country_id
   where co.code = 'US' and lower(c.name) = 'portland' and c.duplicate_of_id is null
     and c.region_code = 'US-OR' and c.latitude is not null;
  if v_or is null or exists (
       select 1 from public.cities c join public.countries co on co.id = c.country_id
        where co.code = 'US' and lower(c.name) = 'portland' and c.duplicate_of_id is null and c.id <> v_or) then
    raise notice 'P3 skipped: corpus no longer has exactly one US Portland (Oregon)';
    return;
  end if;

  begin
    -- unchanged single-candidate behaviour
    select to_jsonb(x) into v_j from public.city_resolve_or_create('Portland', p_country_code => 'US') x;
    v_res := v_res || jsonb_build_object('plain', v_j);
    -- hint without corroboration does NOT mint a twin
    select to_jsonb(x) into v_j from public.city_resolve_or_create('Portland', p_country_code => 'US', p_region_hint => 'Maine') x;
    v_res := v_res || jsonb_build_object('hint_only', v_j);
    -- hint + coordinates 4,000 km away mints the twin
    select to_jsonb(x) into v_j from public.city_resolve_or_create('Portland', p_country_code => 'US',
      p_region_hint => 'Maine', p_lat => 43.6591, p_lng => -70.2568, p_source_slug => 'migration-probe') x;
    v_res := v_res || jsonb_build_object('twin', v_j);
    select c.id into v_me from public.cities c join public.countries co on co.id = c.country_id
     where co.code = 'US' and lower(c.name) = 'portland' and c.region_code = 'US-ME';
    -- now two Portlands: no hint is ambiguous, hints pick
    select to_jsonb(x) into v_j from public.city_resolve_or_create('Portland', p_country_code => 'US') x;
    v_res := v_res || jsonb_build_object('after_plain', v_j);
    select to_jsonb(x) into v_j from public.city_resolve_or_create('Portland', p_country_code => 'US', p_region_hint => 'OR') x;
    v_res := v_res || jsonb_build_object('after_or', v_j);
    v_res := v_res || jsonb_build_object(
      'pick_none', public.city_pick_in_country((select id from public.countries where code = 'US'), 'Portland', null, false),
      'pick_me',   public.city_pick_in_country((select id from public.countries where code = 'US'), 'Portland', 'ME', false),
      'me_id', v_me);
    raise exception using message = '__probe_rollback__';
  exception when others then
    if sqlerrm <> '__probe_rollback__' then raise; end if;
  end;

  if (v_res #>> '{plain,city_id}')        is distinct from v_or::text
  or (v_res #>> '{hint_only,city_id}')    is distinct from v_or::text
  or (v_res #>> '{twin,action}')          is distinct from 'created'
  or (v_res #>> '{twin,match_type}')      is distinct from 'region_twin'
  or (v_res #>> '{after_plain,reason}')   is distinct from 'ambiguous_region'
  or (v_res #>> '{after_or,city_id}')     is distinct from v_or::text
  or (v_res ->> 'pick_none')              is not null
  or (v_res ->> 'me_id')                  is null
  or (v_res ->> 'pick_me')                is distinct from (v_res ->> 'me_id') then
    raise exception 'P3 failed: %', v_res;
  end if;

  -- P4: the probe left nothing behind.
  if exists (select 1 from public.cities c join public.countries co on co.id = c.country_id
              where co.code = 'US' and lower(c.name) = 'portland' and c.region_code = 'US-ME'
                and c.data_source = 'migration-probe') then
    raise exception 'P4 failed: probe city survived';
  end if;
end
$verify$;
