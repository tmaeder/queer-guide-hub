-- Geography CMS search: a hit is a place whose OWN name matches, listed once.
--
-- /admin/geography?q=berlin listed Friedrichshain, Kreuzberg, Mitte, Neukölln,
-- Prenzlauer Berg and Schöneberg flat beside Berlin, and again as Berlin's
-- children when its row was expanded. The search arm of
-- api_private.geo_cms_browse matched three things:
--
--   g.name ilike q                                   -- the place itself
--   or co.name ilike q                               -- its COUNTRY's name
--   or exists(cities where id = g.city_id and name ilike q)  -- its CITY's name
--
-- so every village of Berlin matched "berlin", and searching "germany" listed
-- every city and village in Germany as top-level rows. Expanding a row loads
-- its children unfiltered, so each descendant showed up twice.
--
-- Now: only the place's own name matches, and a match is dropped when an
-- ANCESTOR also matches (a village "Berlin-Mitte" under Berlin, the city
-- Luxembourg under the country Luxembourg) -- that ancestor is in the result
-- and the row is reachable by expanding it. The ancestor rule applies only
-- when no type/status filter is set: those filters can drop the ancestor from
-- the result, and hiding a child whose ancestor is not listed would lose it.
-- Continent/region filters act on the country, which ancestor and child share.
--
-- Body restated from the live definition (pg_get_functiondef), not from an
-- older migration file; only the search arm changes.

create or replace function api_private.geo_cms_browse(p_parent_id uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_type text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_continent_id uuid DEFAULT NULL::uuid, p_region_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_rows jsonb; v_total bigint; v_q text := nullif(btrim(p_search),'');
begin
  perform public.geo_cms_assert_reader();
  if p_type is not null and p_type not in ('country','city','village') then raise exception 'Invalid geography type'; end if;
  with matches as (
    select g.id,g.name from geo_places g join countries co on co.id=g.country_id left join geo_cms_verifications vf on vf.place_id=g.id
    where g.place_type in ('country','city','village') and g.duplicate_of_id is null
      and (p_type is null or g.place_type=p_type) and (p_status is null or (case when vf.place_id is not null and vf.fingerprint is distinct from public.geo_cms_fingerprint(g.id) then 'stale' else coalesce(vf.status,'missing') end)=p_status)
      and (p_continent_id is null or co.continent_id=p_continent_id)
      and (p_region_id is null or co.region_id=p_region_id)
      and (case when v_q is not null then
               g.name ilike '%'||v_q||'%'
               and (p_type is not null or p_status is not null or not (
                     (g.place_type in ('city','village') and co.name ilike '%'||v_q||'%')
                     or (g.place_type='village' and exists(select 1 from cities ci where ci.id=g.city_id and ci.name ilike '%'||v_q||'%'))))
        when p_type is not null or p_status is not null then true when p_parent_id is null then g.place_type='country' else g.parent_id=p_parent_id end)
  ), page as (select * from matches order by name,id offset greatest(p_offset,0) limit 50)
  select (select count(*) from matches),coalesce((select jsonb_agg(public.geo_cms_list_record(id) order by name,id) from page),'[]'::jsonb)
  into v_total,v_rows;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $function$;

do $verify$
declare v_src text := regexp_replace(pg_get_functiondef('api_private.geo_cms_browse(uuid,text,text,integer,uuid,uuid,text)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
begin
  if position('or co.name ilike' in v_src) > 0 then
    raise exception 'geo_cms_browse still matches a place by its country name';
  end if;
  if position('not (' in v_src) = 0 then
    raise exception 'geo_cms_browse lost the ancestor-match exclusion';
  end if;
end $verify$;
