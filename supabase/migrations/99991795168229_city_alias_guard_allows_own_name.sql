-- trg_city_alias_reject_collision (99991795161280) skipped any alias equal to
-- another live city's name in the same country. That also skipped a city's
-- alias of its OWN name whenever a namesake exists in another region
-- (Bristol RI / Bristol TN, Camden NJ / Camden AR): 136 live cities, all such
-- region twins, ended up with no alias at all.
--
-- An alias equal to the row's own canonical key is always correct, and the
-- resolver's alias arm already sends same-name candidates through
-- city_region_pick. So the guard now only rejects an alias whose key differs
-- from the city's own key, which is what the health check's
-- colliding_aliases count measures too.
create or replace function public.city_alias_reject_collision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_country uuid;
  v_own_key text;
  v_key text := public.city_canonical_key(new.alias);
begin
  select country_id, canonical_key into v_country, v_own_key
    from public.cities where id = new.city_id;
  if v_key is not distinct from v_own_key then
    return new;
  end if;
  if exists (
    select 1 from public.cities b
     where b.country_id = v_country and b.id <> new.city_id
       and b.duplicate_of_id is null
       and b.canonical_key = v_key
  ) then
    return null;
  end if;
  return new;
end $fn$;

revoke all on function public.city_alias_reject_collision() from public, anon, authenticated;

insert into public.city_aliases (city_id, alias, locale)
select c.id, v.alias, v.locale
  from public.cities c
  join public.geo_city_profiles g on g.place_id = c.id
  cross join lateral (values (c.name, null::text), (c.name_local, c.name_local_lang)) v(alias, locale)
 where c.duplicate_of_id is null
   and nullif(btrim(v.alias), '') is not null
   and length(public.city_canonical_key(v.alias)) >= 2
on conflict (city_id, alias_key) do nothing;

do $$
declare v jsonb; v_none int;
begin
  v := public.city_name_twin_signals();
  if (v->>'colliding_aliases')::int <> 0 then
    raise exception 'colliding city aliases after own-name backfill: %', v->>'colliding_aliases';
  end if;
  select count(*) into v_none
    from public.cities c join public.geo_city_profiles g on g.place_id = c.id
   where c.duplicate_of_id is null
     and not exists (select 1 from public.city_aliases a where a.city_id = c.id);
  if v_none <> 0 then
    raise exception '% live cities still have no alias', v_none;
  end if;
end $$;
