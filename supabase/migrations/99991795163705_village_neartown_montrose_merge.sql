-- Neartown and Montrose (Houston) are one queer village. Neartown is the
-- official super-neighborhood name for the area around Montrose; both rows sit
-- at the same point (0 m), Neartown holds 0 venues and is deindexed, Montrose
-- holds 17 venues. Found while checking the other place tables for exonym /
-- alternate-name duplicates after the city pass: countries are clean (250
-- live, one per ISO code), landmarks have no pairs (6 live), and of the 20
-- same-city village pairs within 1 km the rest are neighbouring districts
-- (Kings Cross / Darlinghurst, West Village / Greenwich Village) or overlap
-- with venues on both sides (Castro District / Eureka Valley) and are left.
-- Reversible: _queer_village_merge_core writes an audit row.
do $$
begin
  perform set_config('app.actor', 'migration:village_neartown_montrose_merge', true);
  if exists (select 1 from public.queer_villages where id = '3bffbb78-dd35-4b2f-86f0-c8605d658165' and duplicate_of_id is null)
     and exists (select 1 from public.queer_villages where id = 'f10201bc-a6b6-4ccc-aeb6-886354926f5e' and duplicate_of_id is null) then
    perform public._queer_village_merge_core(
      'f10201bc-a6b6-4ccc-aeb6-886354926f5e', '3bffbb78-dd35-4b2f-86f0-c8605d658165', null);
  else
    raise notice 'Neartown/Montrose not both live here; skipping';
  end if;
end $$;
