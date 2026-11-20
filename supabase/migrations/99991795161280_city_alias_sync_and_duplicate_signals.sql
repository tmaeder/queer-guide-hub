-- Stop same-place city duplicates from being minted under a second spelling.
--
-- city_resolve_or_create already has an alias arm (f), so a source asking for
-- "Ghent" resolves to the Gent row IF that row carries "Ghent" as an alias.
-- Nothing guaranteed it did: only 11,717 of 19,191 live cities had any alias,
-- 147 had a name_local with no alias, and a rename (e.g. Gent -> Ghent in
-- 99991795160483) left the old spelling resolvable only by luck. So:
--
--   1. trg_zz_city_alias_sync: every live city's name, name_local and (on
--      rename) its previous name are kept in city_aliases. Named zz so it runs
--      AFTER trg_sync_geo_spine creates the geo_city_profiles row the alias FK
--      points at.
--   2. One-shot backfill of the same for every live city.
--   3. Five more verified same-place merges found by the alias sweep.
--   4. city_name_twin_signals(): live same-country pairs where one row's name
--      is the other's name_local. Checked by check-pipeline-health.mjs.
--
-- Alias overlap alone is NOT used to merge: measured, 181 live pairs share an
-- alias key and many are different places (Mannheim/Ludwigshafen, districts,
-- Swedish kommun vs town). The detector uses name_local, the strong signal.
--
-- Those overlaps are wrong aliases, not duplicates: 176 aliases on 174 cities
-- named a DIFFERENT live city in the same country (Brick <- Newark,
-- Carmel <- Bethlehem, Mannheim <- Ludwigshafen). The resolver matches the
-- real city by its own name first, so the alias did nothing useful and would
-- have misrouted the name the moment that city's row was missing.
--   0. trg_city_alias_reject_collision: a BEFORE INSERT/UPDATE guard on
--      city_aliases, so no writer (this trigger, city-factual-backfill's
--      Wikidata harvest, merge_cities) can store such an alias. It skips the
--      row (returns NULL) rather than raising, so batch writers keep going.
--   5. The existing 176 are deleted after the merges below.

-- 0. Collision guard ----------------------------------------------------------
create or replace function public.city_alias_reject_collision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_country uuid;
begin
  select country_id into v_country from public.cities where id = new.city_id;
  if exists (
    select 1 from public.cities b
     where b.country_id = v_country and b.id <> new.city_id
       and b.duplicate_of_id is null
       and b.canonical_key = public.city_canonical_key(new.alias)
  ) then
    return null;
  end if;
  return new;
end $fn$;

revoke all on function public.city_alias_reject_collision() from public, anon, authenticated;

drop trigger if exists trg_city_alias_reject_collision on public.city_aliases;
create trigger trg_city_alias_reject_collision
  before insert or update of alias, city_id on public.city_aliases
  for each row execute function public.city_alias_reject_collision();

-- 1. Sync trigger -----------------------------------------------------------
create or replace function public.city_alias_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
begin
  if new.duplicate_of_id is not null then
    return null;
  end if;
  if not exists (select 1 from public.geo_city_profiles where place_id = new.id) then
    return null;
  end if;

  insert into public.city_aliases (city_id, alias, locale)
  select new.id, v.alias, v.locale
    from (values
      (new.name, null::text),
      (new.name_local, new.name_local_lang),
      (case when tg_op = 'UPDATE' and old.name is distinct from new.name then old.name end, null::text)
    ) v(alias, locale)
   where nullif(btrim(v.alias), '') is not null
     and length(public.city_canonical_key(v.alias)) >= 2
  on conflict (city_id, alias_key) do nothing;
  return null;
end $fn$;

revoke all on function public.city_alias_sync() from public, anon, authenticated;

drop trigger if exists trg_zz_city_alias_sync on public.cities;
create trigger trg_zz_city_alias_sync
  after insert or update of name, name_local on public.cities
  for each row execute function public.city_alias_sync();

-- 2. Backfill -----------------------------------------------------------------
insert into public.city_aliases (city_id, alias, locale)
select c.id, v.alias, v.locale
  from public.cities c
  join public.geo_city_profiles g on g.place_id = c.id
  cross join lateral (values (c.name, null::text), (c.name_local, c.name_local_lang)) v(alias, locale)
 where c.duplicate_of_id is null
   and nullif(btrim(v.alias), '') is not null
   and length(public.city_canonical_key(v.alias)) >= 2
on conflict (city_id, alias_key) do nothing;

-- 3. More verified merges ------------------------------------------------------
-- Same Wikidata place under two spellings, same region code, < 10 km apart
-- (Djibouti: the QID row sat 65 km off in Tadjourah; Djibouti City has the
-- capital's coordinates and the venues, so it survives and takes the QID).
do $$
declare
  r record;
  v_qid text;
  v_title text;
  v_merged int := 0;
  v_skipped_n int := 0;
  v_bad int;
begin
  perform set_config('app.actor', 'migration:city_alias_sync_and_duplicate_signals', true);

  for r in
    select * from (values
      ('5a8b740e-1443-429a-836c-39978785a3a9'::uuid, '3b150c8b-0153-4c21-b3c8-7964bc989378'::uuid), -- St. Ingbert <- Sankt Ingbert
      ('a6f39209-0c29-44e9-b608-db800064bf5b'::uuid, '6e5c1cd0-12c1-4fb8-a12c-fd6932733c65'::uuid), -- Lake Worth Beach <- Lake Worth (renamed 2019)
      ('47089f85-c019-47d7-a342-47f046ac1912'::uuid, 'abb06201-e869-40ff-b259-6d844c3d929f'::uuid), -- South Tangerang <- Tangerang Selatan
      ('b42c21f2-d407-43df-8c44-4bee09592a91'::uuid, '0698ceb7-18fe-4f3b-b1fd-440175610731'::uuid), -- Immenstadt im Allgäu <- Immenstadt
      ('9d20daa6-d06b-4f06-b52f-c64c332eb29e'::uuid, '1ce4262e-9a8b-4d05-b37b-7289e864ab2e'::uuid)  -- Djibouti City <- Djibouti
    ) as t(keep_id, drop_id)
  loop
    if not exists (select 1 from public.cities where id = r.keep_id and duplicate_of_id is null)
       or not exists (select 1 from public.cities where id = r.drop_id and duplicate_of_id is null)
       or not exists (select 1 from public.geo_city_profiles where place_id = r.keep_id)
       or not exists (select 1 from public.geo_city_profiles where place_id = r.drop_id) then
      v_skipped_n := v_skipped_n + 1;
      continue;
    end if;

    select wikidata_qid, wikipedia_title into v_qid, v_title from public.cities where id = r.drop_id;
    perform public.merge_cities(r.keep_id, r.drop_id, false);
    update public.cities
       set wikidata_qid = coalesce(wikidata_qid, v_qid),
           wikipedia_title = coalesce(wikipedia_title, v_title)
     where id = r.keep_id;
    v_merged := v_merged + 1;
  end loop;

  raise notice 'alias-sweep merges: % merged, % skipped', v_merged, v_skipped_n;

  select count(*) into v_bad from public.venues v join public.cities c on c.id = v.city_id
   where c.duplicate_of_id is not null and v.duplicate_of_id is null
     and c.id in ('3b150c8b-0153-4c21-b3c8-7964bc989378','6e5c1cd0-12c1-4fb8-a12c-fd6932733c65',
                  'abb06201-e869-40ff-b259-6d844c3d929f','0698ceb7-18fe-4f3b-b1fd-440175610731',
                  '1ce4262e-9a8b-4d05-b37b-7289e864ab2e');
  if v_bad <> 0 then
    raise exception 'alias-sweep merges: % venues left on merged rows', v_bad;
  end if;
end $$;

-- 5. Delete aliases that name a different live city ---------------------------
-- Runs after the merges, so an alias whose other city was just merged away
-- (Kolmar on Colmar) is no longer a collision and survives.
do $$
declare v_n int;
begin
  delete from public.city_aliases al
   using public.cities a
   where a.id = al.city_id and a.duplicate_of_id is null
     and al.alias_key <> a.canonical_key
     and exists (select 1 from public.cities b
                  where b.country_id = a.country_id and b.id <> a.id
                    and b.duplicate_of_id is null and b.canonical_key = al.alias_key);
  get diagnostics v_n = row_count;
  raise notice 'deleted % colliding city aliases', v_n;
end $$;

-- 4. Detector -----------------------------------------------------------------
create or replace function public.city_name_twin_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
  with live as (
    select id, name, name_local, country_id, canonical_key, latitude, longitude
      from public.cities where duplicate_of_id is null
  ), loc as (
    select id, public.city_canonical_key(name_local) lk from live
     where nullif(btrim(name_local), '') is not null
  ), pairs as (
    select a.name a_name, b.name b_name, co.code cc,
           round((public.haversine_m(a.latitude, a.longitude, b.latitude, b.longitude) / 1000)::numeric, 1) km
      from loc l
      join live b on b.id = l.id
      join live a on a.country_id = b.country_id and a.id <> b.id
                 and a.canonical_key = l.lk and a.canonical_key <> b.canonical_key
      join public.countries co on co.id = a.country_id
  )
  select jsonb_build_object(
    'probe_ok', true,
    'live_cities', (select count(*) from live),
    'pairs', (select count(*) from pairs),
    'colliding_aliases', (
      select count(*) from public.city_aliases al
        join live a on a.id = al.city_id
       where al.alias_key <> a.canonical_key
         and exists (select 1 from live b where b.country_id = a.country_id
                       and b.id <> a.id and b.canonical_key = al.alias_key)),
    'sample', coalesce((select jsonb_agg(p.a_name || ' / ' || p.b_name || ' [' || p.cc || '] ' || coalesce(p.km::text, '?') || ' km')
                          from (select * from pairs order by km nulls last limit 40) p), '[]'::jsonb)
  )
$fn$;

revoke all on function public.city_name_twin_signals() from public, anon, authenticated;
grant execute on function public.city_name_twin_signals() to service_role;

do $$
declare v jsonb;
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_zz_city_alias_sync'
                   and tgrelid = 'public.cities'::regclass and tgenabled <> 'D') then
    raise exception 'trg_zz_city_alias_sync not attached';
  end if;
  v := public.city_name_twin_signals();
  if not coalesce((v->>'probe_ok')::boolean, false) then
    raise exception 'city_name_twin_signals probe failed: %', v;
  end if;
  if (v->>'colliding_aliases')::int <> 0 then
    raise exception 'colliding city aliases remain: %', v->>'colliding_aliases';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_city_alias_reject_collision'
                   and tgrelid = 'public.city_aliases'::regclass and tgenabled <> 'D') then
    raise exception 'trg_city_alias_reject_collision not attached';
  end if;
  raise notice 'city_name_twin_signals: %', v;
end $$;
