-- `geo_hygiene_stats()` gains the one quantity an e2e test has been trying to
-- assert since it was written, and could never reach.
--
-- WHAT WAS BROKEN, AND IT WAS BROKEN TWICE OVER. `e2e/geo-boundaries.spec.ts`
-- carried a test named "every country holding content has boundary geometry"
-- which did:
--
--     const stats = await rpc('geo_hygiene_stats');
--     expect(Number(stats.boundary_countries)).toBeGreaterThan(200);
--     expect(Number(stats.countries_without_geometry)).toBe(0);
--
-- Both problems were invisible because the file opened with
-- `test.skip(!ANON_KEY, ...)` and no workflow sets that variable, so all eight
-- of its tests skipped on every CI run and none was ever reported:
--
--   1. WRONG ROLE. `20270816143714` REVOKES `geo_hygiene_stats` from `anon` and
--      grants it only to `authenticated` and `service_role`. From an anon spec
--      it returns HTTP 401. #3967 removed the blanket skip and this surfaced
--      immediately.
--   2. WRONG KEYS, which is the part that makes "just run it as authenticated"
--      the wrong fix. **The function returns NEITHER key.** Measured on prod its
--      output is boundary_rows, boundary_cells, boundary_iso_codes, containment,
--      containment_total, city_coord_defects, city_coord_defects_with_content,
--      integrity_violations, address_queue, findings_age_hours — and nothing
--      called `boundary_countries` or `countries_without_geometry`.
--      `Number(undefined)` is NaN, `NaN > 200` is false and `expect(NaN).toBe(0)`
--      fails, so the assertion would have failed on a correct corpus in any role.
--
-- So the invariant was never measured anywhere. This migration measures it.
--
-- THE INVARIANT, AND WHY IT IS WORTH A KEY. A country holding venues or events
-- must have either its own boundary polygon or a derived sovereign parent. If it
-- has neither, `geo_country_at` resolves nothing for coordinates inside it and
-- **every row under that country is reported as a containment mismatch that is
-- not one** — the false-positive class `geo_country_parent` exists to kill, and
-- the class that made the pre-boundary centroid detector rank Honolulu, Réunion,
-- Guam and Bonaire above a genuinely mis-filed Concord. A silent regression here
-- does not look like missing geometry; it looks like a sudden pile of
-- coordinate defects that are all correct.
--
-- Measured on prod before writing this: **191 countries hold content, 0 lack
-- both.** A true zero-invariant today, which is what makes it safe to gate on
-- rather than baseline.
--
-- `countries_holding_content` is returned alongside it and is NOT decoration:
-- `countries_without_geometry = 0` is equally true of a corpus with no content
-- at all, so the denominator is what separates "clean" from "measuring nothing" —
-- the same reason `tag_merge_graph_signals` reports `merges_total` first.
--
-- COST: 3.9 ms, 1,989 buffers, index-only scans throughout (measured with
-- EXPLAIN ANALYZE on prod). The `exists` form matters — a `count(*)` per country
-- would be two sequential scans of `venues` and `events` per row. This function
-- is called over PostgREST, where `authenticator` pins `statement_timeout` to 8s.
--
-- CREATE OR REPLACE forces the whole body to be restated, which is a
-- transcription risk on a function this size, so the verify block asserts
-- BEHAVIOUR — every pre-existing key still present — rather than trusting that
-- the copy was faithful. The grants are re-applied explicitly for the same
-- reason: if a replace ever reset them, `anon` would gain execute on a SECURITY
-- DEFINER aggregate, which is the definer-leak class this repo gates on, so the
-- postcondition asserts anon has none.
--
-- Guarded by src/lib/__tests__/geoHygieneCountriesWithoutGeometry.test.ts.

create or replace function public.geo_hygiene_stats()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    -- The authority itself. Zero here means every other number below is a lie.
    'boundary_rows', (select count(*) from public.geo_boundaries where boundary_kind = 'country'),
    'boundary_cells', (select count(*) from public.geo_boundary_cells),
    'boundary_iso_codes', (
      select count(distinct iso_a2) from public.geo_boundaries
       where boundary_kind = 'country' and iso_a2 is not null
    ),

    -- Countries that actually carry content, and those of them the containment
    -- resolver cannot place. A country holding venues or events with neither its
    -- own polygon nor a derived sovereign parent makes EVERY row under it report
    -- as a mismatch that is not one. The denominator is reported because a zero
    -- numerator is equally true of a corpus with no content at all.
    'countries_holding_content', (
      select count(*) from public.countries c
       where exists (select 1 from public.venues v where v.country_id = c.id)
          or exists (select 1 from public.events e where e.country_id = c.id)
    ),
    'countries_without_geometry', (
      select count(*) from public.countries c
       where (exists (select 1 from public.venues v where v.country_id = c.id)
           or exists (select 1 from public.events e where e.country_id = c.id))
         and not exists (
           select 1 from public.geo_boundaries b
            where b.boundary_kind = 'country' and b.iso_a2 = c.code
         )
         and not exists (
           select 1 from public.geo_country_parent p where p.child_code = c.code
         )
    ),

    -- Entities whose coordinate contradicts their country, by class and table.
    -- Read from the materialised findings so the sentinel and the admin panel
    -- cannot measure different sets.
    'containment', coalesce((
      select jsonb_object_agg(k, n) from (
        select violation_class || ':' || entity_type as k, count(*) as n
          from public.geo_containment_findings
         group by 1
      ) s
    ), '{}'::jsonb),
    'containment_total', (select count(*) from public.geo_containment_findings),

    -- Root causes. A bad city centroid poisons every entity linked to it, and
    -- centroid-based detectors are blind to it because they measure distance TO
    -- that centroid. km_to_land > 5 excludes coastline generalisation, which was
    -- 125 of 131 rows when measured.
    'city_coord_defects', (
      select count(*) from public.geo_city_coord_findings
       where violation_class = 'country_mismatch' or coalesce(km_to_land, 0) > 5
    ),
    'city_coord_defects_with_content', (
      select count(*) from public.geo_city_coord_findings
       where (violation_class = 'country_mismatch' or coalesce(km_to_land, 0) > 5)
         and coalesce(venues, 0) + coalesce(events, 0) > 0
    ),

    -- Relational contradictions: city_id's country vs the row's own country_id.
    'integrity_violations', coalesce((
      select jsonb_object_agg(violation, n) from (
        select violation, count(*) n from public.geo_integrity_violations group by 1
      ) s
    ), '{}'::jsonb),

    -- The postal queue. Depth alone is not health: a shallow queue whose head is
    -- six months old is stalled, and that is exactly what the admin panel could
    -- not show because it never rendered oldest_enqueued_at.
    'address_queue', jsonb_build_object(
      'depth', (select count(*) from public.geo_address_queue),
      'parked', (select count(*) from public.geo_address_queue where attempts >= 4),
      'oldest_hours', (
        select round(extract(epoch from (now() - min(enqueued_at))) / 3600)::int
          from public.geo_address_queue
      ),
      'entity_types', coalesce((
        select jsonb_object_agg(entity_type, n) from (
          select entity_type, count(*) n from public.geo_address_queue group by 1
        ) s
      ), '{}'::jsonb)
    ),

    -- Staleness of the findings themselves. A sweep that stopped running leaves
    -- yesterday's counts looking healthy forever.
    'findings_age_hours', (
      select round(extract(epoch from (now() - max(detected_at))) / 3600)::int
        from public.geo_containment_findings
    )
  );
$function$;

-- Re-applied rather than assumed. CREATE OR REPLACE does preserve privileges,
-- but this is a SECURITY DEFINER aggregate over the whole geo corpus and the
-- cost of being wrong is anon execute, so the grant is restated to exactly what
-- 20270816143714 established and then asserted below.
revoke all on function public.geo_hygiene_stats() from public, anon;
grant execute on function public.geo_hygiene_stats() to authenticated, service_role;

do $verify$
declare
  v_stats   jsonb;
  v_missing text;
  v_holding int;
  v_without int;
  v_anon    int;
begin
  select public.geo_hygiene_stats() into v_stats;

  -- 1. BEHAVIOURAL, not textual: every key that existed before this replace must
  --    still be there. CREATE OR REPLACE restates a 70-line body, and a dropped
  --    key would silently blind whichever branch of check-pipeline-health reads
  --    it rather than failing loudly.
  select string_agg(k, ', ') into v_missing
    from unnest(array[
      'boundary_rows','boundary_cells','boundary_iso_codes',
      'containment','containment_total',
      'city_coord_defects','city_coord_defects_with_content',
      'integrity_violations','address_queue','findings_age_hours'
    ]) k
   where not (v_stats ? k);
  if v_missing is not null then
    raise exception 'geo hygiene: the restatement LOST pre-existing key(s): %', v_missing;
  end if;

  -- 2. Both new keys are present.
  if not (v_stats ? 'countries_without_geometry') or not (v_stats ? 'countries_holding_content') then
    raise exception 'geo hygiene: the new keys are missing from the output';
  end if;

  -- 3. The denominator is real. A zero numerator over an empty corpus is not a
  --    clean corpus, and this is what tells the two apart.
  v_holding := (v_stats->>'countries_holding_content')::int;
  if v_holding < 150 then
    raise exception 'geo hygiene: only % countries hold content - the numerator below would be measuring almost nothing', v_holding;
  end if;

  -- 4. The invariant itself, measured at 0 on prod before this was written.
  --    Gated rather than baselined precisely because it is a true zero today.
  v_without := (v_stats->>'countries_without_geometry')::int;
  if v_without <> 0 then
    raise exception 'geo hygiene: % country/countries hold content with neither their own polygon nor a derived parent - every row under them will be reported as a containment mismatch that is not one', v_without;
  end if;

  -- 5. anon must still have NO execute. A SECURITY DEFINER aggregate granted
  --    broadly is granted to every visitor.
  select count(*) into v_anon
    from aclexplode((select proacl from pg_proc
                      where oid = 'public.geo_hygiene_stats()'::regprocedure)) a
    join pg_roles r on r.oid = a.grantee
   where r.rolname in ('anon','public') and a.privilege_type = 'EXECUTE';
  if v_anon <> 0 then
    raise exception 'geo hygiene: anon/public holds EXECUTE on geo_hygiene_stats - definer leak';
  end if;

  raise notice 'geo hygiene OK: % countries hold content, % without geometry or parent, all pre-existing keys intact, anon has no execute',
    v_holding, v_without;
end
$verify$;
