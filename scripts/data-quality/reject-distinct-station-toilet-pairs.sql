-- Bounded rejection of name-only duplicates between distinct station toilets.
-- Default dry run. Coordinates/address are checked live; no venue is merged.
-- The existing rejection RPC records the decision and the dedup sweep remembers it.
begin;
do $repair$
declare dry_run boolean:=true; r record; evidence jsonb; results jsonb:='[]';
begin
 for r in
  select q.id,q.keep_id,q.drop_id,a.name keep_name,b.name drop_name,a.address keep_address,b.address drop_address,
   public.haversine_m(a.latitude::numeric,a.longitude::numeric,b.latitude::numeric,b.longitude::numeric) distance_m
  from public.dedup_review_queue q join public.venues a on a.id=q.keep_id join public.venues b on b.id=q.drop_id
  where q.id=any(array['bfb97082-51ef-45e1-adf4-99761bbd84ef','31556cc7-f33f-4ae5-b96f-dcf597959e02','774e9b72-476f-47cd-8333-5b477d80bfcd']::uuid[])
   and q.status='open' and q.entity_type='venue' and q.reason='cross_city_name_only'
   and a.duplicate_of_id is null and b.duplicate_of_id is null
   and a.country_id=b.country_id and a.country_id is not null
   and public.dedup_despace(a.name)='bahnhofwc' and public.dedup_despace(b.name)='bahnhofwc'
   and nullif(btrim(a.address),'') is not null and nullif(btrim(b.address),'') is not null
   and lower(btrim(a.address))<>lower(btrim(b.address))
   and nullif(btrim(a.phone),'') is null and nullif(btrim(b.phone),'') is null
   and nullif(btrim(a.website_domain),'') is null and nullif(btrim(b.website_domain),'') is null
   and public.haversine_m(a.latitude::numeric,a.longitude::numeric,b.latitude::numeric,b.longitude::numeric)>20000
  order by q.id for update of q,a,b
 loop
  evidence:=jsonb_build_object('contract','distinct-station-toilets:v1','source','live_venue_records',
    'keep_id',r.keep_id,'drop_id',r.drop_id,'keep_address',r.keep_address,'drop_address',r.drop_address,
    'distance_m',r.distance_m,'human_reviewed',false);
  if not dry_run then
   perform public.reject_dedup_review(r.id,'Automatic rejection: different station toilets; exact generic name only. '||evidence::text);
  end if;
  results:=results||jsonb_build_array(jsonb_build_object('id',r.id,'evidence',evidence));
 end loop;
 perform set_config('matching_distinct_toilets.result',jsonb_build_object('dry_run',dry_run,'pairs',jsonb_array_length(results),'results',results)::text,true);
end $repair$;
select current_setting('matching_distinct_toilets.result')::jsonb result;
commit;
