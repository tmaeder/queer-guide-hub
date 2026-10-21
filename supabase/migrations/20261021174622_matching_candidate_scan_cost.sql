-- Normalize each event once before joining the venue catalogue.
-- Candidate batches must contain matchable events, not the same newest unmatched rows.
create or replace function public.find_event_venue_candidates(
 p_limit integer default 500,p_active_only boolean default true)
returns table(event_id uuid,venue_id uuid,event_venue_name text,venue_name text,name_exact boolean,distance_m numeric)
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 with eligible as materialized (
 select e.id,e.venue_name,e.city_id,e.country_id,e.latitude,e.longitude,e.start_date,
  public.normalize_name(e.venue_name) venue_norm
 from public.events e where e.venue_id is null and nullif(btrim(e.venue_name),'') is not null
  and e.city_id is not null and e.duplicate_of_id is null and e.is_public
  and coalesce(e.status,'active') not in ('archived','cancelled')
  and (not p_active_only or e.start_date is null or e.start_date>=now()-interval '1 year')
  and not exists(select 1 from public.cities c where c.duplicate_of_id is null and lower(btrim(c.name))=lower(btrim(e.venue_name)))
  and not exists(select 1 from public.queer_villages q where lower(btrim(q.name))=lower(btrim(e.venue_name)))
 ), candidates as materialized (
 select e.id event_id,v.id venue_id,e.venue_name event_venue_name,v.name venue_name,
  coalesce(v.name_normalized,public.normalize_name(v.name))=e.venue_norm name_exact,e.start_date,
  case when e.latitude is not null and e.longitude is not null and v.latitude is not null and v.longitude is not null
   then round((2*6371000*asin(least(1.0::float8,sqrt(
    power(sin(radians((v.latitude-e.latitude)::float8)/2),2)+cos(radians(e.latitude::float8))*cos(radians(v.latitude::float8))*
    power(sin(radians((v.longitude-e.longitude)::float8)/2),2)))))::numeric,1) end distance_m
 from eligible e join public.venues v on v.city_id=e.city_id
  and v.duplicate_of_id is null and v.closed_at is null
  and (e.country_id is null or v.country_id=e.country_id)
 where e.venue_norm<>'' and (coalesce(v.name_normalized,public.normalize_name(v.name))=e.venue_norm
   or extensions.similarity(coalesce(v.name_normalized,public.normalize_name(v.name)),e.venue_norm)>=0.80)
 ), batch as (
  select c.event_id from candidates c group by c.event_id
  order by (count(*) filter(where name_exact)=1) desc,max(start_date) desc nulls last,c.event_id
  limit greatest(0,least(coalesce(p_limit,500),2000))
 )
 select c.event_id,c.venue_id,c.event_venue_name,c.venue_name,c.name_exact,c.distance_m
 from candidates c join batch b using(event_id)
 order by c.event_id,c.name_exact desc,c.distance_m nulls last,c.venue_id
$$;
