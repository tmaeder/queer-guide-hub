-- Overseas French territories: stop minting "France" duplicates of their cities.
--
-- On 2026-10-08 a data repair moved 38 city rows (and 101 venues) out of
-- `FR` into the territory they actually sit in — GF, GP, MQ, RE, YT, PM, BL,
-- MF, NC, WF, TF, PF — after finding them by coordinates. Within seven hours
-- the nightly venue geocoder had minted 16 NEW `FR` rows for the same places
-- (Kourou, Le Vauclin, Les Abymes, Saint Martin, …), every one an empty
-- duplicate of a row the repair had just re-filed.
--
-- The cause is the geocoder's country, not the resolver's logic: Nominatim
-- reports `country_code = "fr"` for many places in the overseas departments,
-- because they are legally part of France. `backfill-venue-cities` passes that
-- code to `city_resolve_or_create`, every name arm is scoped to
-- `country_id = FR`, the territory row is invisible from there, and the
-- resolver creates. Each fix that re-files rows by coordinates is therefore
-- undone by the next nightly run.
--
-- The fix lives in the resolver, not in the edge function, because the
-- resolver is the one place every city creator goes through: when the caller
-- says FR and the coordinates fall inside an overseas territory, resolve (and,
-- if it must, create) under the territory. A caller that passes no coordinates
-- is unaffected — there is no evidence to override the stated country with.
--
-- The bounding boxes are coarse on purpose and tested against the corpus: none
-- overlaps metropolitan France or any other country's mainland. Saint-Martin's
-- southern edge (18.058) sits north of the Dutch side's settlements, so a point
-- on Sint Maarten is never re-filed as MF.
--
-- The resolver body is PATCHED from its live definition (pg_get_functiondef),
-- never restated: restating a 13 KB function from a repo file silently reverts
-- whatever later migrations changed by string surgery. Every anchor is asserted
-- to occur exactly once before the replacement is applied.

create or replace function public.french_overseas_country_code(p_lat numeric, p_lng numeric)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $$
  select t.code
    from (values
      ('GP', 15.8, 16.6, -61.9, -60.9),
      ('MQ', 14.3, 14.95, -61.3, -60.75),
      ('GF', 2.0, 6.0, -54.7, -51.5),
      ('RE', -21.5, -20.8, 55.1, 55.9),
      ('YT', -13.1, -12.6, 44.9, 45.4),
      ('PM', 46.7, 47.2, -56.5, -56.1),
      ('BL', 17.85, 17.97, -62.95, -62.78),
      ('MF', 18.058, 18.13, -63.16, -62.96),
      ('NC', -23.0, -19.5, 163.0, 168.5),
      ('WF', -14.5, -13.0, -178.5, -176.0),
      ('TF', -50.0, -37.0, 50.0, 78.0),
      ('PF', -28.0, -7.0, -155.0, -134.0)
    ) t(code, la1, la2, lo1, lo2)
   where p_lat is not null and p_lng is not null
     and p_lat between t.la1 and t.la2
     and p_lng between t.lo1 and t.lo2
   limit 1
$$;

comment on function public.french_overseas_country_code(numeric, numeric) is
  'ISO2 of the French overseas territory containing (lat,lng), or NULL. Used by city_resolve_or_create to correct a geocoder that reports FR for an overseas place.';

revoke all on function public.french_overseas_country_code(numeric, numeric) from public, anon;

-- Patch the resolver.
do $patch$
declare
  v_def text := pg_get_functiondef('public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text)'::regprocedure);
  v_decl_anchor text := '  v_admin       boolean := (p_actor = ''admin'');';
  v_cc_anchor   text := '  SELECT c.code INTO v_country_cc FROM public.countries c WHERE c.id = v_country_id;';
  v_new text;
begin
  if regexp_replace(v_def, '--[^' || chr(10) || ']*', '', 'g') like '%french_overseas_country_code%' then
    raise notice 'city_resolve_or_create already patched; skipping';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_decl_anchor, ''))) / length(v_decl_anchor) <> 1 then
    raise exception 'declare anchor not found exactly once in city_resolve_or_create';
  end if;
  if (length(v_def) - length(replace(v_def, v_cc_anchor, ''))) / length(v_cc_anchor) <> 1 then
    raise exception 'country-code anchor not found exactly once in city_resolve_or_create';
  end if;

  v_new := replace(v_def, v_decl_anchor, v_decl_anchor || E'\n  v_overseas    text;');
  v_new := replace(v_new, v_cc_anchor, v_cc_anchor || $ins$

  -- Nominatim reports "fr" for many places in France's overseas territories.
  -- With coordinates inside one, resolve under the territory instead, or every
  -- name arm below misses the territory's row and a France duplicate is minted.
  IF v_country_cc = 'FR' THEN
    v_overseas := public.french_overseas_country_code(p_lat, p_lng);
    IF v_overseas IS NOT NULL THEN
      SELECT c.id INTO v_country_id FROM public.countries c
       WHERE c.code = v_overseas AND c.duplicate_of_id IS NULL LIMIT 1;
      v_country_cc := v_overseas;
    END IF;
  END IF;$ins$);

  execute v_new;
end
$patch$;

-- Clean up the France duplicates minted before the fix: merge each into its
-- territory twin (same canonical key in the same territory), re-file the rest.
-- There is deliberately NO distance gate: French Guiana's communes are among
-- the largest in France (Maripasoula ~18,000 km2), and the geocoder's point for
-- one can sit 38 km (Maripasoula) or even 228 km (Saint-Laurent-du-Maroni)
-- from the existing row's. A commune name is unique within one territory, so
-- the name inside the territory is the identity; a 10 km gate left those two
-- unmerged and the re-file then hit idx_cities_name_country_unique.
do $cleanup$
declare
  v_fr uuid := (select id from public.countries where code = 'FR');
  r record;
  v_merged int := 0;
  v_moved int;
begin
  for r in
    select oc.id as drop_id, tw.id as keep_id
      from public.cities oc
      join public.countries tc on tc.code = public.french_overseas_country_code(oc.latitude, oc.longitude)
      join public.cities tw on tw.country_id = tc.id and tw.duplicate_of_id is null
                            and tw.canonical_key = oc.canonical_key and tw.id <> oc.id
     where oc.country_id = v_fr and oc.duplicate_of_id is null
  loop
    perform public.merge_cities(r.keep_id, r.drop_id, true);
    v_merged := v_merged + 1;
  end loop;

  update public.cities ci
     set country_id = tc.id,
         enrichment_status = coalesce(ci.enrichment_status, '{}'::jsonb) || jsonb_build_object('country_repair',
           jsonb_build_object('from', 'FR', 'to', tc.code, 'by', 'migration:99991791494561',
                              'at', now(), 'reason', 'coordinates_in_overseas_territory'))
    from public.countries tc
   where tc.code = public.french_overseas_country_code(ci.latitude, ci.longitude)
     and ci.country_id = v_fr and ci.duplicate_of_id is null;
  get diagnostics v_moved = row_count;

  raise notice 'overseas cleanup: merged %, re-filed %', v_merged, v_moved;
end
$cleanup$;

-- Postconditions.
do $verify$
declare
  v_bad int;
  v_hit uuid;
  v_kourou uuid;
begin
  select count(*) into v_bad
    from public.cities
   where country_id = (select id from public.countries where code = 'FR')
     and duplicate_of_id is null
     and public.french_overseas_country_code(latitude, longitude) is not null;
  if v_bad <> 0 then
    raise exception 'postcondition: % FR city rows still sit in an overseas territory', v_bad;
  end if;

  if regexp_replace(
       pg_get_functiondef('public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text)'::regprocedure),
       '--[^' || chr(10) || ']*', '', 'g')
       not like '%french_overseas_country_code(p_lat, p_lng)%' then
    raise exception 'postcondition: city_resolve_or_create is not patched';
  end if;

  -- Behavioural check, no write: Kourou reported as FR with its coordinates
  -- must resolve to the French Guiana row, never be created.
  select c.id into v_kourou
    from public.cities c join public.countries co on co.id = c.country_id
   where co.code = 'GF' and c.canonical_key = 'kourou' and c.duplicate_of_id is null
   limit 1;
  if v_kourou is not null then
    select r.city_id into v_hit
      from public.city_resolve_or_create(p_name => 'Kourou', p_country_code => 'FR',
             p_lat => 5.1620751, p_lng => -52.6416273, p_allow_create => false) r;
    if v_hit is distinct from v_kourou then
      raise exception 'postcondition: FR+Kourou coordinates resolved to %, expected GF row %', v_hit, v_kourou;
    end if;
  end if;

  -- Mirror: a metropolitan point reported as FR must stay in FR.
  if public.french_overseas_country_code(48.8566, 2.3522) is not null then
    raise exception 'postcondition: Paris classified as overseas';
  end if;
end
$verify$;
