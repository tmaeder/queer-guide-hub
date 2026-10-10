-- Heldenbar (Sihlquai 240, Zürich) was filed under Winterthur, which hid a live duplicate.
--
-- `heldenbar` (dfb1cd1f, slug heldenbar-6) is the canonical row: seven sources
-- (spartacus, patroc, google, foursquare, gayout, display-magazin) and five rows
-- already merged into it. Its address, every source and its coordinates
-- (47.3876 / 8.5301, 1.5 km from Zürich's centre, 19 km from Winterthur) all
-- say Sihlquai 240, 8005 Zürich, but city_id points at Winterthur and the
-- postal code reads 8401 (a Winterthur code).
--
-- Because the two rows sat in different cities, neither the dedup sweep nor
-- the Zürich address audit paired it with `helden` (cba37a74), a second LIVE
-- row for the same bar at the same address, ~30 m away.
--
-- Fix: re-file heldenbar to Zürich (city_id, city text, postal code), then
-- merge `helden` into it through _venue_merge_core (audited, reversible). The
-- merge core copies no fields; helden carries nothing heldenbar lacks.
--
-- Soft on preconditions (a moved row is skipped with a NOTICE), hard on the
-- defect.

select set_config('app.actor', 'migration:99991791318782_heldenbar_zuerich_city_fix', true);

do $hb$
declare
  c_zuerich    constant uuid := '35d1d772-8ce7-4c05-92a5-95ea7053b4bf';
  v_heldenbar  constant uuid := 'dfb1cd1f-a381-450c-900b-e21a37db3366';
  v_helden     constant uuid := 'cba37a74-7de7-4ccb-82f2-0c09291a6e23';
begin
  update public.venues
     set city_id = c_zuerich, city = 'Zürich', postal_code = '8005', updated_at = now()
   where id = v_heldenbar
     and duplicate_of_id is null
     and city_id is distinct from c_zuerich
     and address ilike 'Sihlquai 240%';
  if not found then
    raise notice 'heldenbar: not re-filed (already Zürich, merged, or address changed)';
  end if;

  if exists (select 1 from public.venues k, public.venues d
              where k.id = v_heldenbar and d.id = v_helden
                and k.duplicate_of_id is null and d.duplicate_of_id is null
                and k.closed_at is null and d.closed_at is null
                and k.city_id = c_zuerich and d.city_id = c_zuerich) then
    perform public._venue_merge_core(v_heldenbar, v_helden, null);
  else
    raise notice 'helden: not merged (already merged, closed, or a row moved)';
  end if;
end
$hb$;

do $verify$
declare
  v_bad int;
begin
  -- P1: heldenbar is no longer filed under Winterthur while its address is Zürich.
  select count(*) into v_bad
    from public.venues v
    join public.cities c on c.id = v.city_id
   where v.id = 'dfb1cd1f-a381-450c-900b-e21a37db3366'
     and v.address ilike 'Sihlquai 240%'
     and c.name = 'Winterthur';
  if v_bad <> 0 then
    raise exception 'P1 failed: heldenbar still filed under Winterthur';
  end if;

  -- P2: heldenbar and helden are not both live in the same city.
  select count(*) into v_bad
    from public.venues a, public.venues b
   where a.id = 'dfb1cd1f-a381-450c-900b-e21a37db3366'
     and b.id = 'cba37a74-7de7-4ccb-82f2-0c09291a6e23'
     and a.duplicate_of_id is null and b.duplicate_of_id is null
     and a.closed_at is null and b.closed_at is null
     and a.city_id = b.city_id;
  if v_bad <> 0 then
    raise exception 'P2 failed: heldenbar and helden still live side by side';
  end if;

  -- P3: if merged, the merge is reversible.
  select count(*) into v_bad
    from public.venues d
   where d.id = 'cba37a74-7de7-4ccb-82f2-0c09291a6e23'
     and d.duplicate_of_id = 'dfb1cd1f-a381-450c-900b-e21a37db3366'
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = d.id and a.keep_id = d.duplicate_of_id
                        and a.undone_at is null and a.details ->> 'schema' = '1');
  if v_bad <> 0 then
    raise exception 'P3 failed: helden merge has no reversible audit row';
  end if;
end
$verify$;
