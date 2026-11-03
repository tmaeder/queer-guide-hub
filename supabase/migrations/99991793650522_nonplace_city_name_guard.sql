-- Non-place city names: delete the shells, refuse new ones at the door.
--
-- /admin/geography listed "Carrera 13 # 8-34, Barrio el Estero." as a city -- a Colombian street
-- address that the Photon/Nominatim venue geocoder (data_source 'nominatim-geocode') handed to
-- city_resolve_or_create as a locality name. A corpus-wide pattern sweep found nine more live
-- rows of the same kind and ZERO false positives among the real cities:
--
--   address / code      Carrera 13 # 8-34, Barrio el Estero.   RT 14 (Indonesian rukun tetangga)
--   building            Lenox Hill Hospital   St. Joseph Medical Center   South Woodford tube station
--   infobox residue     Season 2   Season 3   7th place   --N/a   (personality birth-place text)
--   placeholder         Unknown   -- KEPT: 1 venue + 4 events point at it, not this file's decision
--
-- 1. city_name_nonplace_reason(text): IMMUTABLE classifier, returns a reason or NULL. Deliberately
--    narrow. `hospital` only at the END of a multi-word name and never after do/da/de/del
--    ("Oliveira do Hospital" is a Portuguese town; bare "Hospital" is a village in Limerick),
--    a house-number range needs digits on BOTH sides ("Comuna 10 - La Candelaria" is a real
--    commune), and a street word only counts when a number follows it ("Road Town", "St. Gallen").
-- 2. city_resolve_or_create refuses to CREATE such a name (`nonplace_name:<reason>`), placed after
--    every match arm and before the 2 km proximity check and create path. Matching is
--    untouched, so an existing row is still found. Patched by exactly-once anchor on the LIVE
--    definition (the 99991791903202 precedent), never restated.
-- 3. Backstop BEFORE trigger trg_cities_a0_reject_nonplace_name: every future path that bypasses
--    the resolver. Named a0 so it fires before trg_cities_aa_split_name.
-- 4. Repair. Owner decision: delete only rows nothing real points at. Two link classes are
--    resolved first because neither is content:
--      * a venue-identity organization whose city_id is stale -- repointed to its venue's city;
--      * a personality whose ONLY birth-place evidence is the garbage text itself -- link and text
--        both cleared (the text IS the defect: "Season 3" is a Drag Race season, not a birthplace).
--    Anything still linked afterwards is SKIPPED, not raised (soft precondition, hard postcondition).
--    Every deleted row is snapshotted into nonplace_city_deletion_audit (20261001120000).

create or replace function public.city_name_nonplace_reason(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select case
    when p_name is null then null
    when p_name ~ '[#@]' then 'symbol'
    when p_name ~* 'https?:|www\.' then 'url'
    when p_name ~* '^\s*(carrera|cra|calle|cl|avenida|av|avda|rua|travessa|street|st|road|rd|via|viale|strasse|straße|str|ulica|ul|jalan|jl)\.?\s+\d' then 'street_address'
    when p_name ~ '\d+\s*-\s*\d+' then 'house_number_range'
    when p_name ~* '\w (?<!\m(do|da|de|dos|das|del|di|du) )hospital\s*$' then 'building'
    when p_name ~* '(\mtube station|\mrailway station|\mairport)\s*$' then 'building'
    when p_name ~* '\mmedical cent(er|re)\M' then 'building'
    when p_name ~* '^\s*(season|episode|series|part)\s+\d+\s*$' then 'media_label'
    when p_name ~* '^\s*\d+(st|nd|rd|th)\s+place\s*$' then 'media_label'
    when p_name ~* '^\W*(n/?a|null|none|unknown|tbd|tba|test)\W*$' then 'placeholder'
    when p_name ~* '^\s*(rt|rw)\s*\.?\s*\d+' then 'neighbourhood_unit'
  end
$fn$;

comment on function public.city_name_nonplace_reason(text) is
  'Returns why a string is not a settlement name (street address, building, media label, placeholder, neighbourhood unit), or NULL. Used by city_resolve_or_create and trg_cities_a0_reject_nonplace_name. Narrow by design: zero hits among real cities when introduced.';

grant execute on function public.city_name_nonplace_reason(text) to anon, authenticated, service_role;

-- 2. Resolver guard -------------------------------------------------------------------------------
do $patch$
declare
  v_src    text;
  v_anchor text := E'  -- No identity hit. Refuse near a different city (< 2 km).\n';
  v_guard  text := E'  IF coalesce(public.city_name_nonplace_reason(v_base), public.city_name_nonplace_reason(p_name)) IS NOT NULL THEN\n'
                || E'    RETURN QUERY SELECT NULL::uuid, ''refused'', ''none'', 0::numeric,\n'
                || E'      ''nonplace_name:'' || coalesce(public.city_name_nonplace_reason(v_base), public.city_name_nonplace_reason(p_name)), NULL::jsonb; RETURN;\n'
                || E'  END IF;\n\n';
  v_n      integer;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'city_resolve_or_create';

  if v_src is null then
    raise exception 'city_resolve_or_create not found';
  end if;

  if position('city_name_nonplace_reason' in v_src) > 0 then
    raise notice 'city_resolve_or_create already carries the non-place guard -- nothing to do';
    return;
  end if;

  v_n := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if coalesce(v_n, 0) <> 1 then
    raise exception 'create anchor occurs % times, expected exactly 1 -- refusing to patch', v_n;
  end if;

  execute replace(v_src, v_anchor, v_guard || v_anchor);
end
$patch$;

-- 4. Repair (before the trigger exists, so nothing here can trip it) -----------------------------
drop table if exists _nonplace_names;
create temp table _nonplace_names on commit drop as
select c.id, c.name, public.city_name_nonplace_reason(c.name) as reason
from public.cities c
where c.duplicate_of_id is null
  and public.city_name_nonplace_reason(c.name) is not null;

-- 4a. Stale venue-identity organizations: follow the venue.
update public.organizations o
set city_id = v.city_id
from public.venues v
where o.city_id in (select id from _nonplace_names)
  and o.primary_venue_id = v.id
  and v.city_id is not null
  and v.city_id <> o.city_id;

-- 4b. Personalities whose birth/death place is the garbage text itself.
update public.personalities p
set city_id = null,
    birth_place = case when p.birth_place = t.name then null else p.birth_place end
from _nonplace_names t
where p.city_id = t.id
  and (p.birth_place is null or p.birth_place = t.name);

update public.personalities p
set death_city_id = null,
    death_place = case when p.death_place = t.name then null else p.death_place end
from _nonplace_names t
where p.death_city_id = t.id
  and (p.death_place is null or p.death_place = t.name);

-- 4c. Anything still linked to real content is kept.
delete from _nonplace_names t
where exists (select 1 from public.venues v where v.city_id = t.id)
   or exists (select 1 from public.events e where e.city_id = t.id)
   or exists (select 1 from public.hotels h where h.city_id = t.id)
   or exists (select 1 from public.organizations o where o.city_id = t.id)
   or exists (select 1 from public.personalities p where p.city_id = t.id or p.death_city_id = t.id)
   or exists (select 1 from public.queer_villages q where q.city_id = t.id)
   or exists (select 1 from public.news_article_cities n where n.city_id = t.id)
   or exists (select 1 from public.news_articles a where t.id = any(a.city_ids))
   or exists (select 1 from public.milestones m where m.city_id = t.id)
   or exists (select 1 from public.guides g where g.city_id = t.id)
   or exists (select 1 from public.festivals f where f.city_id = t.id)
   or exists (select 1 from public.trip_destinations td where td.city_id = t.id)
   or exists (select 1 from public.trip_places tp where tp.city_id = t.id)
   or exists (select 1 from public.trips tr where tr.primary_city_id = t.id)
   or exists (select 1 from public.city_favorites cf where cf.city_id = t.id)
   or exists (select 1 from public.user_travel_preferences u where u.home_city_id = t.id)
   or exists (select 1 from public.geo_places g where g.parent_id = t.id)
   or exists (select 1 from public.cities d where d.duplicate_of_id = t.id);

insert into public.nonplace_city_deletion_audit (city_id, city_name, country_code, reason, city_row, spine_row, refs)
select c.id, c.name,
       (select co.code from public.countries co where co.id = c.country_id),
       'name_pattern:' || t.reason,
       to_jsonb(c),
       (select to_jsonb(g) from public.geo_places g where g.id = c.id),
       jsonb_build_object('migration', '99991793650522_nonplace_city_name_guard')
from public.cities c
join _nonplace_names t on t.id = c.id;

delete from public.city_quality_signals     where city_id in (select id from _nonplace_names);
delete from public.city_coverage_gaps       where city_id in (select id from _nonplace_names);
delete from public.city_review_queue_legacy where city_id in (select id from _nonplace_names);
delete from public.image_asset_links        where entity_id in (select id from _nonplace_names);
delete from public.content_embeddings       where content_type = 'city' and content_id in (select id from _nonplace_names);

delete from public.cities where id in (select id from _nonplace_names);

-- 3. Backstop trigger ----------------------------------------------------------------------------
create or replace function public.cities_reject_nonplace_name()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_reason text;
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name then
    return new;
  end if;
  v_reason := public.city_name_nonplace_reason(new.name);
  if v_reason is not null then
    raise exception 'city name % is not a place (%)', quote_literal(new.name), v_reason
      using errcode = '22023',
            hint = 'Addresses, buildings, media labels and placeholders are not cities; see city_name_nonplace_reason().';
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_cities_a0_reject_nonplace_name on public.cities;
create trigger trg_cities_a0_reject_nonplace_name
  before insert or update of name on public.cities
  for each row execute function public.cities_reject_nonplace_name();

-- Postconditions ---------------------------------------------------------------------------------
do $verify$
declare
  v_bad  integer;
  v_r    record;
begin
  -- P1: every live non-place row left is one with real content attached.
  select count(*) into v_bad
  from public.cities c
  where c.duplicate_of_id is null
    and public.city_name_nonplace_reason(c.name) is not null
    and not exists (select 1 from public.venues v where v.city_id = c.id)
    and not exists (select 1 from public.events e where e.city_id = c.id)
    and not exists (select 1 from public.hotels h where h.city_id = c.id)
    and not exists (select 1 from public.organizations o where o.city_id = c.id)
    and not exists (select 1 from public.personalities p where p.city_id = c.id or p.death_city_id = c.id);
  if v_bad <> 0 then
    raise exception 'P1 failed: % unlinked non-place city row(s) survived', v_bad;
  end if;

  -- P2: the classifier still refuses the motivating name and still accepts real ones.
  if public.city_name_nonplace_reason('Carrera 13 # 8-34, Barrio el Estero.') is null then
    raise exception 'P2 failed: motivating address not classified';
  end if;
  if coalesce(public.city_name_nonplace_reason('Oliveira do Hospital'),
              public.city_name_nonplace_reason('Road Town'),
              public.city_name_nonplace_reason('St. Gallen'),
              public.city_name_nonplace_reason('Comuna 10 - La Candelaria'),
              public.city_name_nonplace_reason('Chester-le-Street')) is not null then
    raise exception 'P2 failed: a real city name was classified as a non-place';
  end if;

  -- P3: the resolver refuses to create one (no network, no write: refused before the INSERT).
  select * into v_r from public.city_resolve_or_create(
    p_name => 'Calle 5 # 3-2', p_country_code => 'CO', p_lat => 4.6, p_lng => -74.08,
    p_source_slug => 'migration-verify', p_actor => 'migration');
  if v_r.action is distinct from 'refused' or v_r.reason not like 'nonplace_name:%' then
    raise exception 'P3 failed: resolver returned % / %', v_r.action, v_r.reason;
  end if;

  -- P4: the backstop trigger is attached and enabled.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.cities'::regclass
      and tgname = 'trg_cities_a0_reject_nonplace_name'
      and tgenabled <> 'D'
  ) then
    raise exception 'P4 failed: trg_cities_a0_reject_nonplace_name missing or disabled';
  end if;
end
$verify$;
