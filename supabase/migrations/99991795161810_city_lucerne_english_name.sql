-- Lucerne: the live row (Q4191, slug luzern) carries the German endonym as
-- its name, against the rule that cities.name is English and name_local the
-- endonym. It could not simply be renamed: the merged-away "Lucerne" row
-- (same country, same region CH-LU) still holds that name, and
-- idx_cities_name_country_unique has no duplicate_of_id filter.
--
-- So the merged row is renamed first. It is a redirect only (tmp- slug, no
-- page), so nothing public changes there. The live row's slug is untouched;
-- /city/luzern keeps working, and trg_zz_city_alias_sync keeps "Luzern" as an
-- alias so a source asking for Luzern still resolves to it.
do $$
begin
  perform set_config('app.actor', 'migration:city_lucerne_english_name', true);

  update public.cities set name = 'Lucerne (merged)'
   where id = '1c601bda-d1b3-4d2d-bdcc-ce6765c2a78e'
     and duplicate_of_id is not null and name = 'Lucerne';

  update public.cities set name = 'Lucerne', name_local = 'Luzern', name_local_lang = 'de'
   where id = 'f2c45fec-5a35-43c2-920d-9d6580527e8c'
     and duplicate_of_id is null and name = 'Luzern';

  if exists (select 1 from public.cities where id = 'f2c45fec-5a35-43c2-920d-9d6580527e8c')
     and not exists (select 1 from public.cities
                      where id = 'f2c45fec-5a35-43c2-920d-9d6580527e8c' and name = 'Lucerne') then
    raise exception 'Lucerne rename did not land';
  end if;
end $$;
