-- Neartown and Montrose (Houston) are one queer village. Neartown is the
-- official super-neighborhood name for the area around Montrose; both rows sit
-- at the same point (0 m), Neartown holds 0 venues and is deindexed, Montrose
-- holds 17 venues. Found while checking the other place tables for exonym /
-- alternate-name duplicates after the city pass: countries are clean (250
-- live, one per ISO code), landmarks have no pairs (6 live), and of the 20
-- same-city village pairs within 1 km the rest are neighbouring districts
-- and are left.
--
-- Castro District and Eureka Valley (San Francisco, 50 m apart) are merged too,
-- on request: the Castro sits inside Eureka Valley and the site treats it as
-- one queer district. Castro District survives (73 venues, the name people
-- use); Eureka Valley's 40 venue rows move onto it.
--
-- West Village and Greenwich Village (New York, 242 m apart) are merged too,
-- on request: West Village is the western part of Greenwich Village.
-- Greenwich Village survives (47 venues, the longer history); West Village's
-- 23 venue rows move onto it.
--
-- Kings Cross and Darlinghurst (Sydney, ~500 m apart) are merged too, on
-- request. Darlinghurst survives (Oxford Street is there); Kings Cross's 18
-- venue rows move onto it.
-- Taylor Square (Darlinghurst, ~300 m) is merged into it as well; its 66
-- venue rows move over.
-- Reversible: _queer_village_merge_core writes an audit row. Skipped where a
-- village or its parent city has no geo_places row (partial CI snapshot): the
-- merge re-syncs the spine and would fail on the missing row.
do $$
begin
  perform set_config('app.actor', 'migration:village_neartown_montrose_merge', true);
  if exists (select 1 from public.queer_villages where id = '3bffbb78-dd35-4b2f-86f0-c8605d658165' and duplicate_of_id is null)
     and exists (select 1 from public.queer_villages where id = 'f10201bc-a6b6-4ccc-aeb6-886354926f5e' and duplicate_of_id is null)
     and not exists (
       select 1 from public.queer_villages q
        where q.id in ('3bffbb78-dd35-4b2f-86f0-c8605d658165', 'f10201bc-a6b6-4ccc-aeb6-886354926f5e')
          and (not exists (select 1 from public.geo_places g where g.id = q.city_id)
               or not exists (select 1 from public.geo_places g where g.id = q.id))) then
    perform public._queer_village_merge_core(
      'f10201bc-a6b6-4ccc-aeb6-886354926f5e', '3bffbb78-dd35-4b2f-86f0-c8605d658165', null);
  else
    raise notice 'Neartown/Montrose not both live with spine parents here; skipping';
  end if;
end $$;

do $$
begin
  perform set_config('app.actor', 'migration:village_castro_eureka_merge', true);
  if exists (select 1 from public.queer_villages where id = '7dde05b1-f77d-4f35-bbae-8e9597e4cff8' and duplicate_of_id is null)
     and exists (select 1 from public.queer_villages where id = '754df796-c869-430d-b949-550de60a71b3' and duplicate_of_id is null)
     and not exists (
       select 1 from public.queer_villages q
        where q.id in ('7dde05b1-f77d-4f35-bbae-8e9597e4cff8', '754df796-c869-430d-b949-550de60a71b3')
          and (not exists (select 1 from public.geo_places g where g.id = q.city_id)
               or not exists (select 1 from public.geo_places g where g.id = q.id))) then
    perform public._queer_village_merge_core(
      '754df796-c869-430d-b949-550de60a71b3', '7dde05b1-f77d-4f35-bbae-8e9597e4cff8', null);
  else
    raise notice 'Castro District/Eureka Valley not both live with spine parents here; skipping';
  end if;

  if exists (select 1 from public.queer_villages where id = '72a89abb-7e61-4d3b-988d-0c53f4c5c4a0' and duplicate_of_id is null)
     and exists (select 1 from public.queer_villages where id = 'd66d6332-f74d-4333-9d32-d662f4a7fa1e' and duplicate_of_id is null)
     and not exists (
       select 1 from public.queer_villages q
        where q.id in ('72a89abb-7e61-4d3b-988d-0c53f4c5c4a0', 'd66d6332-f74d-4333-9d32-d662f4a7fa1e')
          and (not exists (select 1 from public.geo_places g where g.id = q.city_id)
               or not exists (select 1 from public.geo_places g where g.id = q.id))) then
    perform set_config('app.actor', 'migration:village_west_greenwich_merge', true);
    perform public._queer_village_merge_core(
      'd66d6332-f74d-4333-9d32-d662f4a7fa1e', '72a89abb-7e61-4d3b-988d-0c53f4c5c4a0', null);
  else
    raise notice 'Greenwich Village/West Village not both live with spine parents here; skipping';
  end if;

  if exists (select 1 from public.queer_villages where id = '23d6dcb8-875e-4aa1-a3d5-bd51215fbd7d' and duplicate_of_id is null)
     and exists (select 1 from public.queer_villages where id = '1e04a9a0-bf96-497d-a140-cd60238e5c95' and duplicate_of_id is null)
     and not exists (
       select 1 from public.queer_villages q
        where q.id in ('23d6dcb8-875e-4aa1-a3d5-bd51215fbd7d', '1e04a9a0-bf96-497d-a140-cd60238e5c95')
          and (not exists (select 1 from public.geo_places g where g.id = q.city_id)
               or not exists (select 1 from public.geo_places g where g.id = q.id))) then
    perform set_config('app.actor', 'migration:village_kingscross_darlinghurst_merge', true);
    perform public._queer_village_merge_core('1e04a9a0-bf96-497d-a140-cd60238e5c95', '23d6dcb8-875e-4aa1-a3d5-bd51215fbd7d', null);
  else
    raise notice 'Darlinghurst/Kings Cross not both live with spine parents here; skipping';
  end if;

  if exists (select 1 from public.queer_villages where id = 'b21485a6-96f6-4b42-abc0-cd77cc4534c0' and duplicate_of_id is null)
     and exists (select 1 from public.queer_villages where id = '1e04a9a0-bf96-497d-a140-cd60238e5c95' and duplicate_of_id is null)
     and not exists (
       select 1 from public.queer_villages q
        where q.id in ('b21485a6-96f6-4b42-abc0-cd77cc4534c0', '1e04a9a0-bf96-497d-a140-cd60238e5c95')
          and (not exists (select 1 from public.geo_places g where g.id = q.city_id)
               or not exists (select 1 from public.geo_places g where g.id = q.id))) then
    perform set_config('app.actor', 'migration:village_taylor_square_darlinghurst_merge', true);
    perform public._queer_village_merge_core('1e04a9a0-bf96-497d-a140-cd60238e5c95', 'b21485a6-96f6-4b42-abc0-cd77cc4534c0', null);
  else
    raise notice 'Darlinghurst/Taylor Square not both live with spine parents here; skipping';
  end if;

  if exists (select 1 from public.venues v join public.queer_villages q on q.id = v.queer_village_id
              where q.id in ('7dde05b1-f77d-4f35-bbae-8e9597e4cff8', '3bffbb78-dd35-4b2f-86f0-c8605d658165',
                             '72a89abb-7e61-4d3b-988d-0c53f4c5c4a0', '23d6dcb8-875e-4aa1-a3d5-bd51215fbd7d',
                             'b21485a6-96f6-4b42-abc0-cd77cc4534c0')
                and q.duplicate_of_id is not null and v.duplicate_of_id is null) then
    raise exception 'venues left on a merged village';
  end if;
end $$;
