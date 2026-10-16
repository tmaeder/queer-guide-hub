-- Nine same-name city groups contained a member with no region_code, which
-- venue_city_text_signals().same_name_cities_without_region treats as a
-- zero-invariant: same-name cities in one country are told apart by region_code
-- alone, so an uncoded member is matched by EVERY region hint. That is the
-- Portland-ME-into-Portland-OR shape waiting to happen, one column earlier.
--
-- Every uncoded member was created 2026-10-09 -> 10-13 by `nominatim-geocode` or
-- `photon-location` -- the same city-creation burst behind three other open
-- check-pipeline-health findings -- and all nine carry coordinates.
--
-- WHY THE POLYGON FILL COULD NOT DO THIS. run_city_region_polygon_fill has
-- already VISITED all nine (city_region_polygon_signals().unvisited_with_coords
-- is 0), so they were never going to self-heal. From their own
-- enrichment_status->'region_polygon': `humacao` was filled US-PR and then
-- rejected (not a PR code); `ponce`/`yabucoa` refused `other_country` on the same
-- US-PR answer; `augusta`, `davenport-2`, `milton-2` and `parroquia-catedral-1`
-- refused `ambiguous_border`; `charleston-1` and `jamestown-1` found `no_polygon`.
--
-- Two causes. (a) Puerto Rico is a COUNTRY-MODEL MISMATCH: Natural Earth encodes
-- PR as the US admin-1 `US-PR`, while `countries` holds PR separately with `PR-*`
-- subdivisions, so the polygon's answer is unusable and `other_country` correctly
-- refused it. (b) The six others sit on a state border, a coast or an island,
-- where point-in-polygon is exactly as good as the coastline's precision.
--
-- `ambiguous_border` IS NOT LOOSENED, and Davenport is why. The polygon answers
-- `US-IL` for 41.491/-90.622, mid-Mississippi; the place is Davenport, IOWA, and
-- its one venue is "Credit Island, Davenport" -- an island in the Iowa city. Had
-- the guard been widened to trust a near-border polygon, that row would have been
-- filed Illinois with no human in the loop. The guard earns its 743 refusals;
-- this file goes around it with better evidence rather than weakening it.
--
-- THE SECOND SIGNAL IS THE VENUES' OWN `state` TEXT, written by a different
-- producer than the polygon and than the city row. It agrees with the coordinates
-- on all nine, supplies an answer where the polygon had none, and corrects the
-- polygon on Davenport:
--
--   slug                  venue state    coords resolve to          polygon
--   humacao               Puerto Rico    18.152/-65.819             US-PR
--   ponce                 Puerto Rico    17.993/-66.611             US-PR
--   yabucoa               Puerto Rico    18.047/-65.874             US-PR
--   augusta               Kentucky       38.776/-83.997 Ohio R.     US-KY  agree
--   charleston-1          Oregon         43.344/-124.324 coast      none
--   davenport-2           Iowa           41.491/-90.622 Miss. R.    US-IL  WRONG
--   jamestown-1           Rhode Island   41.457/-71.399 island      none
--   milton-2              New Hampshire  43.464/-70.991 NH/ME       US-NH  agree
--   parroquia-catedral-1  Bolívar        8.141/-63.552 Orinoco      VE-F   agree
--
-- i.e. the standing rule -- never resolve by one signal, require a second, block
-- when they disagree -- with the disagreement resolved in favour of the producer
-- that names a street address rather than a pixel.
--
-- THE CODES ARE JOINED OUT OF `geo_subdivisions`, NEVER TYPED HERE. A first draft
-- read `VE-B` for Bolívar off the state NAME; that is Anzoátegui, and Bolívar is
-- `VE-F`. Guessing an identifier from a label is how `Hessen` and `Teheran`
-- happened. The PR codes look inconsistent (`PR-069`, `PR-PO`, `PR-151`) and all
-- three are nonetheless what this vocabulary holds -- the table is authoritative,
-- not the shape of the string. The join also means an unknown code cannot be
-- written: the row would not match, which postcondition 1 then catches.
--
-- THE NINE SPLIT INTO TWO REMEDIES, AND THE UNIQUE INDEX IS WHAT PROVED IT.
-- Coding all nine fails with 23505 on `idx_cities_name_country_unique`
-- (lower(name), country_id, coalesce(region_code,'')): the PR trio's coded
-- siblings ALREADY hold (humacao, PR, PR-069) and so on. The index is stating
-- that those pairs are the SAME PLACE -- each `tmp-%` twin is a
-- `personality-birth-place` placeholder sitting 0.6-2 km from the real row with 0
-- venues, from the documented 1,832-row junk cohort. The same place cannot hold
-- one code twice, so their remedy is a MERGE and only the other six are coded.
--
--   part A  code 6 rows whose coded siblings hold a DIFFERENT code
--   part B  merge 3 PR placeholder twins into the real row that has the venues
--
-- Part B keeps the row with content and drops the placeholder, which removes the
-- GROUP (a one-member group is not a group) and takes the invariant to 0.
--
-- KNOWN AND DELIBERATE: the three survivors keep region_code NULL. The merge's
-- own field-transfer policy does not cover that column (measured: survivor code
-- still NULL after each merge), and `idx_cities_name_country_unique` is NOT
-- partial, so the merged-away twin keeps its (name, country, code) slot forever
-- and the survivor can never take it. They join the advisory
-- `real_without_region_code` backlog, which only warns. Clearing a dead twin's
-- identifier to free the slot would buy a cosmetic code at the cost of
-- unmerge fidelity, and is refused here.
--
-- Guarded on region_code IS NULL / on the twin still being a live duplicate, so a
-- row a human or a later pass has already handled is left alone.

-- part A -- the six
do $code$
declare v_updated int;
begin
  with want (slug, code) as (
    values
      ('augusta',              'US-KY'),
      ('charleston-1',         'US-OR'),
      ('davenport-2',          'US-IA'),
      ('jamestown-1',          'US-RI'),
      ('milton-2',             'US-NH'),
      ('parroquia-catedral-1', 'VE-F')
  )
  update public.cities c
     set region_code = s.code,
         region_name = s.name,
         enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('region_code_manual', jsonb_build_object(
                'at', now(),
                'by', 'migration:99991792173929',
                'code', s.code,
                'evidence', 'venue state text + coordinates; polygon refused '
                            || coalesce(c.enrichment_status->'region_polygon'->>'state', 'unknown')))
    from want w
    join public.geo_subdivisions s on s.code = w.code
   where c.slug = w.slug
     and c.duplicate_of_id is null
     and c.region_code is null;

  get diagnostics v_updated = row_count;
  raise notice 'part A: region_code filled on % of 6 row(s)', v_updated;
end $code$;

-- part B -- the three PR duplicates
do $merge$
declare r record; v_merged int := 0;
begin
  for r in
    select real.id as keep_id, tmp.id as drop_id, real.slug as keep_slug
      from public.cities real
      join public.cities tmp
        on tmp.country_id = real.country_id
       and lower(tmp.name) = lower(real.name)
       and tmp.duplicate_of_id is null
       and tmp.slug like 'tmp-%'
     where real.slug in ('humacao', 'ponce', 'yabucoa')
       and real.duplicate_of_id is null
  loop
    -- same country, so cross-country confirmation is not claimed
    perform public.merge_cities(r.keep_id, r.drop_id, false);
    v_merged := v_merged + 1;
    raise notice 'part B: merged placeholder into %', r.keep_slug;
  end loop;
  raise notice 'part B: % of 3 merge(s)', v_merged;
end $merge$;

do $verify$
declare
  v_bad int; v_names int; v_live int; v_gate int;
begin
  -- 1. The REACHED state for part A, asserted positively. Counting rows in a BAD
  -- state instead returns zero for a slug that has gone missing entirely.
  with want (slug, code) as (
    values ('augusta','US-KY'), ('charleston-1','US-OR'), ('davenport-2','US-IA'),
           ('jamestown-1','US-RI'), ('milton-2','US-NH'), ('parroquia-catedral-1','VE-F')
  )
  select count(*) into v_bad
    from want w
    join public.cities c on c.slug = w.slug and c.duplicate_of_id is null
   where c.region_code is distinct from w.code;
  if v_bad <> 0 then
    raise exception 'part A: % of 6 cities do not carry the intended region_code', v_bad;
  end if;

  -- 2. Code and name must agree -- the NAME is what every region hint matches on,
  -- so a filled code beside a stale name is the half-written state this removes.
  with want (slug) as (
    values ('augusta'), ('charleston-1'), ('davenport-2'),
           ('jamestown-1'), ('milton-2'), ('parroquia-catedral-1')
  )
  select count(*) into v_names
    from want w
    join public.cities c on c.slug = w.slug and c.duplicate_of_id is null
    join public.geo_subdivisions s on s.code = c.region_code
   where c.region_name is distinct from s.name;
  if v_names <> 0 then
    raise exception 'part A: % city(ies) carry a region_name that disagrees with their code', v_names;
  end if;

  -- 3. Part B must have REMOVED the duplicate twins, and must have kept the row
  -- that holds the venues -- a merge in the wrong direction also empties the group
  -- and would satisfy a count-only check while hiding the content.
  select count(*) into v_live
    from public.cities real
    join public.cities tmp
      on tmp.country_id = real.country_id and lower(tmp.name) = lower(real.name)
     and tmp.duplicate_of_id is null and tmp.slug like 'tmp-%'
   where real.slug in ('humacao','ponce','yabucoa') and real.duplicate_of_id is null;
  if v_live <> 0 then
    raise exception 'part B: % PR placeholder twin(s) are still live duplicates', v_live;
  end if;

  select count(*) into v_live
    from public.cities c
   where c.slug in ('humacao','ponce','yabucoa')
     and c.duplicate_of_id is null
     and exists (select 1 from public.venues v where v.city_id = c.id and v.duplicate_of_id is null);
  if v_live <> 3 then
    raise exception 'part B: only % of 3 PR survivors still hold venues -- a merge '
                    'went the wrong way', v_live;
  end if;

  -- 4. The gate is REPORTED, never asserted. It is corpus-wide and the producer
  -- that minted these nine is still live, so a group created between authoring
  -- this file and CI applying it would abort `db push` and take every migration
  -- queued behind it -- punishing the repo for a row this file never claimed.
  -- Soft on what it does not own; hard on what it does.
  select (public.venue_city_text_signals()->>'same_name_cities_without_region')::int
    into v_gate;
  if v_gate = 0 then
    raise notice 'same_name_cities_without_region: 0 — invariant clean';
  else
    raise notice 'same_name_cities_without_region: % — group(s) remain that this file '
                 'did not name; nominatim-geocode / photon-location still mint '
                 'uncoded cities and sealing that is a separate change', v_gate;
  end if;
end $verify$;
