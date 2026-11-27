-- Cities stored under their official municipal form ("Township of Langley",
-- "Village of Cooperstown", "Borough of Wyre", "Municipio de El Hoyo").
-- These are real municipalities, so unlike the parish/district rows they stay.
-- Two problems:
--
--   1. Two had a plain-name twin for the same municipality:
--      Township of Minden Hills / Minden Hills (Ontario, 2.8 km) and
--      Borough of Rossendale / Rossendale (England, 10.9 km; there is no
--      separate town called Rossendale). The plain-name row survives (cleaner
--      slug) and takes the Wikidata QID.
--      Left apart on purpose: Town of Islip / Islip and Village of Orchard
--      Park / Orchard Park are different units (hamlet / village inside a
--      town), and Town of Farmington / Town of Florence share only a name
--      with cities 800-2,000 km away.
--   2. None carried its plain name as an alias, so a source sending
--      "Cooperstown" or "Westminster" could not resolve to the row and would
--      mint a duplicate. The plain name is added as an alias;
--      trg_city_alias_reject_collision drops it where another live city in
--      the country already has that name (Islip, Orchard Park, ...).
--      Names are not changed: "Township of Langley" and the City of Langley
--      are different municipalities.
do $$
declare
  r record; v_qid text; v_title text;
begin
  perform set_config('app.actor', 'migration:city_official_form_names', true);

  for r in
    select * from (values
      ('5cd399df-eb90-447c-82fe-512b2f89a8af'::uuid, '3d866a2c-bd1f-4ffc-827d-b07d7ede7c34'::uuid), -- Minden Hills <- Township of Minden Hills
      ('5029684b-984d-4181-a7ac-a654d6a232f7'::uuid, '8ec54be6-b07c-4520-b473-97c4d92119e9'::uuid)  -- Rossendale <- Borough of Rossendale
    ) t(keep_id, drop_id)
  loop
    if not exists (select 1 from public.cities where id = r.keep_id and duplicate_of_id is null)
       or not exists (select 1 from public.cities where id = r.drop_id and duplicate_of_id is null)
       or not exists (select 1 from public.geo_city_profiles where place_id = r.keep_id)
       or not exists (select 1 from public.geo_city_profiles where place_id = r.drop_id) then
      continue;
    end if;
    select wikidata_qid, wikipedia_title into v_qid, v_title from public.cities where id = r.drop_id;
    perform public.merge_cities(r.keep_id, r.drop_id, false);
    update public.cities
       set wikidata_qid = coalesce(wikidata_qid, v_qid),
           wikipedia_title = coalesce(wikipedia_title, v_title)
     where id = r.keep_id;
  end loop;

  insert into public.city_aliases (city_id, alias, locale)
  select c.id,
         btrim(regexp_replace(c.name, '^\s*(township|town|village|borough|city|municipality|municipio)\s+(of|de)\s+', '', 'i')),
         null
    from public.cities c
    join public.geo_city_profiles g on g.place_id = c.id
   where c.duplicate_of_id is null
     and c.name ~* '^\s*(township|town|village|borough|city|municipality|municipio)\s+(of|de)\s'
  on conflict (city_id, alias_key) do nothing;

  if exists (select 1 from public.venues v join public.cities c on c.id = v.city_id
              where v.duplicate_of_id is null and c.duplicate_of_id is not null
                and c.id in ('3d866a2c-bd1f-4ffc-827d-b07d7ede7c34', '8ec54be6-b07c-4520-b473-97c4d92119e9')) then
    raise exception 'venues left on a merged official-form row';
  end if;
end $$;
